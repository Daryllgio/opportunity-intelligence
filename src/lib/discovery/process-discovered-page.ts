/**
 * The discovery pipeline's second half: turn a discovered page into a
 * published opportunity (or a rejection/draft) with zero humans involved.
 *
 * capture → quality gate → pre-extraction scope gate → extraction →
 * ingest (validation, destination ranking, AI verification, publish/draft).
 *
 * The nightly cron calls processPendingDiscoveredPages so that pages found
 * by search campaigns actually flow to the catalog autonomously — before
 * this existed, candidates piled up until an admin ran a batch by hand.
 */
import { capturePageWithHybrid } from "@/lib/discovery/capture/hybrid-capture";
import { extractDiscoveredOpportunity } from "@/lib/discovery/extract-discovered-opportunity";
import { ingestExtractedOpportunity } from "@/lib/discovery/ingest-extracted-opportunity";
import { shouldRejectDiscoveredPageBeforeExtraction } from "@/lib/discovery/opportunity-scope";
import { checkKnownOpportunity } from "@/lib/discovery/pre-ai-dedup";

type SupabaseClientLike = {
  from: (table: string) => any;
};

export type ProcessPageOutcome = {
  discoveredPageId: string;
  decision: string;
  reason?: string | null;
  publishedOpportunityId?: string | null;
  draftId?: string | null;
  title?: string | null;
};

export async function processDiscoveredPage({
  supabase,
  discoveredPage,
  sourceTrust = "standard",
}: {
  supabase: SupabaseClientLike;
  discoveredPage: Record<string, any>;
  sourceTrust?: "trusted" | "standard" | "experimental" | "blocked";
}): Promise<ProcessPageOutcome> {
  const discoveredPageId = String(discoveredPage.id);
  const url = String(discoveredPage.url || discoveredPage.normalized_url || "");

  if (!url) {
    await supabase
      .from("discovered_pages")
      .update({
        discovery_status: "rejected",
        rejection_reason: "No URL on record.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", discoveredPageId);
    return { discoveredPageId, decision: "reject", reason: "missing_url" };
  }

  // Dedup BEFORE any AI or capture is spent: URL and yearless-title checks
  // against the catalog and draft pool. A hit on an expired row forwards its
  // renewal check instead of re-extracting from scratch.
  const known = await checkKnownOpportunity({
    supabase,
    url,
    title: discoveredPage.title,
  });
  if (known.known) {
    await supabase
      .from("discovered_pages")
      .update({
        discovery_status: "rejected",
        rejection_reason: `Already ${known.table === "opportunities" ? "in the catalog" : "drafted"} (${known.matchType}): ${known.rowTitle || known.rowId}${known.renewalScheduled ? "; renewal check pulled forward" : ""}.`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", discoveredPageId);
    return {
      discoveredPageId,
      decision: "already_known",
      reason: known.matchType,
    };
  }

  const capture = await capturePageWithHybrid(url);
  const finalResult = capture.finalResult;

  if (!finalResult.ok || finalResult.quality.shouldRejectBeforeAI) {
    await supabase
      .from("discovered_pages")
      .update({
        discovery_status: "rejected",
        quality_score: finalResult.quality.score,
        rejection_reason:
          finalResult.error ||
          finalResult.quality.reasons.join("; ") ||
          "Page capture was too weak for extraction.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", discoveredPageId);
    return {
      discoveredPageId,
      decision: "reject",
      reason: "capture_failed_or_too_weak",
    };
  }

  const preExtractionScope = shouldRejectDiscoveredPageBeforeExtraction({
    opportunityType: discoveredPage.opportunity_type,
    title: discoveredPage.title,
    url: finalResult.finalUrl,
    text: finalResult.cleanText,
  });

  if (preExtractionScope.reject) {
    await supabase
      .from("discovered_pages")
      .update({
        discovery_status: "rejected",
        rejection_reason:
          preExtractionScope.reason || "Pre-extraction scope reject.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", discoveredPageId);
    return {
      discoveredPageId,
      decision: "reject",
      reason: preExtractionScope.reason,
    };
  }

  const extracted = await extractDiscoveredOpportunity({
    pageText: finalResult.cleanText,
    sourceUrl: finalResult.finalUrl,
    discoveryContext: {
      region: discoveredPage.region,
      opportunityType: discoveredPage.opportunity_type,
      educationLevel: discoveredPage.education_level,
      fieldArea: discoveredPage.field_area,
    },
  });

  const ingestion = await ingestExtractedOpportunity({
    supabase,
    discoveredPage,
    extracted: extracted as unknown as Record<string, unknown>,
    sourceTrust,
  });

  return {
    discoveredPageId,
    decision: ingestion.decision,
    publishedOpportunityId: ingestion.publishedOpportunityId,
    draftId: ingestion.draftId,
    title: extracted.title,
  };
}

export type ProcessPendingSummary = {
  processed: number;
  published: number;
  review: number;
  tracked: number;
  rejected: number;
  alreadyKnown: number;
  failed: number;
  details: string[];
};

export async function processPendingDiscoveredPages({
  supabase,
  limit = 20,
}: {
  supabase: SupabaseClientLike;
  limit?: number;
}): Promise<ProcessPendingSummary> {
  const summary: ProcessPendingSummary = {
    processed: 0,
    published: 0,
    review: 0,
    tracked: 0,
    rejected: 0,
    alreadyKnown: 0,
    failed: 0,
    details: [],
  };

  // Fresh candidates, plus claims stranded by a crashed run (claimed to
  // "processing" over an hour ago and never finished) — self-healing.
  const staleClaimCutoff = new Date(Date.now() - 60 * 60000).toISOString();
  const { data: pages, error } = await supabase
    .from("discovered_pages")
    .select("*")
    .or(
      `discovery_status.eq.candidate,and(discovery_status.eq.processing,updated_at.lt.${staleClaimCutoff})`
    )
    .order("quality_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    summary.details.push(`query failed: ${error.message}`);
    return summary;
  }

  for (const page of pages || []) {
    // Claim before work: cron slots can overlap (peak season runs four), and
    // a compare-and-swap on the status means a page is only ever processed
    // by one run. Losing the race is not an error — someone else has it.
    const { data: claimed } = await supabase
      .from("discovered_pages")
      .update({
        discovery_status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", page.id)
      .eq("discovery_status", page.discovery_status) // CAS on what we read
      .eq("updated_at", page.updated_at)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    summary.processed += 1;
    try {
      const outcome = await processDiscoveredPage({
        supabase,
        discoveredPage: page,
      });
      if (outcome.decision === "auto_publish") {
        summary.published += 1;
        summary.details.push(`published: ${outcome.title || page.url}`);
      } else if (outcome.decision === "review") {
        summary.review += 1;
      } else if (outcome.decision === "track_for_next_cycle") {
        summary.tracked += 1;
      } else if (outcome.decision === "already_known") {
        summary.alreadyKnown += 1;
      } else {
        summary.rejected += 1;
      }
    } catch (processError) {
      summary.failed += 1;
      // Release the claim so the next run retries.
      await supabase
        .from("discovered_pages")
        .update({
          discovery_status: "candidate",
          rejection_reason: `Processing failed: ${
            processError instanceof Error ? processError.message : "unknown"
          }`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", page.id);
    }
  }

  return summary;
}
