import { createClient } from "@supabase/supabase-js";
import { assessSourceQuality, getDomain } from "../src/lib/discovery/source-quality";

type CandidatePage = {
  id: string;
  title: string | null;
  url: string | null;
  normalized_url: string | null;
  source_domain: string | null;
  opportunity_type: string | null;
  discovery_status: string | null;
  quality_score: number | null;
  updated_at: string | null;
};

function createServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function getPageUrl(page: CandidatePage) {
  return String(page.url || page.normalized_url || "").trim();
}

function classifyCandidate(page: CandidatePage) {
  const url = getPageUrl(page);
  const sourceQuality = assessSourceQuality(url);

  return {
    domain: getDomain(url) || page.source_domain || "unknown",
    isAggregator: sourceQuality.isAggregator,
    sourceCategory: sourceQuality.category,
    reasons: sourceQuality.reasons,
  };
}

function rankCandidateForKeeping(page: CandidatePage) {
  let score = Number(page.quality_score || 0);

  const title = String(page.title || "").toLowerCase();
  const url = getPageUrl(page).toLowerCase();

  if (title.includes("deadline")) score += 5;
  if (title.includes("apply") || url.includes("apply")) score += 5;
  if (title.includes("application") || url.includes("application")) score += 5;
  if (url.includes("/scholarships/") || url.includes("/fellowships/")) score += 2;

  return score;
}

function groupByDomain(pages: CandidatePage[]) {
  const groups = new Map<string, CandidatePage[]>();

  for (const page of pages) {
    const { domain } = classifyCandidate(page);

    if (!groups.has(domain)) {
      groups.set(domain, []);
    }

    groups.get(domain)!.push(page);
  }

  return groups;
}

async function main() {
  const keepPerAggregatorDomain = Number(process.env.KEEP_PER_AGGREGATOR_DOMAIN || 20);
  const dryRun = process.env.DRY_RUN !== "false";

  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("discovered_pages")
    .select("id,title,url,normalized_url,source_domain,opportunity_type,discovery_status,quality_score,updated_at")
    .eq("discovery_status", "candidate")
    .limit(10000);

  if (error) {
    throw new Error(error.message);
  }

  const candidatePages = (data || []) as CandidatePage[];

  const aggregatorCandidates = candidatePages.filter((page) => {
    const source = classifyCandidate(page);
    return source.isAggregator;
  });

  const groups = groupByDomain(aggregatorCandidates);

  const pagesToDefer: CandidatePage[] = [];

  console.log("");
  console.log("=== Candidate Queue Hygiene: Aggregator Deferral ===");
  console.log(`Dry run: ${dryRun ? "yes" : "no"}`);
  console.log(`Active candidate pages checked: ${candidatePages.length}`);
  console.log(`Aggregator candidate pages found: ${aggregatorCandidates.length}`);
  console.log(`Keep per aggregator domain: ${keepPerAggregatorDomain}`);

  console.log("");
  console.log("=== Aggregator Domains ===");

  for (const [domain, pages] of Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length)) {
    const sorted = [...pages].sort(
      (left, right) => rankCandidateForKeeping(right) - rankCandidateForKeeping(left)
    );

    const keep = sorted.slice(0, keepPerAggregatorDomain);
    const defer = sorted.slice(keepPerAggregatorDomain);

    pagesToDefer.push(...defer);

    console.log(`${domain}: ${pages.length} active, keep ${keep.length}, defer ${defer.length}`);
  }

  console.log("");
  console.log(`Total pages to defer: ${pagesToDefer.length}`);

  if (pagesToDefer.length) {
    console.log("");
    console.log("Sample pages to defer:");
    for (const page of pagesToDefer.slice(0, 15)) {
      console.log(`- ${page.title || "(untitled)"} | ${getPageUrl(page)}`);
    }
  }

  if (dryRun) {
    console.log("");
    console.log("Dry run only. No database rows were updated.");
    console.log("To apply changes, run:");
    console.log("DRY_RUN=false npx tsx --env-file=.env.local scripts/defer-excess-aggregator-candidates.ts");
    return;
  }

  if (!pagesToDefer.length) {
    console.log("No pages needed deferral.");
    return;
  }

  const ids = pagesToDefer.map((page) => page.id);
  const batchSize = 100;

  for (let index = 0; index < ids.length; index += batchSize) {
    const batch = ids.slice(index, index + batchSize);

    const { error: updateError } = await supabase
      .from("discovered_pages")
      .update({
        discovery_status: "deferred_aggregator",
        rejection_reason:
          "Deferred aggregator candidate: kept as discovery reserve while official/high-trust sources are prioritized.",
        updated_at: new Date().toISOString(),
      })
      .in("id", batch);

    if (updateError) {
      throw new Error(updateError.message);
    }

    console.log(`Deferred ${Math.min(index + batch.length, ids.length)}/${ids.length}`);
  }

  console.log("");
  console.log("Done. Excess aggregator candidates moved to deferred_aggregator.");
}

main().catch((error) => {
  console.error("Deferral failed:", error);
  process.exit(1);
});
