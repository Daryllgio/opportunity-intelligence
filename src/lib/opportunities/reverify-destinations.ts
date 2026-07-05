/**
 * Continuous destination re-verification — the self-healing loop behind the
 * Apply promise, tiered so accuracy stays high while AI spend stays low.
 *
 * Tier 0 — scheduling. Every active row has a re-check cadence based on how
 * likely its page is to rot and how much a failure would hurt:
 *   trusted domains (.gov/.edu, trusted sources)  every 14 days
 *   everything else                               every 7 days
 *   saved by at least one user                    every 4 days
 *   deadline within 14 days                       every 3 days
 *   last check failed                             next night
 *
 * Tier 1 — cheap change detection. A plain fetch + content hash costs
 * nothing. If the page is reachable and its cleaned text hashes identically
 * to what the AI verifier last approved, the link is confirmed without
 * spending a model call. Because hashes make confirms nearly free, one night
 * can sweep the whole catalog instead of a 15-row slice.
 *
 * Tier 2 — AI verification, budgeted. Hash changed, fetch failed, first
 * check, or verification older than MAX_VERIFIED_AGE_DAYS (JS shells can
 * hash stable while rendered content changes) → the real verifier reads the
 * page. Verdicts: confirmed / expired / repaired via the ranker / pulled
 * from browse. Unreachable three checks in a row also pulls the row — a dead
 * link must not stay live while we shrug.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyApplicationDestination } from "@/lib/discovery/verify-destination";
import { rankApplicationDestination } from "@/lib/discovery/application-destination-ranker";
import { looksLikeDegreeProgramRecord } from "@/lib/discovery/opportunity-scope";
import { fetchAndHashOpportunityPage } from "@/lib/opportunities/page-recheck";
import { tableHasColumn } from "@/lib/utils/schema-features";

export type ReverifySummary = {
  swept: number;
  cheapConfirmed: number;
  aiChecked: number;
  confirmed: number;
  repaired: number;
  expired: number;
  pulledForReview: number;
  unverifiable: number;
  deferredBudget: number;
  details: string[];
};

const TRUSTED_INTERVAL_DAYS = 14;
const STANDARD_INTERVAL_DAYS = 7;
const SAVED_INTERVAL_DAYS = 4;
const NEAR_DEADLINE_INTERVAL_DAYS = 3;
const FAILED_RETRY_DAYS = 1;
const MAX_UNREACHABLE_ATTEMPTS = 3;
const MAX_VERIFIED_AGE_DAYS = 30;

type ReverifyRow = Record<string, any>;

function daysSince(value: unknown): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
  return (Date.now() - parsed.getTime()) / 86400000;
}

function daysUntil(value: unknown): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
  return (parsed.getTime() - Date.now()) / 86400000;
}

function isTrustedDomain(row: ReverifyRow): boolean {
  if (row.source_trust === "trusted") return true;
  const url = String(
    row.application_destination_url || row.application_url || row.source_url || ""
  );
  try {
    const host = new URL(url).hostname;
    return /\.(gov|edu|gc\.ca|edu\.au|ac\.uk)$/.test(host) || host.endsWith(".mil");
  } catch {
    return false;
  }
}

export function recheckIntervalDays(row: ReverifyRow, savedCount: number): number {
  if ((row.recheck_attempts || 0) > 0) return FAILED_RETRY_DAYS;
  let interval = isTrustedDomain(row) ? TRUSTED_INTERVAL_DAYS : STANDARD_INTERVAL_DAYS;
  if (savedCount > 0) interval = Math.min(interval, SAVED_INTERVAL_DAYS);
  if (daysUntil(row.deadline) <= 14) interval = Math.min(interval, NEAR_DEADLINE_INTERVAL_DAYS);
  return interval;
}

export async function reverifyPublishedDestinations({
  supabase,
  aiBudget = 15,
  sweepLimit = 120,
}: {
  supabase: SupabaseClient;
  aiBudget?: number;
  sweepLimit?: number;
}): Promise<ReverifySummary> {
  const summary: ReverifySummary = {
    swept: 0,
    cheapConfirmed: 0,
    aiChecked: 0,
    confirmed: 0,
    repaired: 0,
    expired: 0,
    pulledForReview: 0,
    unverifiable: 0,
    deferredBudget: 0,
    details: [],
  };

  const hasVerifiedAt = await tableHasColumn(supabase, "opportunities", "last_verified_at");

  const { data: rows, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("is_active", true)
    .eq("is_approved", true)
    .eq("lifecycle_status", "active")
    .order("last_rechecked_at", { ascending: true, nullsFirst: true })
    .limit(sweepLimit);

  if (error) {
    summary.details.push(`query failed: ${error.message}`);
    return summary;
  }

  const ids = (rows || []).map((row) => row.id);
  const savedCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: saves } = await supabase
      .from("saved_opportunities")
      .select("opportunity_id")
      .in("opportunity_id", ids);
    for (const save of saves || []) {
      savedCounts.set(
        save.opportunity_id,
        (savedCounts.get(save.opportunity_id) || 0) + 1
      );
    }
  }

  const due = (rows || [])
    .filter(
      (row) =>
        daysSince(row.last_rechecked_at) >=
        recheckIntervalDays(row, savedCounts.get(row.id) || 0)
    )
    .sort((a, b) => {
      const savedDiff =
        (savedCounts.get(b.id) || 0) - (savedCounts.get(a.id) || 0);
      if (savedDiff !== 0) return savedDiff;
      return daysUntil(a.deadline) - daysUntil(b.deadline);
    });

  let aiCallsUsed = 0;
  const now = () => new Date().toISOString();

  for (const row of due) {
    summary.swept += 1;
    const destination =
      row.application_destination_url || row.application_url || row.source_url;

    if (!destination) {
      await pullForReview(supabase, row.id, "No destination URL on record.");
      summary.pulledForReview += 1;
      continue;
    }

    // Tier 1: reachability + content hash.
    const probe = await fetchAndHashOpportunityPage(destination);

    const verifiedRecentlyEnough = hasVerifiedAt
      ? daysSince(row.last_verified_at) <= MAX_VERIFIED_AGE_DAYS
      : Math.random() > 0.15; // pre-migration: ~1 in 7 confirms re-verifies fully

    if (
      probe.ok &&
      row.official_source_verified === true &&
      probe.cleanHash &&
      probe.cleanHash === row.last_clean_content_hash &&
      verifiedRecentlyEnough
    ) {
      await supabase
        .from("opportunities")
        .update({
          last_rechecked_at: now(),
          last_http_status: probe.status,
          recheck_attempts: 0,
          last_recheck_error: null,
          updated_at: now(),
        })
        .eq("id", row.id);
      summary.cheapConfirmed += 1;
      continue;
    }

    // Tier 2 needs a model call; respect tonight's budget. Skipped rows keep
    // their old last_rechecked_at, so they stay at the head of the queue.
    if (aiCallsUsed >= aiBudget) {
      summary.deferredBudget += 1;
      continue;
    }
    aiCallsUsed += 1;
    summary.aiChecked += 1;

    const verdict = await verifyApplicationDestination({
      title: row.title,
      provider: row.provider,
      type: row.type,
      deadline: row.deadline,
      url: destination,
    });

    if (verdict.ok) {
      await supabase
        .from("opportunities")
        .update({
          official_source_verified: true,
          official_source_status: "verified_destination",
          last_rechecked_at: now(),
          last_http_status: probe.ok ? probe.status : null,
          last_clean_content_hash: probe.ok ? probe.cleanHash : null,
          recheck_attempts: 0,
          last_recheck_error: null,
          ...(hasVerifiedAt ? { last_verified_at: now() } : {}),
          updated_at: now(),
        })
        .eq("id", row.id);
      summary.confirmed += 1;
      continue;
    }

    if (verdict.verdict === "expired_or_closed") {
      await supabase
        .from("opportunities")
        .update({
          is_active: false,
          lifecycle_status: "expired",
          expired_at: now(),
          application_status: "closed",
          application_note: `Verifier found applications closed: ${verdict.reason}`,
          last_rechecked_at: now(),
          updated_at: now(),
        })
        .eq("id", row.id);
      summary.expired += 1;
      summary.details.push(`expired: ${row.title}`);
      continue;
    }

    if (verdict.verdict === "unverifiable") {
      const attempts = (row.recheck_attempts || 0) + 1;
      if (attempts >= MAX_UNREACHABLE_ATTEMPTS) {
        await pullForReview(
          supabase,
          row.id,
          `Destination unreachable or unverifiable on ${attempts} consecutive checks: ${verdict.reason}`
        );
        summary.pulledForReview += 1;
        summary.details.push(`pulled (unreachable x${attempts}): ${row.title}`);
      } else {
        await supabase
          .from("opportunities")
          .update({
            last_recheck_error: `Destination unverifiable: ${verdict.reason}`,
            last_rechecked_at: now(),
            last_http_status: probe.ok ? probe.status : null,
            recheck_attempts: attempts,
            updated_at: now(),
          })
          .eq("id", row.id);
        summary.unverifiable += 1;
      }
      continue;
    }

    // The link is wrong (wrong_opportunity / login_wall / listing / degree /
    // unrelated). Ask the full ranker — which verifies internally — for a
    // replacement.
    const replacement = await rankApplicationDestination({
      title: row.title,
      provider: row.provider,
      type: row.type,
      sourceUrl: row.source_url,
      deadline: row.deadline,
    });

    if (replacement.destinationVerified && replacement.applicationDestinationUrl) {
      // Baseline the repaired page so future nights can cheap-confirm it.
      const repairedProbe = await fetchAndHashOpportunityPage(
        replacement.applicationDestinationUrl
      );
      await supabase
        .from("opportunities")
        .update({
          application_url: replacement.applicationDestinationUrl,
          application_destination_url: replacement.applicationDestinationUrl,
          application_destination_type: replacement.applicationDestinationType,
          destination_confidence: replacement.destinationConfidence,
          destination_reasons: replacement.destinationReasons,
          official_source_url: replacement.officialSourceUrl,
          official_source_verified: true,
          official_source_status: "verified_destination",
          application_note: "Destination repaired by re-verification.",
          last_rechecked_at: now(),
          last_http_status: repairedProbe.ok ? repairedProbe.status : null,
          last_clean_content_hash: repairedProbe.ok ? repairedProbe.cleanHash : null,
          recheck_attempts: 0,
          last_recheck_error: null,
          ...(hasVerifiedAt ? { last_verified_at: now() } : {}),
          updated_at: now(),
        })
        .eq("id", row.id);
      summary.repaired += 1;
      summary.details.push(
        `repaired: ${row.title} -> ${replacement.applicationDestinationUrl}`
      );
      continue;
    }

    // Archive as out-of-scope only when the record itself reads as a degree
    // program. A funding-named record (scholarship/fund/award in the title)
    // is pulled for human review instead — auto-archiving those cost us real
    // opportunities when a stray admissions page appeared among candidates.
    if (
      replacement.verificationVerdict === "degree_or_admissions" &&
      looksLikeDegreeProgramRecord({ title: row.title, text: "" }).isDegree
    ) {
      await supabase
        .from("opportunities")
        .update({
          is_active: false,
          is_approved: false,
          lifecycle_status: "archived",
          archived_at: now(),
          application_note:
            "Removed: verifier identified this as a degree/admissions record.",
          last_rechecked_at: now(),
          updated_at: now(),
        })
        .eq("id", row.id);
      summary.pulledForReview += 1;
      summary.details.push(`archived (degree/admissions): ${row.title}`);
      continue;
    }

    await pullForReview(
      supabase,
      row.id,
      `Destination failed verification (${verdict.verdict}: ${verdict.reason}) and no verified replacement was found.`
    );
    summary.pulledForReview += 1;
    summary.details.push(`pulled: ${row.title} (${verdict.verdict})`);
  }

  return summary;
}

/**
 * Baseline a freshly published, already-AI-verified destination: store its
 * content hash and verification timestamp so the nightly loop can
 * cheap-confirm it instead of spending a model call on night one.
 */
export async function baselineVerifiedDestination({
  supabase,
  opportunityId,
  url,
}: {
  supabase: SupabaseClientLike;
  opportunityId: string;
  url: string;
}) {
  try {
    const probe = await fetchAndHashOpportunityPage(url);
    if (!probe.ok || !probe.cleanHash) return;
    const hasVerifiedAt = await tableHasColumn(
      supabase,
      "opportunities",
      "last_verified_at"
    );
    await supabase
      .from("opportunities")
      .update({
        last_clean_content_hash: probe.cleanHash,
        last_http_status: probe.status,
        last_rechecked_at: new Date().toISOString(),
        ...(hasVerifiedAt ? { last_verified_at: new Date().toISOString() } : {}),
      })
      .eq("id", opportunityId);
  } catch {
    // Baseline is an optimization; never let it fail a publish.
  }
}

type SupabaseClientLike = {
  from: (table: string) => any;
};

async function pullForReview(
  supabase: SupabaseClient,
  opportunityId: string,
  note: string
) {
  await supabase
    .from("opportunities")
    .update({
      is_active: false,
      validation_decision: "review",
      official_source_verified: false,
      application_note: note,
      last_rechecked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId);
}
