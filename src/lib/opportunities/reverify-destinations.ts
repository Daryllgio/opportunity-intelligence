/**
 * Continuous destination re-verification — the self-healing loop behind the
 * Apply promise.
 *
 * Published links rot: pages get repurposed, cycles close, portals move.
 * Every night the lifecycle cron pushes a rotating batch of visible
 * opportunities through the same AI verifier used at publish time:
 *
 *   verified        → mark verified, move on
 *   closed/expired  → expire the opportunity (scores go stale downstream)
 *   wrong/dead      → re-run the full ranker (which itself verifies);
 *                     a confirmed replacement updates the row, otherwise the
 *                     opportunity is pulled from browse and flagged for review
 *
 * Rotation is by updated_at ascending, so the least-recently-touched rows are
 * always re-checked first and the whole catalog cycles continuously.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyApplicationDestination } from "@/lib/discovery/verify-destination";
import { rankApplicationDestination } from "@/lib/discovery/application-destination-ranker";

export type ReverifySummary = {
  checked: number;
  confirmed: number;
  repaired: number;
  expired: number;
  pulledForReview: number;
  unverifiable: number;
  details: string[];
};

export async function reverifyPublishedDestinations({
  supabase,
  limit = 15,
}: {
  supabase: SupabaseClient;
  limit?: number;
}): Promise<ReverifySummary> {
  const summary: ReverifySummary = {
    checked: 0,
    confirmed: 0,
    repaired: 0,
    expired: 0,
    pulledForReview: 0,
    unverifiable: 0,
    details: [],
  };

  const { data: rows, error } = await supabase
    .from("opportunities")
    .select(
      "id, title, provider, type, deadline, source_url, application_url, application_destination_url, review_flags, updated_at"
    )
    .eq("is_active", true)
    .eq("is_approved", true)
    .eq("lifecycle_status", "active")
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    summary.details.push(`query failed: ${error.message}`);
    return summary;
  }

  const now = () => new Date().toISOString();

  for (const row of rows || []) {
    summary.checked += 1;
    const destination =
      row.application_destination_url || row.application_url || row.source_url;

    if (!destination) {
      await pullForReview(supabase, row.id, "No destination URL on record.");
      summary.pulledForReview += 1;
      continue;
    }

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
          last_recheck_error: null,
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
          updated_at: now(),
        })
        .eq("id", row.id);
      summary.expired += 1;
      summary.details.push(`expired: ${row.title}`);
      continue;
    }

    if (verdict.verdict === "unverifiable") {
      // Capture failed — count it, leave the row, it re-rotates next run.
      // Repeated capture failures surface via last_recheck_error.
      await supabase
        .from("opportunities")
        .update({
          last_recheck_error: `Destination unverifiable: ${verdict.reason}`,
          updated_at: now(),
        })
        .eq("id", row.id);
      summary.unverifiable += 1;
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
          last_recheck_error: null,
          updated_at: now(),
        })
        .eq("id", row.id);
      summary.repaired += 1;
      summary.details.push(
        `repaired: ${row.title} -> ${replacement.applicationDestinationUrl}`
      );
      continue;
    }

    if (replacement.verificationVerdict === "degree_or_admissions") {
      // Not a link problem — the record itself is out of scope.
      await supabase
        .from("opportunities")
        .update({
          is_active: false,
          is_approved: false,
          lifecycle_status: "archived",
          archived_at: now(),
          application_note:
            "Removed: verifier identified this as a degree/admissions record.",
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId);
}
