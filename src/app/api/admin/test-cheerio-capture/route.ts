import { NextRequest, NextResponse } from "next/server";
import { capturePageWithHybrid } from "@/lib/discovery/capture/hybrid-capture";
import { detectCandidateOpportunityLinks } from "@/lib/discovery/candidate-detection";
import { normalizeUrl } from "@/lib/utils/url-normalizer";

export async function POST(request: NextRequest) {
  try {
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

    return NextResponse.json({
      url: finalResult.url,
      finalUrl: finalResult.finalUrl,
      captureMethod: result.captureMethod,
      usedFallback: result.usedFallback,
      ok: finalResult.ok,
      status: finalResult.status,
      title: finalResult.title,
      textPreview: finalResult.cleanText.slice(0, 600),
      linkCount: finalResult.links.length,
      sampleLinks: finalResult.links.slice(0, 10),
      pageIsCandidate,
      candidateCount: allCandidates.length,
      candidateLinks: allCandidates.slice(0, 15),
      quality: finalResult.quality,
      cheerioQuality: result.cheerioResult.quality,
      error: finalResult.error,
    });
  } catch (error) {
    console.error("test-cheerio-capture error:", error);
    return NextResponse.json(
      { error: "Failed to test hybrid capture." },
      { status: 500 }
    );
  }
}
