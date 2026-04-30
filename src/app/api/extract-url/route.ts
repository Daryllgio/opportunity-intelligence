import * as cheerio from "cheerio";
import { NextRequest, NextResponse } from "next/server";

function cleanText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

function isAllowedUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = body.url;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "A valid URL is required." },
        { status: 400 }
      );
    }

    if (!isAllowedUrl(url)) {
      return NextResponse.json(
        { error: "Only valid http/https URLs are supported." },
        { status: 400 }
      );
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; OppScoreBot/0.1; +https://oppscore.app)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Could not fetch URL. Status: ${response.status}`,
        },
        { status: 400 }
      );
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      return NextResponse.json(
        {
          error:
            "This URL does not appear to be an HTML page. PDFs and other file types will be handled later.",
        },
        { status: 400 }
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $("script, style, nav, footer, header, noscript, svg").remove();

    const title = cleanText($("title").first().text());
    const metaDescription = cleanText(
      $('meta[name="description"]').attr("content") || ""
    );

    const headings = $("h1, h2, h3")
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter(Boolean)
      .slice(0, 20);

    const paragraphs = $("p, li")
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter((item) => item.length > 30)
      .slice(0, 120);

    const extractedText = [
      title && `Page title: ${title}`,
      metaDescription && `Meta description: ${metaDescription}`,
      headings.length > 0 && `Headings:\n${headings.join("\n")}`,
      paragraphs.length > 0 && `Page text:\n${paragraphs.join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!extractedText || extractedText.length < 100) {
      return NextResponse.json(
        {
          error:
            "Could not extract enough readable text from this page. Try pasting the opportunity text manually.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      url,
      title,
      text: extractedText.slice(0, 15000),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while fetching the URL.",
      },
      { status: 500 }
    );
  }
}
