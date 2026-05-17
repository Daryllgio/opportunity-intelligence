import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { capturePageWithHybrid } from "@/lib/discovery/capture/hybrid-capture";
import { extractDiscoveredOpportunity } from "@/lib/discovery/extract-discovered-opportunity";
import { ingestExtractedOpportunity } from "@/lib/discovery/ingest-extracted-opportunity";

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

      return NextResponse.json({
        decision: "reject",
        reason: "capture_failed_or_too_weak",
        capture: {
          method: capture.captureMethod,
          status: finalResult.status,
          quality: finalResult.quality,
          error: finalResult.error,
        },
      });
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
      sourceTrust: String(body.sourceTrust || "standard") as
        | "trusted"
        | "standard"
        | "experimental"
        | "blocked",
    });

    return NextResponse.json({
      discoveredPageId,
      capturedUrl: finalResult.finalUrl,
      captureMethod: capture.captureMethod,
      usedFallback: capture.usedFallback,
      extraction: extracted,
      ingestion,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process discovered page.",
      },
      { status: 500 }
    );
  }
}
