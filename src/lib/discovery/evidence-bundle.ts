import { capturePageWithHybrid } from "@/lib/discovery/capture/hybrid-capture";

type SupabaseClientLike = {
  from: (table: string) => any;
};

export type EvidencePage = {
  id: string;
  url: string;
  title: string | null;
  discovery_status: string;
  quality_score: number | null;
  cleanText: string;
  textLength: number;
};

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEvidenceText(pages: EvidencePage[]) {
  return pages
    .map((page, index) => {
      return `
[Evidence Page ${index + 1}]
Title: ${page.title || "Untitled"}
URL: ${page.url}
Status: ${page.discovery_status}
Quality Score: ${page.quality_score ?? "unknown"}

Text:
${page.cleanText.slice(0, 12000)}
`;
    })
    .join("\n\n---\n\n")
    .slice(0, 45000);
}

export async function buildEvidenceBundleForDiscoveredPage({
  supabase,
  discoveredPageId,
  maxPages = 5,
}: {
  supabase: SupabaseClientLike;
  discoveredPageId: string;
  maxPages?: number;
}) {
  const { data: anchorPage, error: anchorError } = await supabase
    .from("discovered_pages")
    .select("*")
    .eq("id", discoveredPageId)
    .maybeSingle();

  if (anchorError) {
    throw new Error(anchorError.message);
  }

  if (!anchorPage) {
    throw new Error("Discovered page not found.");
  }

  const anchorUrl = String(anchorPage.url || anchorPage.normalized_url || "");
  const domain = String(anchorPage.source_domain || getDomain(anchorUrl));

  if (!domain) {
    throw new Error("Could not determine discovered page domain.");
  }

  const { data: relatedPages, error: relatedError } = await supabase
    .from("discovered_pages")
    .select("*")
    .eq("source_domain", domain)
    .in("discovery_status", ["candidate", "needs_more_pages", "review", "rejected"])
    .order("quality_score", { ascending: false, nullsFirst: false })
    .limit(20);

  if (relatedError) {
    throw new Error(relatedError.message);
  }

  const seen = new Set<string>();
  const prioritized = [anchorPage, ...(relatedPages || [])]
    .filter((page: Record<string, unknown>) => {
      const url = String(page.url || page.normalized_url || "");
      if (!url) return false;

      const normalized = url.replace(/#.*$/, "").replace(/\/$/, "");

      if (seen.has(normalized)) return false;
      seen.add(normalized);

      return true;
    })
    .sort((left: Record<string, unknown>, right: Record<string, unknown>) => {
      const leftScore = Number(left.quality_score || 0);
      const rightScore = Number(right.quality_score || 0);

      if (String(left.id) === discoveredPageId) return -1;
      if (String(right.id) === discoveredPageId) return 1;

      return rightScore - leftScore;
    })
    .slice(0, maxPages);

  const evidencePages: EvidencePage[] = [];

  for (const page of prioritized) {
    const url = String(page.url || page.normalized_url || "");

    if (!url) continue;

    const capture = await capturePageWithHybrid(url);
    const finalResult = capture.finalResult;

    if (!finalResult.ok || finalResult.cleanText.length < 300) {
      continue;
    }

    evidencePages.push({
      id: String(page.id),
      url: finalResult.finalUrl,
      title: normalizeText(page.title) || finalResult.title,
      discovery_status: String(page.discovery_status || "candidate"),
      quality_score:
        typeof page.quality_score === "number"
          ? page.quality_score
          : finalResult.quality.score,
      cleanText: finalResult.cleanText,
      textLength: finalResult.cleanText.length,
    });
  }

  return {
    anchorPage,
    domain,
    pages: evidencePages,
    evidenceText: buildEvidenceText(evidencePages),
  };
}
