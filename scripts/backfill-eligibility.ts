/**
 * One-command eligibility backfill.
 *
 * Fills eligibility_criteria for every live opportunity that has none —
 * rows published before criteria capture existed. Fetches each row's page
 * once and runs the focused Flash eligibility extraction. The nightly sweep
 * does this incrementally anyway (10/night); this script is for immediate
 * full coverage right after the migration lands.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-eligibility.ts
 */
import { createClient } from "@supabase/supabase-js";
import { extractEligibilityFromText } from "../src/lib/discovery/extract-eligibility-only";
import { fetchAndHashOpportunityPage } from "../src/lib/opportunities/page-recheck";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const probe = await supabase
    .from("opportunities")
    .select("eligibility_criteria")
    .limit(1);
  if (probe.error) {
    console.error(
      "eligibility_criteria column missing — apply scripts/sql/apply-me.sql first."
    );
    process.exit(1);
  }

  const { data: rows, error } = await supabase
    .from("opportunities")
    .select("id, title, application_destination_url, application_url, source_url, eligibility_criteria")
    .eq("is_active", true)
    .eq("is_approved", true);

  if (error) throw new Error(error.message);

  const missing = (rows || []).filter(
    (row) =>
      !Array.isArray(row.eligibility_criteria) ||
      row.eligibility_criteria.length === 0
  );
  console.log(`${rows?.length} live rows, ${missing.length} missing criteria`);

  let filled = 0;
  let empty = 0;
  let failed = 0;

  for (const row of missing) {
    const url =
      row.application_destination_url || row.application_url || row.source_url;
    if (!url) {
      failed++;
      continue;
    }
    try {
      const page = await fetchAndHashOpportunityPage(url);
      if (!page.ok || page.cleanText.length < 300) {
        console.log(`  skip (page thin/unreachable): ${row.title}`);
        failed++;
        continue;
      }
      const criteria = await extractEligibilityFromText({
        title: String(row.title || ""),
        pageText: page.cleanText,
      });
      await supabase
        .from("opportunities")
        .update({
          eligibility_criteria: criteria,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (criteria.length > 0) {
        filled++;
        console.log(`  filled ${criteria.length}: ${row.title}`);
      } else {
        empty++;
        console.log(`  none stated: ${row.title}`);
      }
    } catch (err) {
      failed++;
      console.log(`  failed: ${row.title} (${err instanceof Error ? err.message : err})`);
    }
  }

  console.log(`\ndone: ${filled} filled, ${empty} state none, ${failed} failed/skipped`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
