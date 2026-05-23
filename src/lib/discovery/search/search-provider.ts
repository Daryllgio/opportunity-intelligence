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

function isBlockedSearchResult(url: string) {
  const lower = url.toLowerCase();

  return (
    lower.includes("facebook.com") ||
    lower.includes("instagram.com") ||
    lower.includes("linkedin.com") ||
    lower.includes("twitter.com") ||
    lower.includes("x.com/") ||
    lower.includes("youtube.com") ||
    lower.includes("tiktok.com") ||
    lower.includes("/privacy") ||
    lower.includes("/terms") ||
    lower.includes("/cookie") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".zip")
  );
}

export async function searchDiscoveryWeb({
  query,
  maxResults = 10,
}: {
  query: string;
  maxResults?: number;
}): Promise<DiscoverySearchResult[]> {
  const apiKey = getBraveApiKey();

  if (!apiKey) {
    throw new Error("Missing BRAVE_SEARCH_API_KEY.");
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(Math.max(maxResults, 1), 20)));
  url.searchParams.set("search_lang", "en");
  url.searchParams.set("country", "US");
  url.searchParams.set("safesearch", "moderate");
  url.searchParams.set("text_decorations", "false");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Brave Search failed with ${response.status}: ${text || response.statusText}`
    );
  }

  const data = (await response.json()) as BraveSearchResponse;

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
