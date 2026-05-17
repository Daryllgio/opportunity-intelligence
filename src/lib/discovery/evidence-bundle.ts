import { capturePageWithHybrid } from "@/lib/discovery/capture/hybrid-capture";
import { evaluateEvidenceCoverage } from "@/lib/discovery/evidence-coverage";
import { scorePageUsefulness } from "@/lib/discovery/page-usefulness";

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
  maxPages = 10,
  stopWhenComplete = true,
}: {
  supabase: SupabaseClientLike;
  discoveredPageId: string;
  maxPages?: number;
  stopWhenComplete?: boolean;
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

      const usefulness = scorePageUsefulness({
        title: String(page.title || ""),
        url,
        opportunityType: String(anchorPage.opportunity_type || ""),
        existingQualityScore: Number(page.quality_score || 0),
      });

      return !usefulness.shouldIgnore || String(page.id) === discoveredPageId;
    })
    .sort((left: Record<string, unknown>, right: Record<string, unknown>) => {
      if (String(left.id) === discoveredPageId) return -1;
      if (String(right.id) === discoveredPageId) return 1;

      const leftUsefulness = scorePageUsefulness({
        title: String(left.title || ""),
        url: String(left.url || left.normalized_url || ""),
        opportunityType: String(anchorPage.opportunity_type || ""),
        existingQualityScore: Number(left.quality_score || 0),
      });

      const rightUsefulness = scorePageUsefulness({
        title: String(right.title || ""),
        url: String(right.url || right.normalized_url || ""),
        opportunityType: String(anchorPage.opportunity_type || ""),
        existingQualityScore: Number(right.quality_score || 0),
      });

      return rightUsefulness.score - leftUsefulness.score;
    })
    .slice(0, maxPages);

  const evidencePages: EvidencePage[] = [];
  let coverage = evaluateEvidenceCoverage({
    text: "",
    opportunityType: String(anchorPage.opportunity_type || ""),
  });

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

    coverage = evaluateEvidenceCoverage({
      text: buildEvidenceText(evidencePages),
      opportunityType: String(anchorPage.opportunity_type || ""),
    });

    if (stopWhenComplete && coverage.completeEnough) {
      break;
    }

    if (evidencePages.length >= maxPages) {
      break;
    }
  }

  return {
    anchorPage,
    domain,
    pages: evidencePages,
    evidenceText: buildEvidenceText(evidencePages),
    coverage,
  };
}
