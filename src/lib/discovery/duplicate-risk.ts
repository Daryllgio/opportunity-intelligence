import { normalizeUrl } from "@/lib/utils/url-normalizer";
import { buildOpportunityCanonicalKey } from "@/lib/opportunities/lifecycle";
import { aggregatorDomains } from "@/lib/discovery/source-quality";

type SupabaseClientLike = {
  from: (table: string) => any;
};

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTitleProviderKey(opportunity: Record<string, unknown>) {
  return `${normalizeText(opportunity.title)}__${normalizeText(
    opportunity.provider
  )}`;
}

function getDomain(value: unknown) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function tokenSet(value: unknown) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length >= 3)
  );
}

function overlapScore(left: unknown, right: unknown) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let shared = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }

  return shared / Math.max(leftTokens.size, rightTokens.size);
}

export async function assessDuplicateRisk({
  supabase,
  opportunity,
}: {
  supabase: SupabaseClientLike;
  opportunity: Record<string, unknown>;
}) {
  const urls = [
    opportunity.source_url,
    opportunity.application_url,
    opportunity.normalized_url,
  ]
    .map((value) => normalizeUrl(String(value || "")))
    .filter(Boolean);

  if (urls.length > 0) {
    const { data: urlMatches, error: urlError } = await supabase
      .from("opportunities")
      .select("id, title, normalized_url, source_url, application_url")
      .or(
        urls
          .map(
            (url) =>
              `normalized_url.eq.${url},source_url.eq.${url},application_url.eq.${url}`
          )
          .join(",")
      )
      .limit(3);

    if (urlError) {
      throw new Error(urlError.message);
    }

    if (urlMatches && urlMatches.length > 0) {
      return {
        duplicateRisk: "high" as const,
        reasons: ["Matching URL already exists in opportunities."],
        matches: urlMatches,
      };
    }

    const { data: draftMatches, error: draftError } = await supabase
      .from("opportunity_drafts")
      .select("id, title, normalized_url, source_url, application_url")
      .or(
        urls
          .map(
            (url) =>
              `normalized_url.eq.${url},source_url.eq.${url},application_url.eq.${url}`
          )
          .join(",")
      )
      .limit(3);

    if (draftError) {
      throw new Error(draftError.message);
    }

    if (draftMatches && draftMatches.length > 0) {
      return {
        duplicateRisk: "medium" as const,
        reasons: ["Matching URL already exists in opportunity drafts."],
        matches: draftMatches,
      };
    }
  }

  const canonicalKey = buildOpportunityCanonicalKey(opportunity);
  const titleProviderKey = getTitleProviderKey(opportunity);
  const sourceDomain =
    getDomain(opportunity.source_url) || getDomain(opportunity.application_url);

  const cleanTitle = String(opportunity.title || "").replace(/[%_,]/g, "").trim();
  const cleanProvider = String(opportunity.provider || "")
    .replace(/[%_,]/g, "")
    .trim();

  const titleQuery = cleanTitle
    ? `title.ilike.%${cleanTitle}%`
    : "title.not.is.null";

  const providerQuery = cleanProvider
    ? `provider.ilike.%${cleanProvider}%`
    : "provider.not.is.null";

  const domainQuery = sourceDomain
    ? `source_url.ilike.%${sourceDomain}%,application_url.ilike.%${sourceDomain}%,normalized_url.ilike.%${sourceDomain}%`
    : "";

  const matchQuery = [
    `canonical_key.eq.${canonicalKey}`,
    titleQuery,
    providerQuery,
    domainQuery,
  ]
    .filter(Boolean)
    .join(",");

  const { data: possibleMatches, error: possibleError } = await supabase
    .from("opportunities")
    .select(
      "id, title, provider, type, canonical_key, cycle_year, deadline, source_url, application_url, normalized_url"
    )
    .or(matchQuery)
    .limit(25);

  if (possibleError) {
    throw new Error(possibleError.message);
  }

  const matches = possibleMatches || [];

  const strongTitleProviderMatch = matches.find(
    (match: Record<string, unknown>) =>
      getTitleProviderKey(match) === titleProviderKey
  );

  if (strongTitleProviderMatch) {
    return {
      duplicateRisk: "medium" as const,
      reasons: ["Similar title/provider already exists."],
      matches: [strongTitleProviderMatch],
    };
  }

  // Aggregator domains come from the single source of truth in source-quality.
  // (Note: pathwaystoscience.org is a trusted_database there, not an aggregator.)
  const sameDomainSimilarOpportunity = matches.find(
    (match: Record<string, unknown>) => {
      const matchDomain =
        getDomain(match.source_url) ||
        getDomain(match.application_url) ||
        getDomain(match.normalized_url);

      if (!sourceDomain || !matchDomain || sourceDomain !== matchDomain) {
        return false;
      }

      const titleOverlap = overlapScore(opportunity.title, match.title);
      const providerOverlap = overlapScore(opportunity.provider, match.provider);

      // Aggregator sites host many unrelated opportunities on the same domain.
      // For those domains, same domain + same type is not duplicate evidence.
      if (aggregatorDomains.has(sourceDomain)) {
        return titleOverlap >= 0.55 || providerOverlap >= 0.55;
      }

      return titleOverlap >= 0.35 || providerOverlap >= 0.35;
    }
  );

  if (sameDomainSimilarOpportunity) {
    return {
      duplicateRisk: "medium" as const,
      reasons: ["Same domain has a similar existing opportunity."],
      matches: [sameDomainSimilarOpportunity],
    };
  }

  const fuzzyTitleProviderMatch = matches.find(
    (match: Record<string, unknown>) =>
      overlapScore(opportunity.title, match.title) >= 0.5 &&
      overlapScore(opportunity.provider, match.provider) >= 0.3
  );

  if (fuzzyTitleProviderMatch) {
    return {
      duplicateRisk: "medium" as const,
      reasons: ["Fuzzy title/provider match found."],
      matches: [fuzzyTitleProviderMatch],
    };
  }

  return {
    duplicateRisk: "low" as const,
    reasons: ["No strong duplicate signals found."],
    matches: [],
  };
}
