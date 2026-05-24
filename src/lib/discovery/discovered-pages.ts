import { normalizeUrl } from "@/lib/utils/url-normalizer";
import type { CandidateOpportunityLink } from "@/lib/discovery/candidate-detection";
import { buildOpportunityFamilyKey } from "@/lib/discovery/family-key";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type DiscoveredPageCandidate = CandidateOpportunityLink & {
  inferredOpportunityType?: string | null;
  opportunityType?: string | null;
};

const PROTECTED_STATUSES = new Set([
  "bundled",
  "future_tracking",
  "review",
  "published",
  "rejected",
  "ignored",
]);

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function shouldRejectDiscoveredUrl(url: string) {
  const lower = url.toLowerCase();

  const blockedSignals = [
    "/login",
    "sign_in",
    "sign-in",
    "/password",
    "password/reset",
    "/privacy",
    "privacy-policy",
    "/terms",
    "/cookie",
    "/contact",
    "/newsletter",
    "/videos",
    "/wages",
    "/careers",
    "/maps/",
    "/course-search",
    "/university-search",
    "/majors-home",
    "/colleges",
    "/admin",
    "cms.omniupdate.com",
    "manage/login",
  ];

  const allowedSignals = [
    "/scholarship",
    "/scholarships",
    "/apply",
    "/application",
    "/eligibility",
    "/requirements",
    "/how-to-apply",
    "/program",
    "/programs",
    "/research-training",
    "/financial-aid",
    "/funding",
  ];

  if (allowedSignals.some((signal) => lower.includes(signal))) {
    return false;
  }

  return blockedSignals.some((signal) => lower.includes(signal));
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
  candidates: DiscoveredPageCandidate[];
  discoveryQuery?: string | null;
  region?: string | null;
  opportunityType?: string | null;
  educationLevel?: string | null;
  fieldArea?: string | null;
}) {
  const now = new Date().toISOString();

  const preparedRows = candidates
    .map((candidate) => {
      const normalizedUrl = candidate.normalizedUrl || normalizeUrl(candidate.url);

      if (!normalizedUrl) return null;

      if (shouldRejectDiscoveredUrl(normalizedUrl)) return null;

      const effectiveOpportunityType =
        candidate.inferredOpportunityType || candidate.opportunityType || opportunityType;

      return {
        discovery_query: discoveryQuery,
        url: candidate.url,
        normalized_url: normalizedUrl,
        title: candidate.linkText || null,
        snippet: candidate.reasons.join("; ") || null,
        source_domain: getDomain(candidate.url),
        region,
        opportunity_type: effectiveOpportunityType,
        education_level: educationLevel,
        field_area: fieldArea,
        opportunity_family_key: buildOpportunityFamilyKey({
          url: candidate.url,
          sourceDomain: getDomain(candidate.url),
          opportunityType: effectiveOpportunityType,
          title: candidate.linkText,
          discoveryQuery,
        }),
        discovery_status: "candidate",
        quality_score: candidate.score,
        rejection_reason: null,
        last_seen_at: now,
        updated_at: now,
      };
    })
    .filter(
      (row): row is NonNullable<typeof row> => row !== null
    );

  if (preparedRows.length === 0) {
    return {
      upserted: 0,
      rows: [],
    };
  }

  const normalizedUrls = preparedRows
    .map((row) => String(row.normalized_url || ""))
    .filter(Boolean);

  const { data: existingRows, error: existingError } = await supabase
    .from("discovered_pages")
    .select("id, normalized_url, discovery_status")
    .in("normalized_url", normalizedUrls);

  if (existingError) {
    throw new Error(existingError.message);
  }

  type ExistingDiscoveredPageRow = {
    id: string;
    normalized_url: string;
    discovery_status: string | null;
  };

  const existingByUrl = new Map<string, ExistingDiscoveredPageRow>(
    ((existingRows || []) as ExistingDiscoveredPageRow[]).map((row) => [
      String(row.normalized_url),
      row,
    ])
  );

  const savedRows = [];

  for (const row of preparedRows) {
    const existing = existingByUrl.get(String(row.normalized_url));

    if (existing?.id) {
      const currentStatus = String(existing.discovery_status || "");

      const updatePayload = {
        discovery_query: row.discovery_query,
        url: row.url,
        title: row.title,
        snippet: row.snippet,
        source_domain: row.source_domain,
        region: row.region,
        opportunity_type: row.opportunity_type,
        education_level: row.education_level,
        field_area: row.field_area,
        quality_score: row.quality_score,
        last_seen_at: now,
        updated_at: now,
        ...(PROTECTED_STATUSES.has(currentStatus)
          ? {}
          : {
              opportunity_family_key: row.opportunity_family_key,
              discovery_status: "candidate",
              rejection_reason: null,
            }),
      };

      const { data, error } = await supabase
        .from("discovered_pages")
        .update(updatePayload)
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      savedRows.push(data);
      continue;
    }

    const { data, error } = await supabase
      .from("discovered_pages")
      .insert(row)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    savedRows.push(data);
  }

  return {
    upserted: savedRows.length,
    rows: savedRows,
  };
}
