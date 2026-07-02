import {
  AGGREGATOR_DOMAINS,
  APPLICATION_PORTAL_DOMAINS,
  GENERIC_HOSTING_DOMAINS,
  INFORMATIONAL_DOMAINS,
  NEWS_DOMAINS,
  OFFICIAL_PROVIDER_DOMAINS,
  SEARCH_AND_APP_STORE_DOMAINS,
  SOCIAL_MEDIA_DOMAINS,
  TRUSTED_DATABASE_DOMAINS,
  domainInSet,
  getDomain as getPolicyDomain,
  isGovernmentDomain,
  isUniversityDomain,
  providerMatchesDomain,
} from "@/lib/discovery/domain-policy";
import {
  normalizeMatchText,
  tokenOverlap,
} from "@/lib/discovery/text-match";

export type SourceTrust = "trusted" | "standard" | "experimental" | "blocked";

export type SourceCategory =
  | "government"
  | "university"
  | "official_provider"
  | "foundation_or_nonprofit"
  | "application_portal"
  | "trusted_database"
  | "aggregator"
  | "low_trust_blog"
  | "unknown"
  | "blocked";

export type SourceQuality = {
  domain: string | null;
  category: SourceCategory;
  trust: SourceTrust;
  isAggregator: boolean;
  isOfficialLeaning: boolean;
  reasons: string[];
};

export type ApplicationUrlQuality =
  | "official_application"
  | "third_party_application_portal"
  | "aggregator_application"
  | "same_as_source"
  | "missing_application"
  | "unknown_application";

export type ReviewFlag =
  | "needs_official_source"
  | "aggregator_hosted"
  | "aggregator_application"
  | "missing_application_url"
  | "application_same_as_source"
  | "unknown_application_url"
  | "low_trust_source"
  | "unknown_source_category"
  | "missing_provider"
  | "weak_provider"
  | "low_confidence_deadline"
  | "medium_duplicate_risk"
  | "high_duplicate_risk"
  | "needs_more_pages"
  | "closed_opportunity";

export type AggregatorBehaviorResult = {
  isAggregatorLike: boolean;
  score: number;
  reasons: string[];
};

export type ProviderSourceRelationship = {
  isProviderAligned: boolean;
  score: number;
  reasons: string[];
};

export const getDomain = getPolicyDomain;

// Backwards-compatible re-exports. The canonical lists live in domain-policy.
export const aggregatorDomains = AGGREGATOR_DOMAINS as Set<string>;
export const trustedDatabaseDomains = TRUSTED_DATABASE_DOMAINS as Set<string>;
export const officialProviderDomains = OFFICIAL_PROVIDER_DOMAINS as Set<string>;
export const applicationPortalDomains = APPLICATION_PORTAL_DOMAINS as Set<string>;
export const lowTrustDomains = GENERIC_HOSTING_DOMAINS as Set<string>;

/** Domains that are blocked everywhere (never sources, never destinations). */
export const blockedDomains: Set<string> = new Set([
  ...SOCIAL_MEDIA_DOMAINS,
  ...INFORMATIONAL_DOMAINS,
  ...NEWS_DOMAINS,
  ...SEARCH_AND_APP_STORE_DOMAINS,
]);

function sameOrRelatedDomain(left: string | null, right: string | null) {
  if (!left || !right) return false;

  return (
    left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`)
  );
}

export function isKnownAggregatorDomain(urlOrDomain: string | null | undefined) {
  return domainInSet(getPolicyDomain(urlOrDomain), AGGREGATOR_DOMAINS);
}

export function isKnownBlockedDomain(urlOrDomain: string | null | undefined) {
  return domainInSet(getPolicyDomain(urlOrDomain), blockedDomains);
}

function isFoundationOrNonprofitDomain(domain: string) {
  return (
    domain.endsWith(".org") ||
    domain.includes("foundation") ||
    domain.includes("fund") ||
    domain.includes("trust") ||
    domain.includes("institute")
  );
}

export function detectAggregatorBehavior({
  url,
  title,
  text,
  provider,
}: {
  url?: string | null;
  title?: string | null;
  text?: string | null;
  provider?: string | null;
}): AggregatorBehaviorResult {
  const domain = getPolicyDomain(url);
  const combined = normalizeMatchText([title, text, url].filter(Boolean).join(" "));
  const reasons: string[] = [];
  let score = 0;

  if (domain && isKnownAggregatorDomain(domain)) {
    score += 100;
    reasons.push("Known opportunity aggregator/database domain.");
  }

  const generalOpportunityAggregatorSignals = [
    "opportunity database",
    "opportunity directory",
    "browse opportunities",
    "search opportunities",
    "recommended opportunities",
    "similar opportunities",
    "matched opportunities",
    "student opportunities",
    "funding opportunities",
    "external opportunities",
    "listing of opportunities",
    "opportunities for students",
    "save this opportunity",
    "create a profile",
    "sign up to apply",
    "log in to apply",
    "more opportunities like this",
    "find opportunities",
    "apply to opportunities",
  ];

  for (const signal of generalOpportunityAggregatorSignals) {
    if (combined.includes(normalizeMatchText(signal))) {
      score += 18;
      reasons.push(`Opportunity aggregator behavior signal: ${signal}.`);
    }
  }

  const typedAggregatorSignals = [
    // Scholarships.
    "scholarship database",
    "scholarship directory",
    "search scholarships",
    "find scholarships",
    "matched scholarships",
    "recommended scholarships",
    "similar scholarships",
    "scholarship matches",
    "college scholarships",
    "top scholarships",
    "featured scholarships",
    "no essay scholarship",
    // Research programs.
    "research opportunity database",
    "research opportunities database",
    "undergraduate research opportunities",
    "summer research program list",
    "research program list",
    "research program directory",
    "student research opportunities",
    // Fellowships.
    "fellowship database",
    "fellowship directory",
    "search fellowships",
    "find fellowships",
    "external fellowships",
    "national fellowship listings",
    "fellowship advising search",
    // Grants.
    "grant database",
    "grant directory",
    "grant search",
    "funding database",
    "funding directory",
    "funding opportunity database",
    "funding opportunity search",
    // Competitions.
    "competition directory",
    "competition database",
    "student competitions",
    "case competition list",
    "hackathon directory",
    "challenge database",
    "pitch competition list",
    // Leadership / career / pipeline.
    "leadership program directory",
    "leadership program list",
    "career development program list",
    "career development programs",
    "pipeline program directory",
    "pipeline program list",
    "student program directory",
    "student programs directory",
  ];

  for (const signal of typedAggregatorSignals) {
    if (combined.includes(normalizeMatchText(signal))) {
      score += 14;
      reasons.push(`Aggregator signal: ${signal}.`);
    }
  }

  const weakDirectorySignals = [
    "directory",
    "database",
    "browse",
    "search results",
    "filter by",
    "sort by",
    "results found",
    "view all",
    "learn more about this opportunity",
  ];

  for (const signal of weakDirectorySignals) {
    if (combined.includes(normalizeMatchText(signal))) {
      score += 5;
      reasons.push(`Weak directory/listing signal: ${signal}.`);
    }
  }

  const providerDomainMatch = providerMatchesDomain(provider, domain);
  const pageProviderOverlap = tokenOverlap(provider, combined);

  if (provider && domain && !providerDomainMatch.matched && pageProviderOverlap < 0.25) {
    score += 10;
    reasons.push("Provider does not appear aligned with source domain/page.");
  }

  return {
    isAggregatorLike: score >= 35,
    score,
    reasons,
  };
}

/**
 * Does this provider plausibly OWN this URL's domain?
 *
 * `isProviderAligned` is true only on real domain-level ownership evidence.
 * A page merely MENTIONING the provider (Wikipedia articles, news stories,
 * aggregator listings all do) contributes to `score` and `reasons` but can
 * never set `isProviderAligned` by itself — that was the root cause of
 * informational pages being treated as verified official destinations.
 */
export function assessProviderSourceRelationship({
  provider,
  url,
  pageText,
}: {
  provider?: string | null;
  url?: string | null;
  pageText?: string | null;
}): ProviderSourceRelationship {
  const domain = getPolicyDomain(url);
  const reasons: string[] = [];
  let score = 0;

  if (!provider || !domain) {
    return {
      isProviderAligned: false,
      score: 0,
      reasons: ["Missing provider or source domain."],
    };
  }

  const domainMatch = providerMatchesDomain(provider, domain);
  const providerPageOverlap = tokenOverlap(provider, pageText || "");

  if (domainMatch.matched) {
    score += 60;
    reasons.push("Provider name aligns with source domain.");
    if (domainMatch.reason) reasons.push(domainMatch.reason);
  }

  if (providerPageOverlap >= 0.45) {
    score += 20;
    reasons.push("Provider is clearly mentioned on the page.");
  } else if (providerPageOverlap >= 0.25) {
    score += 10;
    reasons.push("Provider is partially mentioned on the page.");
  }

  if (isKnownAggregatorDomain(domain)) {
    score -= 60;
    reasons.push("Source domain is a known aggregator, not provider-aligned.");
  }

  return {
    isProviderAligned: domainMatch.matched && !isKnownAggregatorDomain(domain),
    score,
    reasons,
  };
}

export function assessSourceQuality(url: string | null | undefined): SourceQuality {
  const domain = getPolicyDomain(url);

  if (!domain) {
    return {
      domain: null,
      category: "unknown",
      trust: "experimental",
      isAggregator: false,
      isOfficialLeaning: false,
      reasons: ["Missing or invalid source URL."],
    };
  }

  // Blocked-everywhere domains (social, informational, news, search/app
  // stores). Checked before every heuristic so wikipedia.org can never fall
  // through to "trusted foundation" via its .org TLD.
  if (domainInSet(domain, blockedDomains)) {
    return {
      domain,
      category: "blocked",
      trust: "blocked",
      isAggregator: false,
      isOfficialLeaning: false,
      reasons: ["Blocked domain (social/informational/news/search)."],
    };
  }

  if (domainInSet(domain, AGGREGATOR_DOMAINS)) {
    return {
      domain,
      category: "aggregator",
      trust: "standard",
      isAggregator: true,
      isOfficialLeaning: false,
      reasons: [
        "Aggregator source. Useful for discovery, but requires review before publishing.",
      ],
    };
  }

  if (domainInSet(domain, TRUSTED_DATABASE_DOMAINS)) {
    return {
      domain,
      category: "trusted_database",
      trust: "standard",
      isAggregator: false,
      isOfficialLeaning: false,
      reasons: ["Trusted opportunity database."],
    };
  }

  if (domainInSet(domain, OFFICIAL_PROVIDER_DOMAINS)) {
    return {
      domain,
      category: "official_provider",
      trust: "trusted",
      isAggregator: false,
      isOfficialLeaning: true,
      reasons: ["Known official opportunity provider source."],
    };
  }

  if (domainInSet(domain, APPLICATION_PORTAL_DOMAINS)) {
    return {
      domain,
      category: "application_portal",
      trust: "standard",
      isAggregator: false,
      isOfficialLeaning: true,
      reasons: ["Recognized third-party application portal."],
    };
  }

  if (domainInSet(domain, GENERIC_HOSTING_DOMAINS)) {
    return {
      domain,
      category: "low_trust_blog",
      trust: "experimental",
      isAggregator: false,
      isOfficialLeaning: false,
      reasons: ["Hosted-site platform domain (Wix/WordPress/Blogspot/…)."],
    };
  }

  if (isGovernmentDomain(domain)) {
    return {
      domain,
      category: "government",
      trust: "trusted",
      isAggregator: false,
      isOfficialLeaning: true,
      reasons: ["Government source."],
    };
  }

  if (isUniversityDomain(domain)) {
    return {
      domain,
      category: "university",
      trust: "trusted",
      isAggregator: false,
      isOfficialLeaning: true,
      reasons: ["University source."],
    };
  }

  if (isFoundationOrNonprofitDomain(domain)) {
    return {
      domain,
      category: "foundation_or_nonprofit",
      trust: "trusted",
      isAggregator: false,
      isOfficialLeaning: true,
      reasons: ["Foundation, nonprofit, institute, or organization source."],
    };
  }

  return {
    domain,
    category: "unknown",
    trust: "standard",
    isAggregator: false,
    isOfficialLeaning: false,
    reasons: ["Unknown source category."],
  };
}

export function assessApplicationUrlQuality({
  applicationUrl,
  sourceUrl,
  providerUrl,
}: {
  applicationUrl?: string | null;
  sourceUrl?: string | null;
  providerUrl?: string | null;
}): ApplicationUrlQuality {
  const applicationDomain = getPolicyDomain(applicationUrl);
  const sourceDomain = getPolicyDomain(sourceUrl);
  const providerDomain = getPolicyDomain(providerUrl);

  if (!applicationUrl || !applicationDomain) {
    return "missing_application";
  }

  const normalizedApplication = applicationUrl
    .replace(/#.*$/, "")
    .replace(/\/$/, "");

  const normalizedSource = String(sourceUrl || "")
    .replace(/#.*$/, "")
    .replace(/\/$/, "");

  if (
    normalizedApplication &&
    normalizedSource &&
    normalizedApplication === normalizedSource
  ) {
    return "same_as_source";
  }

  if (domainInSet(applicationDomain, AGGREGATOR_DOMAINS)) {
    return "aggregator_application";
  }

  if (domainInSet(applicationDomain, APPLICATION_PORTAL_DOMAINS)) {
    return "third_party_application_portal";
  }

  if (
    sameOrRelatedDomain(applicationDomain, sourceDomain) ||
    sameOrRelatedDomain(applicationDomain, providerDomain)
  ) {
    return "official_application";
  }

  return "unknown_application";
}

export function buildSourceReviewFlags({
  sourceQuality,
  applicationUrlQuality,
  duplicateRisk,
  provider,
  deadlineConfidence,
}: {
  sourceQuality: SourceQuality;
  applicationUrlQuality: ApplicationUrlQuality;
  duplicateRisk?: "low" | "medium" | "high";
  provider?: string | null;
  deadlineConfidence?: string | null;
}): ReviewFlag[] {
  const flags = new Set<ReviewFlag>();

  if (sourceQuality.isAggregator) {
    flags.add("aggregator_hosted");
    flags.add("needs_official_source");
  }

  if (sourceQuality.category === "low_trust_blog") {
    flags.add("low_trust_source");
    flags.add("needs_official_source");
  }

  if (sourceQuality.category === "unknown") {
    flags.add("unknown_source_category");
  }

  if (applicationUrlQuality === "aggregator_application") {
    flags.add("aggregator_application");
    flags.add("needs_official_source");
  }

  if (applicationUrlQuality === "same_as_source" && sourceQuality.isAggregator) {
    flags.add("application_same_as_source");
    flags.add("needs_official_source");
  }

  if (applicationUrlQuality === "missing_application") {
    flags.add("missing_application_url");
  }

  if (applicationUrlQuality === "unknown_application") {
    flags.add("unknown_application_url");
  }

  if (!provider || provider.trim().length < 2) {
    flags.add("missing_provider");
  }

  if (deadlineConfidence === "low" || deadlineConfidence === "unknown") {
    flags.add("low_confidence_deadline");
  }

  if (duplicateRisk === "medium") {
    flags.add("medium_duplicate_risk");
  }

  if (duplicateRisk === "high") {
    flags.add("high_duplicate_risk");
  }

  return Array.from(flags);
}
