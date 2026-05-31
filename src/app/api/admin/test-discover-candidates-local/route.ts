import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { capturePageWithHybrid } from "@/lib/discovery/capture/hybrid-capture";
import { detectCandidateOpportunityLinks } from "@/lib/discovery/candidate-detection";
import { upsertDiscoveredPages } from "@/lib/discovery/discovered-pages";
import { normalizeUrl } from "@/lib/utils/url-normalizer";

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Local test route disabled in production." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const url = String(body.url || "").trim();

    if (!url) {
      return NextResponse.json({ error: "Missing url." }, { status: 400 });
    }

    const supabase = createServiceSupabase();

    const result = await capturePageWithHybrid(url);
    const finalResult = result.finalResult;
    const candidateLinks = detectCandidateOpportunityLinks(finalResult.links);

    const pageIsCandidate =
      finalResult.ok &&
      finalResult.quality.score >= 80 &&
      finalResult.quality.metrics.opportunitySignalCount >= 4 &&
      finalResult.quality.metrics.strongSignalCount >= 3;

    const pageCandidate = pageIsCandidate
      ? {
          url: finalResult.finalUrl,
          normalizedUrl: normalizeUrl(finalResult.finalUrl),
          linkText: finalResult.title || "Current page",
          score: finalResult.quality.score,
          reasons: ["Current page has strong opportunity signals."],
        }
      : null;

    const allCandidates = pageCandidate
      ? [pageCandidate, ...candidateLinks]
      : candidateLinks;

    const saved = await upsertDiscoveredPages({
      supabase,
      candidates: allCandidates,
      discoveryQuery: String(body.discoveryQuery || url),
      region: body.region ? String(body.region) : null,
      opportunityType: body.opportunityType ? String(body.opportunityType) : null,
      educationLevel: body.educationLevel ? String(body.educationLevel) : null,
      fieldArea: body.fieldArea ? String(body.fieldArea) : null,
    });

    return NextResponse.json({
      capturedUrl: finalResult.finalUrl,
      captureMethod: result.captureMethod,
      usedFallback: result.usedFallback,
      candidateCount: allCandidates.length,
      savedCount: saved.upserted,
      saved: saved.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        url: row.url,
        normalized_url: row.normalized_url,
        title: row.title,
        discovery_status: row.discovery_status,
        quality_score: row.quality_score,
      })),
    });
  } catch (error) {
    console.error("test-discover-candidates-local error:", error);
    return NextResponse.json(
      { error: "Failed to discover candidates locally." },
      { status: 500 }
    );
  }
}
