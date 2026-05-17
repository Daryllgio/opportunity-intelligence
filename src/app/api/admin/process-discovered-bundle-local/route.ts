import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildEvidenceBundleForDiscoveredPage } from "@/lib/discovery/evidence-bundle";
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

    const bundle = await buildEvidenceBundleForDiscoveredPage({
      supabase,
      discoveredPageId,
      maxPages: Number(body.maxPages || 5),
    });

    if (bundle.pages.length === 0 || bundle.evidenceText.length < 500) {
      await supabase
        .from("discovered_pages")
        .update({
          discovery_status: "rejected",
          rejection_reason: "Not enough evidence pages for bundled extraction.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", discoveredPageId);

      return NextResponse.json({
        decision: "reject",
        reason: "not_enough_evidence",
        pageCount: bundle.pages.length,
      });
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
      sourceTrust: String(body.sourceTrust || "standard") as
        | "trusted"
        | "standard"
        | "experimental"
        | "blocked",
    });

    return NextResponse.json({
      discoveredPageId,
      domain: bundle.domain,
      pageCount: bundle.pages.length,
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
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process discovered page bundle.",
      },
      { status: 500 }
    );
  }
}
