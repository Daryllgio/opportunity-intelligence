/**
 * End-to-end discovery scale test.
 *
 * Runs the REAL production pipeline at volume: search campaigns feed
 * discovered_pages, then every candidate flows through capture → extraction
 * → validation → destination ranking → AI verification → publish/draft.
 * Nothing is special-cased; this is exactly what the nightly crons do, just
 * more of it in one sitting. Prints a precision-ready summary at the end:
 * verify the published rows by opening their Apply links.
 *
 * Requires working GEMINI_API_KEY billing and BRAVE_SEARCH_API_KEY.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-scale-test.ts
 *   CAMPAIGNS=30 PAGES=150 npx tsx --env-file=.env.local scripts/run-scale-test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { runDiscoverySearchCampaigns } from "../src/lib/discovery/run-search-campaigns";
import { processPendingDiscoveredPages } from "../src/lib/discovery/process-discovered-page";

const CAMPAIGNS = Number(process.env.CAMPAIGNS || 25);
const PAGES = Number(process.env.PAGES || 120);
const BATCH = 15;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log(`Phase 1: ${CAMPAIGNS} search campaigns`);
  const search = await runDiscoverySearchCampaigns({
    supabase,
    maxCampaigns: CAMPAIGNS,
    maxResultsPerCampaign: 10,
  });
  console.log(JSON.stringify({ campaignsRun: search.campaignsProcessed }, null, 2));

  console.log(`\nPhase 2: process up to ${PAGES} candidate pages (batches of ${BATCH})`);
  const totals = { processed: 0, published: 0, review: 0, tracked: 0, rejected: 0, failed: 0 };
  const publishedTitles: string[] = [];

  while (totals.processed < PAGES) {
    const batch = await processPendingDiscoveredPages({
      supabase,
      limit: Math.min(BATCH, PAGES - totals.processed),
    });
    if (batch.processed === 0) break;
    totals.processed += batch.processed;
    totals.published += batch.published;
    totals.review += batch.review;
    totals.tracked += batch.tracked;
    totals.rejected += batch.rejected;
    totals.failed += batch.failed;
    publishedTitles.push(
      ...batch.details.filter((d) => d.startsWith("published:"))
    );
    console.log(
      `  batch: +${batch.processed} (published ${batch.published}, review ${batch.review}, tracked ${batch.tracked}, rejected ${batch.rejected}, failed ${batch.failed})`
    );
  }

  console.log("\n=== SCALE TEST SUMMARY ===");
  console.log(JSON.stringify(totals, null, 2));
  console.log("\nPublished this run:");
  publishedTitles.forEach((title) => console.log(`  ${title}`));

  const { count } = await supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("is_approved", true)
    .eq("official_source_verified", true);
  console.log(`\nLive verified catalog now: ${count}`);
  console.log(
    "\nAccuracy check: sample the published rows and open each application_url — every one should be the real application page for that specific opportunity."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
