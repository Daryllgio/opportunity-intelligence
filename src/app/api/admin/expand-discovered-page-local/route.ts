import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { capturePageWithHybrid } from "@/lib/discovery/capture/hybrid-capture";
import { detectCandidateOpportunityLinks } from "@/lib/discovery/candidate-detection";
import { upsertDiscoveredPages } from "@/lib/discovery/discovered-pages";

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
    const discoveredPageId = String(body.discoveredPageId || "").trim();

    if (!discoveredPageId) {
      return NextResponse.json(
        { error: "Missing discoveredPageId." },
        { status: 400 }
      );
    }

    const supabase = createServiceSupabase();

    const { data: discoveredPage, error: pageError } = await supabase
      .from("discovered_pages")
      .select("*")
      .eq("id", discoveredPageId)
      .maybeSingle();

    if (pageError) {
      return NextResponse.json({ error: pageError.message }, { status: 500 });
    }

    if (!discoveredPage) {
      return NextResponse.json(
        { error: "Discovered page not found." },
        { status: 404 }
      );
    }

    const url = String(discoveredPage.url || discoveredPage.normalized_url || "");

    if (!url) {
      return NextResponse.json(
        { error: "Discovered page has no URL." },
        { status: 400 }
      );
    }

    const capture = await capturePageWithHybrid(url);
    const finalResult = capture.finalResult;

    if (!finalResult.ok) {
      await supabase
        .from("discovered_pages")
        .update({
          discovery_status: "rejected",
          rejection_reason: finalResult.error || "Failed to capture page.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", discoveredPageId);

      return NextResponse.json({
        expanded: false,
        reason: "capture_failed",
        error: finalResult.error,
      });
    }

    const candidates = detectCandidateOpportunityLinks(finalResult.links);

    const filteredCandidates = candidates.filter(
      (candidate) => candidate.normalizedUrl !== discoveredPage.normalized_url
    );

    const saved = await upsertDiscoveredPages({
      supabase,
      candidates: filteredCandidates,
      discoveryQuery: String(discoveredPage.discovery_query || discoveredPage.url),
      region: discoveredPage.region,
      opportunityType: discoveredPage.opportunity_type,
      educationLevel: discoveredPage.education_level,
      fieldArea: discoveredPage.field_area,
    });

    await supabase
      .from("discovered_pages")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("id", discoveredPageId);

    return NextResponse.json({
      expanded: true,
      discoveredPageId,
      capturedUrl: finalResult.finalUrl,
      captureMethod: capture.captureMethod,
      usedFallback: capture.usedFallback,
      candidateCount: candidates.length,
      savedCount: saved.upserted,
      saved: saved.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        title: row.title,
        url: row.url,
        normalized_url: row.normalized_url,
        discovery_status: row.discovery_status,
        quality_score: row.quality_score,
      })),
    });
  } catch (error) {
    console.error("expand-discovered-page-local error:", error);
    return NextResponse.json(
      { error: "Failed to expand discovered page." },
      { status: 500 }
    );
  }
}
