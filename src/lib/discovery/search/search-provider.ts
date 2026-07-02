import { withRetry } from "@/lib/utils/retry";
import { withTimeout } from "@/lib/utils/timeout";
import { isBlockedDiscoveryUrl } from "@/lib/discovery/domain-policy";

export type DiscoverySearchResult = {
  title: string | null;
  url: string;
  snippet: string | null;
};

type BraveWebResult = {
  title?: string;
  url?: string;
  description?: string;
};

type BraveSearchResponse = {
  web?: {
    results?: BraveWebResult[];
  };
};

function getBraveApiKey() {
  return process.env.BRAVE_SEARCH_API_KEY || "";
}

function cleanResultUrl(value: unknown) {
  const raw = String(value || "").trim();

  if (!raw) return null;

  try {
    const parsed = new URL(raw);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

const BLOCKED_RESULT_PATH_SIGNALS = ["/privacy", "/terms", "/cookie"];

const BLOCKED_RESULT_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".zip",
  ".mp4",
  ".mp3",
];

function isBlockedSearchResult(url: string) {
  if (isBlockedDiscoveryUrl(url)) return true;

  const lower = url.toLowerCase();

  if (BLOCKED_RESULT_PATH_SIGNALS.some((signal) => lower.includes(signal))) {
    return true;
  }

  const path = lower.split("?")[0];

  return BLOCKED_RESULT_EXTENSIONS.some((extension) => path.endsWith(extension));
}

// Brave's standard plans allow ~1 request/second. Space calls out globally so
// campaign loops and the destination ranker never trip 429s in bursts.
const MIN_MS_BETWEEN_CALLS = 1100;
let nextAllowedCallAt = 0;

async function respectRateLimit() {
  const now = Date.now();
  const waitMs = nextAllowedCallAt - now;

  nextAllowedCallAt = Math.max(now, nextAllowedCallAt) + MIN_MS_BETWEEN_CALLS;

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

async function fetchBravePage(query: string, count: number) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(Math.max(count, 1), 20)));
  url.searchParams.set("search_lang", "en");
  url.searchParams.set("country", "US");
  url.searchParams.set("safesearch", "moderate");
  url.searchParams.set("text_decorations", "false");

  await respectRateLimit();

  const response = await withTimeout(
    (signal) =>
      fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": getBraveApiKey(),
        },
        signal,
      }),
    15000,
    "Brave search"
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // Include the status code in the message so isRetryableError picks up
    // 429/5xx and withRetry backs off.
    throw new Error(
      `Brave Search failed with ${response.status}: ${text || response.statusText}`
    );
  }

  return (await response.json()) as BraveSearchResponse;
}

export async function searchDiscoveryWeb({
  query,
  maxResults = 10,
}: {
  query: string;
  maxResults?: number;
}): Promise<DiscoverySearchResult[]> {
  if (!getBraveApiKey()) {
    throw new Error("Missing BRAVE_SEARCH_API_KEY.");
  }

  const data = await withRetry(() => fetchBravePage(query, maxResults), {
    maxRetries: 2,
    baseDelayMs: 1500,
  });

  const seen = new Set<string>();
  const results: DiscoverySearchResult[] = [];

  for (const item of data.web?.results || []) {
    const cleanedUrl = cleanResultUrl(item.url);

    if (!cleanedUrl) continue;
    if (isBlockedSearchResult(cleanedUrl)) continue;

    const dedupeKey = cleanedUrl.replace(/#.*$/, "").replace(/\/$/, "");

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    results.push({
      title: item.title || null,
      url: cleanedUrl,
      snippet: item.description || null,
    });

    if (results.length >= maxResults) break;
  }

  return results;
}
