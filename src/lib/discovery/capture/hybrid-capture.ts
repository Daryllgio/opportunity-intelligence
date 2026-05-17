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

export async function capturePageWithHybrid(url: string): Promise<HybridCaptureResult> {
  const cheerioResult = await capturePageWithCheerio(url);

  const shouldUsePlaywright =
    !cheerioResult.ok ||
    cheerioResult.quality.shouldFallbackToPlaywright ||
    cheerioResult.cleanText.length < 2000;

  if (!shouldUsePlaywright) {
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
