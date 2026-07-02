import { chromium } from "playwright";
import { createHash } from "crypto";
import {
  evaluatePageQuality,
  type CapturedLink,
  type PageQualityResult,
} from "@/lib/discovery/capture/cheerio-capture";

export type PlaywrightCaptureResult = {
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

export async function capturePageWithPlaywright(
  url: string
): Promise<PlaywrightCaptureResult> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
    });

    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (compatible; OppScoreBot/1.0; +https://oppscores.com)",
    });

    // "domcontentloaded" + a settle delay is far more reliable than
    // "networkidle": analytics-heavy pages never go network-idle and would
    // burn the whole 30s timeout before capturing anything.
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    // Give client-rendered apps a moment to finish late rendering.
    await page.waitForTimeout(2000);

    const status = response?.status() || 0;
    const finalUrl = page.url();
    const title = normalizeWhitespace(await page.title()) || null;

    const html = await page.content();

    const cleanText = normalizeWhitespace(
      await page.locator("body").innerText({ timeout: 5000 }).catch(() => "")
    )
      .replace(/\b(cookie|privacy policy|terms of use|all rights reserved)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50000);

    const links = await page
      .locator("a[href]")
      .evaluateAll((elements) =>
        elements.map((element) => ({
          href: element.getAttribute("href") || "",
          text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180),
        }))
      )
      .catch(() => []);

    const normalizedLinks: CapturedLink[] = [];
    const seen = new Set<string>();

    for (const link of links) {
      const href = absolutizeUrl(link.href, finalUrl);

      if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) {
        continue;
      }

      if (seen.has(href)) continue;

      seen.add(href);
      normalizedLinks.push({
        href,
        text: link.text,
      });
    }

    const quality = evaluatePageQuality({
      cleanText,
      links: normalizedLinks,
      html,
    });

    await browser.close();
    browser = null;

    return {
      url,
      ok: status >= 200 && status < 400,
      status,
      finalUrl,
      htmlHash: html ? hashText(html) : null,
      cleanTextHash: cleanText ? hashText(cleanText) : null,
      title,
      cleanText,
      links: normalizedLinks,
      quality,
      error: status >= 200 && status < 400 ? null : `HTTP ${status}`,
    };
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => undefined);
    }

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
      quality: evaluatePageQuality({
        cleanText: "",
        links: [],
        html: "",
      }),
      error:
        error instanceof Error
          ? error.message
          : "Failed to capture page with Playwright.",
    };
  }
}
