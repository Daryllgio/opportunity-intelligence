import { NextRequest, NextResponse } from "next/server";
import { capturePageWithHybrid } from "@/lib/discovery/capture/hybrid-capture";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = String(body.url || "").trim();

    if (!url) {
      return NextResponse.json({ error: "Missing url." }, { status: 400 });
    }

    const result = await capturePageWithHybrid(url);
    const finalResult = result.finalResult;

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
      quality: finalResult.quality,
      cheerioQuality: result.cheerioResult.quality,
      error: finalResult.error,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to test hybrid capture.",
      },
      { status: 500 }
    );
  }
}
