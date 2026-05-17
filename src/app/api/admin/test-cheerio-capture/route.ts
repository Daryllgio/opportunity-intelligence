import { NextRequest, NextResponse } from "next/server";
import { capturePageWithCheerio } from "@/lib/discovery/capture/cheerio-capture";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = String(body.url || "").trim();

    if (!url) {
      return NextResponse.json({ error: "Missing url." }, { status: 400 });
    }

    const result = await capturePageWithCheerio(url);

    return NextResponse.json({
      url: result.url,
      finalUrl: result.finalUrl,
      ok: result.ok,
      status: result.status,
      title: result.title,
      textPreview: result.cleanText.slice(0, 600),
      linkCount: result.links.length,
      sampleLinks: result.links.slice(0, 10),
      quality: result.quality,
      error: result.error,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to test Cheerio capture.",
      },
      { status: 500 }
    );
  }
}
