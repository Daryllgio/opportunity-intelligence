import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { capturePageWithHybrid } from "@/lib/discovery/capture/hybrid-capture";
import { detectCandidateOpportunityLinks } from "@/lib/discovery/candidate-detection";
import { upsertDiscoveredPages } from "@/lib/discovery/discovered-pages";
import { normalizeUrl } from "@/lib/utils/url-normalizer";

function createSupabaseForRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseForRequest(request);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.is_admin) {
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const url = String(body.url || "").trim();

    if (!url) {
      return NextResponse.json({ error: "Missing url." }, { status: 400 });
    }

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
      quality: finalResult.quality,
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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to discover candidates.",
      },
      { status: 500 }
    );
  }
}
