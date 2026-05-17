import { normalizeUrl } from "@/lib/utils/url-normalizer";
import type { CandidateOpportunityLink } from "@/lib/discovery/candidate-detection";

type SupabaseClientLike = {
  from: (table: string) => any;
};

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function upsertDiscoveredPages({
  supabase,
  candidates,
  discoveryQuery = null,
  region = null,
  opportunityType = null,
  educationLevel = null,
  fieldArea = null,
}: {
  supabase: SupabaseClientLike;
  candidates: CandidateOpportunityLink[];
  discoveryQuery?: string | null;
  region?: string | null;
  opportunityType?: string | null;
  educationLevel?: string | null;
  fieldArea?: string | null;
}) {
  const now = new Date().toISOString();

  const rows = candidates
    .map((candidate) => {
      const normalizedUrl = candidate.normalizedUrl || normalizeUrl(candidate.url);

      if (!normalizedUrl) return null;

      return {
        discovery_query: discoveryQuery,
        url: candidate.url,
        normalized_url: normalizedUrl,
        title: candidate.linkText || null,
        snippet: candidate.reasons.join("; ") || null,
        source_domain: getDomain(candidate.url),
        region,
        opportunity_type: opportunityType,
        education_level: educationLevel,
        field_area: fieldArea,
        discovery_status: "candidate",
        quality_score: candidate.score,
        rejection_reason: null,
        last_seen_at: now,
        updated_at: now,
      };
    })
    .filter(Boolean);

  if (rows.length === 0) {
    return {
      upserted: 0,
      rows: [],
    };
  }

  const { data, error } = await supabase
    .from("discovered_pages")
    .upsert(rows, {
      onConflict: "normalized_url",
    })
    .select("*");

  if (error) {
    throw new Error(error.message);
  }

  return {
    upserted: data?.length || 0,
    rows: data || [],
  };
}
