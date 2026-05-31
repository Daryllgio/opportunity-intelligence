import * as cheerio from "cheerio";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/admin";
import { isPubliclyFetchableUrl } from "@/lib/utils/url-safety";

type CandidateLink = {
  title: string;
  url: string;
  reason: string;
  score: number;
};

const opportunityKeywords = [
  "scholarship",
  "scholarships",
  "fellowship",
  "fellowships",
  "grant",
  "grants",
  "award",
  "awards",
  "funding",
  "bursary",
  "research",
  "internship",
  "conference",
  "summit",
  "competition",
  "challenge",
  "leadership",
  "program",
  "opportunity",
  "apply",
  "application",
];

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeUrl(href: string, baseUrl: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function scoreCandidate(title: string, url: string) {
  const combined = `${title} ${url}`.toLowerCase();
  let score = 0;
  const matchedKeywords: string[] = [];

  for (const keyword of opportunityKeywords) {
    if (combined.includes(keyword)) {
      score += 10;
      matchedKeywords.push(keyword);
    }
  }

  if (combined.includes("deadline")) score += 8;
  if (combined.includes("eligibility")) score += 8;
  if (combined.includes("apply")) score += 8;
  if (combined.includes("student")) score += 5;
  if (combined.includes("undergraduate")) score += 5;
  if (combined.includes("graduate")) score += 5;

  if (combined.includes("login")) score -= 15;
  if (combined.includes("privacy")) score -= 15;
  if (combined.includes("terms")) score -= 15;
  if (combined.includes("contact")) score -= 8;
  if (combined.includes("facebook")) score -= 20;
  if (combined.includes("instagram")) score -= 20;
  if (combined.includes("linkedin")) score -= 20;
  if (combined.includes("youtube")) score -= 20;

  const reason =
    matchedKeywords.length > 0
      ? `Matched: ${Array.from(new Set(matchedKeywords)).slice(0, 5).join(", ")}`
      : "Possible source link";

  return { score, reason };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const sourceUrl = body.url;

    if (!sourceUrl || typeof sourceUrl !== "string") {
      return NextResponse.json(
        { error: "A source URL is required." },
        { status: 400 }
      );
    }

    if (!isPubliclyFetchableUrl(sourceUrl)) {
      return NextResponse.json(
        { error: "Only valid http/https URLs are supported." },
        { status: 400 }
      );
    }

    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; OppScoreBot/0.1; +https://oppscore.app)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Could not fetch source. Status: ${response.status}` },
        { status: 400 }
      );
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      return NextResponse.json(
        {
          error:
            "This source does not appear to be an HTML page. PDFs and file sources will be handled later.",
        },
        { status: 400 }
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $("script, style, noscript, svg").remove();

    const candidatesByUrl = new Map<string, CandidateLink>();

    $("a[href]").each((_, element) => {
      const rawHref = $(element).attr("href");
      if (!rawHref) return;

      const normalizedUrl = normalizeUrl(rawHref, sourceUrl);
      if (!normalizedUrl) return;

      const title = cleanText($(element).text()) || normalizedUrl;
      if (!title || title.length < 3) return;

      const { score, reason } = scoreCandidate(title, normalizedUrl);

      if (score <= 0) return;

      const existing = candidatesByUrl.get(normalizedUrl);

      if (!existing || score > existing.score) {
        candidatesByUrl.set(normalizedUrl, {
          title: title.slice(0, 160),
          url: normalizedUrl,
          reason,
          score,
        });
      }
    });

    const candidates = Array.from(candidatesByUrl.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);

    return NextResponse.json({
      sourceUrl,
      candidates,
      totalCandidates: candidates.length,
    });
  } catch (error) {
    console.error("scan-source error:", error);
    return NextResponse.json(
      { error: "Something went wrong while scanning this source." },
      { status: 500 }
    );
  }
}
