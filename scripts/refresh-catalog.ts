/**
 * One-time full-catalog remediation — through PRODUCTION code paths only.
 *
 * For every approved row in the live catalog:
 *   1. recheckOpportunity({ force: true }) — re-fetches the page and re-runs
 *      the Gemini Pro extractor (same one discovery uses): canonical
 *      education levels, application status read from page language,
 *      application open dates, exact deadlines, verbatim eligibility text,
 *      selection criteria. Rows whose page says closed / not-yet-open
 *      unpublish and schedule their reopen recheck; genuinely expired rows
 *      renew through the standard renewal path.
 *   2. If the row survived with a non-application-page destination (a
 *      program/info page), re-rank the applicant destination and adopt an
 *      AI-verified upgrade when one is found (the Pearson apply-link fix).
 *
 * This is a proof the SYSTEM works — the same code handles tomorrow's
 * discoveries with zero humans.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/refresh-catalog.ts [--limit N]
 */
import { createClient } from "@supabase/supabase-js";
import { recheckOpportunity } from "../src/lib/opportunities/recheck-opportunity";
import { rankApplicationDestination } from "../src/lib/discovery/application-destination-ranker";
import { baselineVerifiedDestination } from "../src/lib/opportunities/reverify-destinations";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APPLICATION_ENDPOINT_TYPES = new Set([
  "official_application_page",
  "third_party_portal",
  "login_gated_portal",
  "email_based_application",
  "application_document",
]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit =
    limitArg >= 0 ? Number(process.argv[limitArg + 1]) || 999 : 999;

  const { data: rows, error } = await supabase
    .from("opportunities")
    .select("id, title, application_status, is_active, deadline, application_destination_type")
    .eq("lifecycle_status", "active")
    .eq("is_approved", true)
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const summary = {
    processed: 0,
    unchanged: 0,
    updated: 0,
    unpublishedNotAccepting: 0,
    fetchFailed: 0,
    renewed: 0,
    destinationUpgraded: 0,
    destinationChecked: 0,
    failed: 0,
  };

  console.log(`Refreshing ${rows?.length || 0} catalog rows through production paths...\n`);

  for (const row of rows || []) {
    summary.processed += 1;
    const tag = `[${summary.processed}/${rows!.length}] ${String(row.title).slice(0, 60)}`;

    try {
      const result = await recheckOpportunity({
        supabase,
        opportunityId: row.id,
        force: true,
      });

      if (result.outcome === "unpublished_not_accepting") {
        summary.unpublishedNotAccepting += 1;
        console.log(`${tag}\n    -> UNPUBLISHED (not accepting applications)`);
      } else if (result.outcome === "fetch_failed") {
        summary.fetchFailed += 1;
        console.log(`${tag}\n    -> fetch failed: ${result.error || ""}`);
      } else if (
        result.outcome === "renewed_cycle_created" ||
        result.outcome === "renewed_cycle_updated" ||
        result.outcome === "existing_renewed_cycle_linked"
      ) {
        summary.renewed += 1;
        console.log(`${tag}\n    -> ${result.outcome}`);
      } else if (result.criteriaChanged || result.contentChanged) {
        summary.updated += 1;
        console.log(
          `${tag}\n    -> updated (criteria ${result.criteriaChanged ? "changed" : "same"}, content ${result.contentChanged ? "changed" : "same"})`
        );
      } else {
        summary.unchanged += 1;
        console.log(`${tag}\n    -> ${result.outcome}`);
      }

      // Destination upgrade pass for rows still live whose Apply link isn't
      // an application endpoint (program pages, info pages).
      const { data: fresh } = await supabase
        .from("opportunities")
        .select(
          "id, title, provider, type, source_url, deadline, is_active, application_url, application_destination_type"
        )
        .eq("id", row.id)
        .maybeSingle();

      if (
        fresh?.is_active === true &&
        !APPLICATION_ENDPOINT_TYPES.has(String(fresh.application_destination_type || ""))
      ) {
        summary.destinationChecked += 1;
        const destination = await rankApplicationDestination({
          title: String(fresh.title || ""),
          provider: fresh.provider ? String(fresh.provider) : null,
          type: fresh.type ? String(fresh.type) : null,
          sourceUrl: fresh.source_url ? String(fresh.source_url) : null,
          deadline: fresh.deadline ? String(fresh.deadline) : null,
        });

        const upgraded =
          destination.destinationVerified &&
          destination.applicationDestinationUrl &&
          destination.applicationDestinationUrl !== fresh.application_url &&
          destination.applicationDestinationType !== "aggregator_or_database" &&
          destination.applicationDestinationType !== "not_found";

        if (upgraded) {
          await supabase
            .from("opportunities")
            .update({
              application_url: destination.applicationDestinationUrl,
              application_destination_url: destination.applicationDestinationUrl,
              application_destination_type: destination.applicationDestinationType,
              destination_confidence: destination.destinationConfidence,
              destination_reasons: destination.destinationReasons,
              official_source_url:
                destination.officialSourceUrl || fresh.source_url,
              official_source_verified: true,
              official_source_status: "verified_destination",
              application_note:
                "Destination upgraded to the specific application page during catalog refresh.",
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          await baselineVerifiedDestination({
            supabase,
            opportunityId: row.id,
            url: destination.applicationDestinationUrl!,
          });
          summary.destinationUpgraded += 1;
          console.log(
            `    -> destination upgraded: ${destination.applicationDestinationUrl}`
          );
        }
      }
    } catch (err) {
      summary.failed += 1;
      console.log(`${tag}\n    -> ERROR: ${err instanceof Error ? err.message : err}`);
    }

    await sleep(1500); // pace Gemini calls
  }

  console.log("\n===== CATALOG REFRESH SUMMARY =====");
  console.log(JSON.stringify(summary, null, 2));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("Refresh crashed:", err);
  process.exit(1);
});
