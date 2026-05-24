import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  assessSourceQuality,
  detectAggregatorBehavior,
  getDomain,
} from "../src/lib/discovery/source-quality";
import { assessSearchResultIntake } from "../src/lib/discovery/search-result-intake-gate";

const DRY_RUN = process.env.DRY_RUN !== "false";
const LIMIT = Number(process.env.LIMIT || 500);

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWeakDirectorySignal(row: Record<string, any>) {
  const combined = normalize(
    [
      row.title,
      row.url,
      row.normalized_url,
      row.discovery_query,
      row.rejection_reason,
    ]
      .filter(Boolean)
      .join(" ")
  );

  const signals = [
    "top scholarships",
    "best scholarships",
    "scholarship list",
    "list of scholarships",
    "scholarship directory",
    "scholarship database",
    "scholarship search",
    "find scholarships",
    "how to apply for scholarships",
    "scholarship guide",
    "fully funded scholarships",
    "no essay scholarship",
    "easy scholarships",
    "updated 2026",
    "updated 2027",
    "best research programs",
    "top research programs",
    "opportunities for high school students",
    "funding guide",
    "database",
    "directory",
  ];

  return signals.some((signal) => combined.includes(signal));
}

function hasDirectOpportunitySignal(row: Record<string, any>) {
  const combined = normalize(
    [
      row.title,
      row.url,
      row.normalized_url,
      row.discovery_query,
    ]
      .filter(Boolean)
      .join(" ")
  );

  const signals = [
    "apply",
    "application",
    "scholarship",
    "fellowship",
    "grant",
    "competition",
    "contest",
    "award",
    "program",
    "eligibility",
    "deadline",
    "nomination",
    "register",
    "students essay contests",
    "essay contest",
    "essay contests",
    "student essay contest",
    "student essay contests",
    "case competition",
    "case competitions",
    "student case competition",
    "call for applications",
    "scholarship students",
    "college success program",
  ];

  return signals.some((signal) => combined.includes(signal));
}

function isLikelyDirectOpportunityPage(row: Record<string, any>) {
  const url = String(row.url || row.normalized_url || "").toLowerCase();
  const combined = normalize([row.title, row.url, row.normalized_url].join(" "));

  const directUrlSignals = [
    "/scholarship",
    "/scholarships",
    "/fellowship",
    "/fellowships",
    "/grant",
    "/grants",
    "/award",
    "/awards",
    "/contest",
    "/contests",
    "essay-contest",
    "essay-contests",
    "/competition",
    "/competitions",
    "case-competition",
    "case-competitions",
    "call-for-applications",
    "/program",
    "/programs",
    "/apply",
    "/application",
  ];

  return (
    directUrlSignals.some((signal) => url.includes(signal)) &&
    hasDirectOpportunitySignal(row) &&
    !hasWeakDirectorySignal(row) &&
    !combined.includes("top ") &&
    !combined.includes("best ") &&
    !combined.includes("guide")
  );
}

function classifyCandidate(row: Record<string, any>) {
  const url = String(row.url || row.normalized_url || "");
  const title = String(row.title || "");
  const opportunityType = String(row.opportunity_type || "");

  const domain = getDomain(url) || "unknown";
  const sourceQuality = assessSourceQuality(url);

  const aggregatorBehavior = detectAggregatorBehavior({
    url,
    title,
    text: String(row.snippet || row.clean_text || row.description || ""),
  });

  const intake = assessSearchResultIntake({
    url,
    title,
    snippet: String(row.snippet || row.clean_text || row.description || ""),
    campaignOpportunityType: opportunityType || null,
    campaignQuery: String(row.discovery_query || ""),
  });

  const weakDirectory = hasWeakDirectorySignal(row);

  if (sourceQuality.category === "blocked") {
    return {
      action: "reject",
      reason: "Candidate queue reconciliation: blocked source.",
      domain,
      sourceCategory: sourceQuality.category,
      intakeScore: intake.score,
    };
  }

  if (sourceQuality.category === "low_trust_blog") {
    return {
      action: "reject",
      reason: "Candidate queue reconciliation: low-trust blog/source.",
      domain,
      sourceCategory: sourceQuality.category,
      intakeScore: intake.score,
    };
  }

  if (sourceQuality.isAggregator || aggregatorBehavior.isAggregatorLike) {
    return {
      action: "defer_aggregator",
      reason: "Candidate queue reconciliation: aggregator/database-like source.",
      domain,
      sourceCategory: sourceQuality.category,
      intakeScore: intake.score,
    };
  }

  if (weakDirectory && !["government", "university", "application_portal", "official_provider"].includes(sourceQuality.category)) {
    return {
      action: "reject",
      reason: "Candidate queue reconciliation: weak directory/advice/list result.",
      domain,
      sourceCategory: sourceQuality.category,
      intakeScore: intake.score,
    };
  }

  if (intake.decision === "skip" && intake.score < 25) {
    const universityLikeDomain =
      domain.endsWith(".edu") ||
      domain.endsWith(".ca") ||
      domain.includes("university") ||
      domain.includes("college") ||
      domain.includes("sfu.ca") ||
      domain.includes("uoguelph.ca") ||
      domain.includes("lakeheadu.ca") ||
      domain.includes("athabascau.ca");

    const conservativeReview =
      isLikelyDirectOpportunityPage(row) ||
      (universityLikeDomain && hasDirectOpportunitySignal(row));

    if (conservativeReview) {
      return {
        action: "review",
        reason: `Candidate queue reconciliation: ambiguous direct or institution-hosted opportunity page; moved to review instead of rejecting. Intake score ${intake.score}.`,
        domain,
        sourceCategory: sourceQuality.category,
        intakeScore: intake.score,
      };
    }

    return {
      action: "reject",
      reason: `Candidate queue reconciliation: failed intake gate with score ${intake.score}.`,
      domain,
      sourceCategory: sourceQuality.category,
      intakeScore: intake.score,
    };
  }

  return {
    action: "keep",
    reason: `Candidate queue reconciliation: kept candidate with intake score ${intake.score}.`,
    domain,
    sourceCategory: sourceQuality.category,
    intakeScore: intake.score,
  };
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: rows, error } = await supabase
    .from("discovered_pages")
    .select("id,title,url,normalized_url,source_domain,opportunity_type,discovery_query,discovery_status,quality_score,updated_at")
    .eq("discovery_status", "candidate")
    .order("updated_at", { ascending: true })
    .limit(LIMIT);

  if (error) throw error;

  const results = (rows || []).map((row) => ({
    row,
    decision: classifyCandidate(row),
  }));

  const counts = new Map<string, number>();
  const domainCounts = new Map<string, number>();

  for (const result of results) {
    counts.set(result.decision.action, (counts.get(result.decision.action) || 0) + 1);
    domainCounts.set(result.decision.domain, (domainCounts.get(result.decision.domain) || 0) + 1);
  }

  console.log("\n=== Candidate Queue Reconciliation ===");
  console.log(`Dry run: ${DRY_RUN ? "yes" : "no"}`);
  console.log(`Candidates checked: ${results.length}`);

  console.log("\n=== Actions ===");
  console.table(Object.fromEntries(counts));

  console.log("\n=== Top Domains Checked ===");
  console.table(
    Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([domain, count]) => ({ domain, count }))
  );

  const changing = results.filter((result) => result.decision.action !== "keep");

  console.log("\n=== Sample Changes ===");
  console.table(
    changing.slice(0, 25).map((result) => ({
      action: result.decision.action,
      title: result.row.title,
      url: result.row.url,
      domain: result.decision.domain,
      category: result.decision.sourceCategory,
      score: result.decision.intakeScore,
      reason: result.decision.reason,
    }))
  );

  if (DRY_RUN) {
    console.log("\nDry run only. No database rows were updated.");
    console.log("To apply changes, run:");
    console.log("DRY_RUN=false npx tsx --env-file=.env.local scripts/reconcile-candidate-queue.ts");
    return;
  }

  const now = new Date().toISOString();

  for (const result of changing) {
    if (result.decision.action === "defer_aggregator") {
      const { error: updateError } = await supabase
        .from("discovered_pages")
        .update({
          discovery_status: "deferred_aggregator",
          rejection_reason: result.decision.reason,
          updated_at: now,
        })
        .eq("id", result.row.id);

      if (updateError) throw updateError;
    }

    if (result.decision.action === "reject") {
      const { error: updateError } = await supabase
        .from("discovered_pages")
        .update({
          discovery_status: "rejected",
          rejection_reason: result.decision.reason,
          updated_at: now,
        })
        .eq("id", result.row.id);

      if (updateError) throw updateError;
    }

    if (result.decision.action === "review") {
      const { error: updateError } = await supabase
        .from("discovered_pages")
        .update({
          discovery_status: "review",
          rejection_reason: result.decision.reason,
          updated_at: now,
        })
        .eq("id", result.row.id);

      if (updateError) throw updateError;
    }
  }

  console.log(`\nUpdated rows: ${changing.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
