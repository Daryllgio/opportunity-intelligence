import { createHash } from "crypto";

export type PageRecheckResult = {
  url: string;
  ok: boolean;
  status: number;
  rawHash: string | null;
  cleanHash: string | null;
  cleanText: string;
  error: string | null;
};

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
}

export function cleanPageText(html: string) {
  return stripHtml(html)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\b(cookie|privacy policy|terms of use|all rights reserved)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30000);
}

export async function fetchAndHashOpportunityPage(url: string): Promise<PageRecheckResult> {
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

    const rawText = await response.text();
    const cleanText = cleanPageText(rawText);

    return {
      url,
      ok: response.ok,
      status: response.status,
      rawHash: rawText ? hashText(rawText) : null,
      cleanHash: cleanText ? hashText(cleanText) : null,
      cleanText,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      rawHash: null,
      cleanHash: null,
      cleanText: "",
      error:
        error instanceof Error ? error.message : "Failed to fetch opportunity page.",
    };
  }
}

export function pickRecheckUrl(opportunity: Record<string, unknown>) {
  return String(
    opportunity.source_url ||
      opportunity.application_url ||
      opportunity.normalized_url ||
      ""
  ).trim();
}
