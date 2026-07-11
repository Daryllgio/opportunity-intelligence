/**
 * Full-catalog audit — EVERY published opportunity, not a sample.
 *
 * Phase A (no AI): for every visible row — the founder-profile eligibility
 * decision with its reason, preference-gate decision, institution-grant
 * check, application-status sanity, one-score consistency, and the current
 * destination inventory.
 *
 * Phase B (--resolve, needs Gemini): re-resolves every row's destination
 * through the v2 resolver (search + hop expansion + AI selection + AI
 * verification) and adopts verified upgrades. Prints per-row before/after.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/audit-catalog.ts           # Phase A
 *   npx tsx --env-file=.env.local scripts/audit-catalog.ts --resolve # A + B
 */
import { createClient } from "@supabase/supabase-js";
import { tier1Eligibility } from "../src/lib/matching/tier1";
import { preferencesFromProfile } from "../src/lib/preferences/types";
import { preferenceExcludes } from "../src/lib/preferences/apply";
import { looksLikeInstitutionFacingGrant } from "../src/lib/discovery/opportunity-scope";
import { rankApplicationDestination } from "../src/lib/discovery/application-destination-ranker";
import { baselineVerifiedDestination } from "../src/lib/opportunities/reverify-destinations";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FOUNDER = "5c763c0f-1c8e-4e00-9b85-318cbf98a5cb";

function shortUrl(url: unknown): string {
  const text = String(url || "");
  return text.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60);
}

async function main() {
  const resolve = process.argv.includes("--resolve");

  const { data: founder } = await supabase
    .from("profiles").select("*").eq("id", FOUNDER).single();
  const preferences = preferencesFromProfile(founder!);

  const { data: rows } = await supabase
    .from("opportunities")
    .select("*")
    .eq("is_active", true)
    .eq("is_approved", true)
    .eq("lifecycle_status", "active")
    .order("title");

  const [{ data: batchScores }, { data: reports }] = await Promise.all([
    supabase.from("opportunity_competitiveness_scores")
      .select("opportunity_id, score, score_status").eq("user_id", FOUNDER).eq("score_status", "current"),
    supabase.from("opportunity_score_reports")
      .select("opportunity_id, overall_score").eq("user_id", FOUNDER),
  ]);
  const batchById = new Map((batchScores || []).map((s) => [s.opportunity_id, s.score]));
  const reportById = new Map((reports || []).map((r) => [r.opportunity_id, r.overall_score]));

  const counts = {
    total: rows?.length || 0,
    eligible: 0, uncertain: 0, ineligibleHidden: 0, prefHidden: 0,
    institutionGrants: 0, notOpenVisible: 0,
    destinationUpgraded: 0, destinationConfirmed: 0, destinationFailed: 0,
  };

  console.log(`AUDIT: ${counts.total} published rows | resolve destinations: ${resolve}\n`);
  console.log("| # | Opportunity | Founder sees | Why | Score (source) | Destination |");
  console.log("|---|---|---|---|---|---|");

  let index = 0;
  for (const row of rows || []) {
    index += 1;

    // Eligibility + preference decisions exactly as browse computes them.
    const tier1 = tier1Eligibility({ profile: founder!, opportunity: row });
    const pref = preferenceExcludes(founder!, preferences, row);

    let sees = "VISIBLE";
    let why = "eligible or unverifiable-only requirements";
    if (tier1.decision === "ineligible") {
      sees = "hidden";
      why = tier1.reasons[0] || "ineligible";
      counts.ineligibleHidden += 1;
    } else if (pref.excluded) {
      sees = "hidden";
      why = pref.reason || "preferences";
      counts.prefHidden += 1;
    } else if (tier1.decision === "eligible") {
      counts.eligible += 1;
      why = "meets every checkable requirement";
    } else {
      counts.uncertain += 1;
      why = tier1.uncertainChecks[0]
        ? `unverifiable: ${tier1.uncertainChecks[0].criterion.requirement.slice(0, 50)}`
        : "no stated requirements";
    }

    // Institution grant leak check (should always be zero post-purge).
    const grant = looksLikeInstitutionFacingGrant({
      title: row.title,
      url: `${row.source_url || ""} ${row.application_url || ""}`,
      text: `${row.description || ""} ${row.ai_summary || ""}`,
    });
    if (grant.isInstitutionGrant) counts.institutionGrants += 1;

    // Visibility sanity: no closed/not-yet-open rows here.
    if (["closed", "not_yet_open"].includes(String(row.application_status))) {
      counts.notOpenVisible += 1;
    }

    // One-score rule: what displays.
    const report = reportById.get(row.id);
    const batch = batchById.get(row.id);
    const scoreText =
      report !== undefined
        ? `${report} (report)`
        : batch !== undefined
          ? `${batch} (batch)`
          : "-";

    let destinationText = shortUrl(row.application_url);

    if (resolve) {
      try {
        const result = await rankApplicationDestination({
          title: String(row.title || ""),
          provider: row.provider ? String(row.provider) : null,
          type: row.type ? String(row.type) : null,
          sourceUrl: row.source_url ? String(row.source_url) : null,
          deadline: row.deadline ? String(row.deadline) : null,
        });
        if (result.destinationVerified && result.applicationDestinationUrl) {
          const changed = result.applicationDestinationUrl !== row.application_url;
          if (changed) {
            await supabase.from("opportunities").update({
              application_url: result.applicationDestinationUrl,
              application_destination_url: result.applicationDestinationUrl,
              application_destination_type: result.applicationDestinationType,
              destination_confidence: result.destinationConfidence,
              destination_reasons: result.destinationReasons.slice(0, 6),
              official_source_url: result.officialSourceUrl || row.source_url,
              official_source_verified: true,
              official_source_status: "verified_destination",
              application_note: "Destination re-resolved by the v2 resolver (official opportunity page).",
              updated_at: new Date().toISOString(),
            }).eq("id", row.id);
            await baselineVerifiedDestination({
              supabase, opportunityId: row.id, url: result.applicationDestinationUrl,
            });
            counts.destinationUpgraded += 1;
            destinationText = `${shortUrl(row.application_url)} → ${shortUrl(result.applicationDestinationUrl)}`;
          } else {
            counts.destinationConfirmed += 1;
            destinationText = `${shortUrl(row.application_url)} ✓`;
          }
        } else {
          counts.destinationFailed += 1;
          destinationText = `${shortUrl(row.application_url)} (unresolved: ${result.verificationVerdict || "none"})`;
        }
        await new Promise((r) => setTimeout(r, 1500));
      } catch (error) {
        counts.destinationFailed += 1;
        destinationText = `${shortUrl(row.application_url)} (error: ${String(error instanceof Error ? error.message : error).slice(0, 40)})`;
      }
    }

    console.log(
      `| ${index} | ${String(row.title).slice(0, 44)} | ${sees} | ${why.slice(0, 58)} | ${scoreText} | ${destinationText} |`
    );
  }

  console.log("\n===== AUDIT SUMMARY =====");
  console.log(JSON.stringify(counts, null, 1));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
