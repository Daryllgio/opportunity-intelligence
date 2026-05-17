import * as cheerio from "cheerio";
import { createHash } from "crypto";

export type CapturedLink = {
  href: string;
  text: string;
};

export type CheerioCaptureResult = {
  url: string;
  ok: boolean;
  status: number;
  finalUrl: string;
  htmlHash: string | null;
  cleanTextHash: string | null;
  title: string | null;
  cleanText: string;
  links: CapturedLink[];
  quality: PageQualityResult;
  error: string | null;
};

export type PageQualityResult = {
  score: number;
  shouldFallbackToPlaywright: boolean;
  shouldRejectBeforeAI: boolean;
  reasons: string[];
  metrics: {
    textLength: number;
    linkCount: number;
    opportunitySignalCount: number;
    strongSignalCount: number;
    shellSignalCount: number;
    navNoiseSignalCount: number;
  };
};

const OPPORTUNITY_SIGNALS = [
  "scholarship",
  "fellowship",
  "grant",
  "award",
  "bursary",
  "research",
  "program",
  "competition",
  "challenge",
  "leadership",
  "career development",
  "professional development",
  "pipeline program",
  "students",
  "undergraduate",
  "graduate",
  "phd",
  "medical student",
  "law student",
  "mba",
];

const STRONG_SIGNALS = [
  "deadline",
  "eligibility",
  "eligible",
  "apply",
  "application",
  "requirements",
  "selection criteria",
  "funding",
  "stipend",
  "tuition",
  "award amount",
  "financial support",
];

const SHELL_SIGNALS = [
  'id="root"',
  'id="__next"',
  'id="app"',
  "enable javascript",
  "javascript is required",
  "window.__",
  "__webpack",
];

const NAV_NOISE_SIGNALS = [
  "privacy policy",
  "cookie policy",
  "terms of use",
  "all rights reserved",
  "subscribe to our newsletter",
  "follow us on",
];

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function absolutizeUrl(href: string, baseUrl: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return "";
  }
}

function extractCleanText($: cheerio.CheerioAPI) {
  $("script, style, noscript, svg, canvas, iframe, nav, footer, header").remove();

  return normalizeWhitespace($("body").text())
    .replace(/\b(cookie|privacy policy|terms of use|all rights reserved)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50000);
}

function extractLinks($: cheerio.CheerioAPI, baseUrl: string): CapturedLink[] {
  const links: CapturedLink[] = [];

  $("a[href]").each((_, element) => {
    const rawHref = $(element).attr("href") || "";
    const href = absolutizeUrl(rawHref, baseUrl);
    const text = normalizeWhitespace($(element).text()).slice(0, 180);

    if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }

    links.push({ href, text });
  });

  const seen = new Set<string>();

  return links.filter((link) => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

export function evaluatePageQuality({
  cleanText,
  links,
  html,
}: {
  cleanText: string;
  links: CapturedLink[];
  html: string;
}): PageQualityResult {
  const normalizedText = cleanText.toLowerCase();
  const normalizedHtml = html.toLowerCase();

  const opportunitySignalCount = OPPORTUNITY_SIGNALS.filter((signal) =>
    normalizedText.includes(signal)
  ).length;

  const strongSignalCount = STRONG_SIGNALS.filter((signal) =>
    normalizedText.includes(signal)
  ).length;

  const shellSignalCount = SHELL_SIGNALS.filter((signal) =>
    normalizedHtml.includes(signal)
  ).length;

  const navNoiseSignalCount = NAV_NOISE_SIGNALS.filter((signal) =>
    normalizedText.includes(signal)
  ).length;

  let score = 0;
  const reasons: string[] = [];

  if (cleanText.length >= 5000) score += 35;
  else if (cleanText.length >= 3500) score += 28;
  else if (cleanText.length >= 2000) score += 20;
  else if (cleanText.length >= 1000) score += 10;
  else reasons.push("Clean text is short.");

  if (links.length >= 20) score += 12;
  else if (links.length >= 8) score += 8;
  else if (links.length >= 3) score += 4;

  score += Math.min(opportunitySignalCount * 4, 24);
  score += Math.min(strongSignalCount * 5, 25);

  if (cleanText.length >= 2000 && strongSignalCount >= 4) {
    score += 8;
  }

  if (shellSignalCount > 0 && cleanText.length < 2000) {
    score -= 30;
    reasons.push("Page looks JavaScript-rendered or shell-like.");
  }

  if (navNoiseSignalCount >= 3 && cleanText.length < 2500) {
    score -= 12;
    reasons.push("Extracted text appears navigation/legal-heavy.");
  }

  score = Math.max(0, Math.min(score, 100));

  const shouldFallbackToPlaywright =
    score < 70 ||
    cleanText.length < 2000 ||
    strongSignalCount < 3 ||
    (shellSignalCount > 0 && cleanText.length < 3500);

  const shouldRejectBeforeAI =
    score < 35 &&
    cleanText.length < 1000 &&
    opportunitySignalCount < 2 &&
    strongSignalCount < 2;

  if (shouldFallbackToPlaywright) {
    reasons.push("Cheerio capture is not strong enough for reliable extraction.");
  }

  if (shouldRejectBeforeAI) {
    reasons.push("Page is too weak to send to AI without better capture.");
  }

  return {
    score,
    shouldFallbackToPlaywright,
    shouldRejectBeforeAI,
    reasons,
    metrics: {
      textLength: cleanText.length,
      linkCount: links.length,
      opportunitySignalCount,
      strongSignalCount,
      shellSignalCount,
      navNoiseSignalCount,
    },
  };
}

export async function capturePageWithCheerio(url: string): Promise<CheerioCaptureResult> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; OppScoreBot/1.0; +https://oppscores.com)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
      },
      redirect: "follow",
      cache: "no-store",
    });

    const html = await response.text();
    const finalUrl = response.url || url;
    const $ = cheerio.load(html);

    const title = normalizeWhitespace($("title").first().text()) || null;
    const cleanText = extractCleanText($);
    const links = extractLinks($, finalUrl);
    const quality = evaluatePageQuality({ cleanText, links, html });

    return {
      url,
      ok: response.ok,
      status: response.status,
      finalUrl,
      htmlHash: html ? hashText(html) : null,
      cleanTextHash: cleanText ? hashText(cleanText) : null,
      title,
      cleanText,
      links,
      quality,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      finalUrl: url,
      htmlHash: null,
      cleanTextHash: null,
      title: null,
      cleanText: "",
      links: [],
      quality: evaluatePageQuality({ cleanText: "", links: [], html: "" }),
      error:
        error instanceof Error ? error.message : "Failed to capture page with Cheerio.",
    };
  }
}
