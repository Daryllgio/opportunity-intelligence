import {
  capturePageWithCheerio,
  type CheerioCaptureResult,
} from "@/lib/discovery/capture/cheerio-capture";
import {
  capturePageWithPlaywright,
  type PlaywrightCaptureResult,
} from "@/lib/discovery/capture/playwright-capture";

export type HybridCaptureResult = {
  captureMethod: "cheerio" | "playwright";
  cheerioResult: CheerioCaptureResult;
  finalResult: CheerioCaptureResult | PlaywrightCaptureResult;
  usedFallback: boolean;
};

export type HybridCaptureOptions = {
  /** Allow escalating to a headless browser when the static capture looks
   * like a JS shell. Callers that fetch many URLs (the destination ranker)
   * can disable this for speed. Defaults to true. */
  allowPlaywright?: boolean;
};

/**
 * Escalate to Playwright only when the static capture genuinely failed or
 * looks like an unrendered JS shell. Short pages are NOT a reason by
 * themselves — most real application pages are short, and a Chromium launch
 * costs multiple seconds per URL.
 */
function shouldEscalateToPlaywright(result: CheerioCaptureResult) {
  if (!result.ok) return true;

  const { shellSignalCount, textLength } = result.quality.metrics;

  if (shellSignalCount > 0 && textLength < 3500) return true;
  if (textLength < 400) return true;

  return false;
}

export async function capturePageWithHybrid(
  url: string,
  options: HybridCaptureOptions = {}
): Promise<HybridCaptureResult> {
  const { allowPlaywright = true } = options;

  const cheerioResult = await capturePageWithCheerio(url);

  if (!allowPlaywright || !shouldEscalateToPlaywright(cheerioResult)) {
    return {
      captureMethod: "cheerio",
      cheerioResult,
      finalResult: cheerioResult,
      usedFallback: false,
    };
  }

  const playwrightResult = await capturePageWithPlaywright(url);

  const playwrightIsBetter =
    playwrightResult.ok &&
    playwrightResult.quality.score >= cheerioResult.quality.score &&
    playwrightResult.cleanText.length >= cheerioResult.cleanText.length;

  return {
    captureMethod: playwrightIsBetter ? "playwright" : "cheerio",
    cheerioResult,
    finalResult: playwrightIsBetter ? playwrightResult : cheerioResult,
    usedFallback: true,
  };
}
