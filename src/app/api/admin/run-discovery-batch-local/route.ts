import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildEvidenceBundleForDiscoveredPage } from "@/lib/discovery/evidence-bundle";
import { extractDiscoveredOpportunity } from "@/lib/discovery/extract-discovered-opportunity";
import { ingestExtractedOpportunity } from "@/lib/discovery/ingest-extracted-opportunity";
import { capturePageWithHybrid } from "@/lib/discovery/capture/hybrid-capture";
import { detectCandidateOpportunityLinks } from "@/lib/discovery/candidate-detection";
import { upsertDiscoveredPages } from "@/lib/discovery/discovered-pages";
import { buildOpportunityFamilyKey } from "@/lib/discovery/family-key";

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function normalizePageKey(page: Record<string, unknown>) {
  return String(page.normalized_url || page.url || "")
    .replace(/#.*$/, "")
    .replace(/\/$/, "");
}

function shouldProcessStatus(status: unknown) {
  return ["candidate", "needs_more_pages"].includes(String(status || ""));
}

function isTerminalBundleDecision(decision: unknown) {
  return ["auto_publish", "review", "track_for_next_cycle"].includes(
    String(decision || "")
  );
}

function normalizeUrlKey(value: unknown) {
  return String(value || "")
    .replace(/#.*$/, "")
    .replace(/\/$/, "");
}

function getPageFamilyKey(page: Record<string, any>) {
  return (
    page.opportunity_family_key ||
    buildOpportunityFamilyKey({
      url: page.url || page.normalized_url,
      sourceDomain: page.source_domain,
      opportunityType: page.opportunity_type,
      title: page.title,
      discoveryQuery: page.discovery_query,
    })
  );
}

async function expandCandidateLinks({
  supabase,
  page,
}: {
  supabase: any;
  page: Record<string, any>;
}) {
  const url = String(page.url || page.normalized_url || "");

  if (!url) {
    return {
      expanded: false,
      savedCount: 0,
      reason: "missing_url",
    };
  }

  const capture = await capturePageWithHybrid(url);
  const finalResult = capture.finalResult;

  if (!finalResult.ok) {
    return {
      expanded: false,
      savedCount: 0,
      reason: finalResult.error || "capture_failed",
    };
  }

  const candidates = detectCandidateOpportunityLinks(finalResult.links);

  const filteredCandidates = candidates.filter(
    (candidate) => candidate.normalizedUrl !== page.normalized_url
  );

  const saved = await upsertDiscoveredPages({
    supabase,
    candidates: filteredCandidates.slice(0, 50),
    discoveryQuery: String(page.discovery_query || page.url),
    region: page.region,
    opportunityType: page.opportunity_type,
    educationLevel: page.education_level,
    fieldArea: page.field_area,
  });

  return {
    expanded: true,
    capturedUrl: finalResult.finalUrl,
    captureMethod: capture.captureMethod,
    usedFallback: capture.usedFallback,
    candidatesFound: candidates.length,
    savedCount: saved.upserted,
    saved: saved.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      url: row.url,
      normalized_url: row.normalized_url,
      discovery_status: row.discovery_status,
    })),
  };
}

async function processBundle({
  supabase,
  leadPage,
  sourceTrust,
  maxPagesPerBundle,
}: {
  supabase: any;
  leadPage: Record<string, any>;
  sourceTrust: "trusted" | "standard" | "experimental" | "blocked";
  maxPagesPerBundle: number;
}) {
  const bundle = await buildEvidenceBundleForDiscoveredPage({
    supabase,
    discoveredPageId: leadPage.id,
    maxPages: maxPagesPerBundle,
    stopWhenComplete: true,
  });

  if (bundle.pages.length === 0 || bundle.evidenceText.length < 500) {
    await supabase
      .from("discovered_pages")
      .update({
        discovery_status: "rejected",
        rejection_reason: "Not enough evidence pages for bundled extraction.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadPage.id);

    return {
      leadPageId: leadPage.id,
      decision: "reject",
      reason: "not_enough_evidence",
      pageCount: bundle.pages.length,
    };
  }

  const sourceUrl = String(
    bundle.anchorPage.url || bundle.anchorPage.normalized_url || ""
  );

  const extracted = await extractDiscoveredOpportunity({
    pageText: bundle.evidenceText,
    sourceUrl,
    discoveryContext: {
      region: bundle.anchorPage.region,
      opportunityType: bundle.anchorPage.opportunity_type,
      educationLevel: bundle.anchorPage.education_level,
      fieldArea: bundle.anchorPage.field_area,
    },
  });

  const ingestion = await ingestExtractedOpportunity({
    supabase,
    discoveredPage: bundle.anchorPage,
    extracted: extracted as unknown as Record<string, unknown>,
    sourceTrust,
  });

  return {
    leadPageId: leadPage.id,
    domain: bundle.domain,
    pageCount: bundle.pages.length,
    coverage: bundle.coverage,
    pages: bundle.pages.map((page) => ({
      id: page.id,
      title: page.title,
      url: page.url,
      status: page.discovery_status,
      quality_score: page.quality_score,
      textLength: page.textLength,
    })),
    extraction: extracted,
    ingestion,
    decision: ingestion.decision,
  };
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Local test route disabled in production." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const maxBundles = Math.min(Number(body.maxBundles || 5), 5);
    const maxPagesPerBundle = Math.min(Number(body.maxPagesPerBundle || 10), 10);
    const sourceTrust = String(body.sourceTrust || "standard") as
      | "trusted"
      | "standard"
      | "experimental"
      | "blocked";

    const supabase = createServiceSupabase();

    const { data: candidatePages, error: candidateError } = await supabase
      .from("discovered_pages")
      .select("*")
      .in("discovery_status", ["candidate", "needs_more_pages"])
      .order("quality_score", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: true })
      .limit(maxBundles * 4);

    if (candidateError) {
      return NextResponse.json(
        { error: candidateError.message },
        { status: 500 }
      );
    }

    const selectedLeadPages = [];
    const seenKeys = new Set<string>();

    for (const page of candidatePages || []) {
      if (!shouldProcessStatus(page.discovery_status)) continue;

      const key = normalizePageKey(page);
      if (!key || seenKeys.has(key)) continue;

      seenKeys.add(key);
      selectedLeadPages.push(page);

      if (selectedLeadPages.length >= maxBundles) break;
    }

    const results = [];
    const alreadyUsedPageKeys = new Set<string>();
    const alreadyUsedFamilyKeys = new Set<string>();

    for (const leadPage of selectedLeadPages) {
      const { data: currentLeadPage, error: currentLeadError } = await supabase
        .from("discovered_pages")
        .select("*")
        .eq("id", leadPage.id)
        .maybeSingle();

      if (currentLeadError) {
        results.push({
          leadPageId: leadPage.id,
          leadTitle: leadPage.title,
          leadUrl: leadPage.url,
          decision: "error",
          error: currentLeadError.message,
        });
        continue;
      }

      if (!currentLeadPage || !shouldProcessStatus(currentLeadPage.discovery_status)) {
        results.push({
          leadPageId: leadPage.id,
          leadTitle: leadPage.title,
          leadUrl: leadPage.url,
          decision: "skipped",
          reason: "lead_page_already_processed_or_not_processable",
          currentStatus: currentLeadPage?.discovery_status || null,
        });
        continue;
      }

      const currentLeadKey = normalizePageKey(currentLeadPage);
      const currentFamilyKey = getPageFamilyKey(currentLeadPage);

      if (alreadyUsedFamilyKeys.has(currentFamilyKey)) {
        results.push({
          leadPageId: currentLeadPage.id,
          leadTitle: currentLeadPage.title,
          leadUrl: currentLeadPage.url,
          decision: "skipped",
          reason: "opportunity_family_already_processed_in_this_batch",
          opportunityFamilyKey: currentFamilyKey,
          currentStatus: currentLeadPage.discovery_status,
        });
        continue;
      }

      if (alreadyUsedPageKeys.has(currentLeadKey)) {
        results.push({
          leadPageId: currentLeadPage.id,
          leadTitle: currentLeadPage.title,
          leadUrl: currentLeadPage.url,
          decision: "skipped",
          reason: "lead_page_already_used_in_this_batch",
          currentStatus: currentLeadPage.discovery_status,
        });
        continue;
      }

      const expansion = await expandCandidateLinks({
        supabase,
        page: currentLeadPage,
      });

      const bundleResult = await processBundle({
        supabase,
        leadPage: currentLeadPage,
        sourceTrust,
        maxPagesPerBundle,
      });

      for (const page of bundleResult.pages || []) {
        alreadyUsedPageKeys.add(normalizeUrlKey(page.url));
      }

      for (const savedPage of expansion.saved || []) {
        alreadyUsedPageKeys.add(
          normalizeUrlKey(savedPage.normalized_url || savedPage.url)
        );
      }

      alreadyUsedPageKeys.add(currentLeadKey);
      alreadyUsedFamilyKeys.add(currentFamilyKey);

      if (isTerminalBundleDecision(bundleResult.decision)) {
        const expansionSupportingIds = (expansion.saved || [])
          .map((row: Record<string, unknown>) => String(row.id || ""))
          .filter(Boolean)
          .filter((id: string) => id !== String(currentLeadPage.id));

        if (expansionSupportingIds.length > 0) {
          await supabase
            .from("discovered_pages")
            .update({
              discovery_status: "bundled",
              bundled_with_id: currentLeadPage.id,
              opportunity_family_key: currentFamilyKey,
              updated_at: new Date().toISOString(),
            })
            .in("id", expansionSupportingIds)
            .in("discovery_status", ["candidate", "needs_more_pages"]);
        }

        await supabase
          .from("discovered_pages")
          .update({
            discovery_status:
              bundleResult.decision === "track_for_next_cycle"
                ? "future_tracking"
                : currentLeadPage.discovery_status,
            opportunity_family_key: currentFamilyKey,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentLeadPage.id);
      }

      results.push({
        leadTitle: currentLeadPage.title,
        leadUrl: currentLeadPage.url,
        expansion,
        ...bundleResult,
      });
    }

    return NextResponse.json({
      processedBundles: results.length,
      maxBundles,
      maxPagesPerBundle,
      sourceTrust,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run discovery batch.",
      },
      { status: 500 }
    );
  }
}
