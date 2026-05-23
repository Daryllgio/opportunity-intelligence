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

export function getDomain(url: string | null | undefined) {
  if (!url) return null;

  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function domainMatches(domain: string, knownDomain: string) {
  return domain === knownDomain || domain.endsWith(`.${knownDomain}`);
}

function domainInSet(domain: string, domains: Set<string>) {
  return Array.from(domains).some((knownDomain) =>
    domainMatches(domain, knownDomain)
  );
}

function sameOrRelatedDomain(left: string | null, right: string | null) {
  if (!left || !right) return false;

  return (
    left === right ||
    left.endsWith(`.${right}`) ||
    right.endsWith(`.${left}`)
  );
}

const blockedDomains = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "reddit.com",
]);

const aggregatorDomains = new Set([
  "scholarships.com",
  "studentscholarships.org",
  "scholarshiproar.com",
  "accessscholarships.com",
  "scholarships360.org",
]);

const trustedDatabaseDomains = new Set([
  "pathwaystoscience.org",
  "profellow.com",
]);

const officialProviderDomains = new Set([
  "innovation.ca",
  "bmifoundation.org",
  "wdc.org",
  "seafwa.org",
]);

const applicationPortalDomains = new Set([
  "smapply.io",
  "awardspring.com",
  "submittable.com",
  "fluidreview.com",
  "academicworks.com",
  "applyists.net",
  "surveyapply.com",
]);

const lowTrustDomains = new Set([
  "weebly.com",
  "wixsite.com",
  "blogspot.com",
  "wordpress.com",
  "medium.com",
]);

function isGovernmentDomain(domain: string) {
  return (
    domain.endsWith(".gov") ||
    domain.endsWith(".gc.ca") ||
    domain === "canada.ca" ||
    domain.endsWith(".canada.ca") ||
    domain.endsWith(".gov.bc.ca") ||
    domain.endsWith(".gov.on.ca") ||
    domain.endsWith(".gouv.qc.ca")
  );
}

function isUniversityDomain(domain: string) {
  return (
    domain.endsWith(".edu") ||
    domain.endsWith(".ac.uk") ||
    domain.endsWith(".edu.au") ||
    domain.endsWith(".edu.ng") ||
    domain.includes("university") ||
    domain.includes("college") ||
    domain.includes("mcmaster") ||
    domain.includes("ualberta") ||
    domain.includes("carleton") ||
    domain.includes("uottawa") ||
    domain.includes("utoronto") ||
    domain.includes("mcgill") ||
    domain.includes("ubc") ||
    domain.includes("waterloo") ||
    domain.includes("queensu") ||
    domain.includes("ualberta") ||
    domain.includes("ucalgary") ||
    domain.includes("yorku")
  );
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

export function assessSourceQuality(url: string | null | undefined): SourceQuality {
  const domain = getDomain(url);

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

  if (domainInSet(domain, blockedDomains)) {
    return {
      domain,
      category: "blocked",
      trust: "blocked",
      isAggregator: false,
      isOfficialLeaning: false,
      reasons: ["Blocked source domain."],
    };
  }

  if (domainInSet(domain, aggregatorDomains)) {
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

  if (domainInSet(domain, trustedDatabaseDomains)) {
    return {
      domain,
      category: "trusted_database",
      trust: "standard",
      isAggregator: false,
      isOfficialLeaning: false,
      reasons: ["Trusted opportunity database."],
    };
  }

  if (domainInSet(domain, officialProviderDomains)) {
    return {
      domain,
      category: "official_provider",
      trust: "trusted",
      isAggregator: false,
      isOfficialLeaning: true,
      reasons: ["Known official opportunity provider source."],
    };
  }

  if (domainInSet(domain, applicationPortalDomains)) {
    return {
      domain,
      category: "application_portal",
      trust: "standard",
      isAggregator: false,
      isOfficialLeaning: true,
      reasons: ["Recognized third-party application portal."],
    };
  }

  if (domainInSet(domain, lowTrustDomains)) {
    return {
      domain,
      category: "low_trust_blog",
      trust: "experimental",
      isAggregator: false,
      isOfficialLeaning: false,
      reasons: ["Low-trust hosted site or blog domain."],
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
  const applicationDomain = getDomain(applicationUrl);
  const sourceDomain = getDomain(sourceUrl);
  const providerDomain = getDomain(providerUrl);

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

  if (domainInSet(applicationDomain, aggregatorDomains)) {
    return "aggregator_application";
  }

  if (domainInSet(applicationDomain, applicationPortalDomains)) {
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
