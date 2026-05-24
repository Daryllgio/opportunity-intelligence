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

export function getDomain(url: string | null | undefined) {
  if (!url) return null;

  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: unknown) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length >= 3)
  );
}

function tokenOverlap(left: unknown, right: unknown) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);

  if (!leftTokens.size || !rightTokens.size) return 0;

  const intersection = Array.from(leftTokens).filter((token) =>
    rightTokens.has(token)
  );

  return intersection.length / Math.min(leftTokens.size, rightTokens.size);
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

export const blockedDomains = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "reddit.com",
]);

export const aggregatorDomains = new Set([
  "scholarships.com",
  "studentscholarships.org",
  "scholarshiproar.com",
  "accessscholarships.com",
  "scholarships360.org",
  "fastweb.com",
  "bold.org",
  "unigo.com",
  "niche.com",
  "cappex.com",
  "goingmerry.com",
  "scholarshipowl.com",
  "collegegreenlight.com",
  "appily.com",
  "petersons.com",
  "brokescholar.com",
  "careerkarma.com",

  // Scholarship/opportunity list, advice, and database sites discovered during campaign testing.
  "wemakescholars.com",
  "amberstudent.com",
  "scholarsavenue.com",
  "findamasters.com",
  "uscaacademy.com",
  "scholarshipca.com",
  "bemoacademicconsulting.com",
  "topuniversities.com",
  "applykite.com",
  "shemmassianconsulting.com",
  "medschoolcoach.com",
  "collegewhale.com",
  "boardvitals.com",
  "lumiere-education.com",
  "ladderinternships.com",
  "mehtaplustutoring.com",
  "pioneeracademics.com",
  "logolife.org",
  "mswhelper.com",
  "iefa.org",
  "opportunitiescircle.com",
  "scholarshipscorner.website",
  "opportunitiesforyouth.org",
  "scholarshipunion.com",
  "theeducationstory.com",
  "fdpzone.com",
  "scholarsworld.ng",
  "persmind.com",
  "resultuniraj.co.in",
]);

export const trustedDatabaseDomains = new Set([
  "pathwaystoscience.org",
  "profellow.com",
]);

export const officialProviderDomains = new Set([
  "innovation.ca",
  "bmifoundation.org",
  "wdc.org",
  "seafwa.org",
  "nysra.org",
  "napawash.org",
]);

export const applicationPortalDomains = new Set([
  "smapply.io",
  "awardspring.com",
  "submittable.com",
  "fluidreview.com",
  "academicworks.com",
  "applyists.net",
  "surveyapply.com",
]);

export const lowTrustDomains = new Set([
  "weebly.com",
  "wixsite.com",
  "blogspot.com",
  "wordpress.com",
  "medium.com",
]);

export function isKnownAggregatorDomain(urlOrDomain: string | null | undefined) {
  const domain =
    urlOrDomain && urlOrDomain.includes("://")
      ? getDomain(urlOrDomain)
      : String(urlOrDomain || "").replace(/^www\./, "").toLowerCase();

  if (!domain) return false;

  return domainInSet(domain, aggregatorDomains);
}

export function isKnownBlockedDomain(urlOrDomain: string | null | undefined) {
  const domain =
    urlOrDomain && urlOrDomain.includes("://")
      ? getDomain(urlOrDomain)
      : String(urlOrDomain || "").replace(/^www\./, "").toLowerCase();

  if (!domain) return false;

  return domainInSet(domain, blockedDomains);
}

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
  const domain = getDomain(url);
  const combined = normalizeText([title, text, url].filter(Boolean).join(" "));
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
    if (combined.includes(normalizeText(signal))) {
      score += 18;
      reasons.push(`Opportunity aggregator behavior signal: ${signal}.`);
    }
  }

  const scholarshipAggregatorSignals = [
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
  ];

  for (const signal of scholarshipAggregatorSignals) {
    if (combined.includes(normalizeText(signal))) {
      score += 14;
      reasons.push(`Scholarship aggregator signal: ${signal}.`);
    }
  }

  const researchProgramAggregatorSignals = [
    "research opportunity database",
    "research opportunities database",
    "undergraduate research opportunities",
    "summer research program list",
    "research program list",
    "research program directory",
    "student research opportunities",
  ];

  for (const signal of researchProgramAggregatorSignals) {
    if (combined.includes(normalizeText(signal))) {
      score += 14;
      reasons.push(`Research-program aggregator signal: ${signal}.`);
    }
  }

  const fellowshipAggregatorSignals = [
    "fellowship database",
    "fellowship directory",
    "search fellowships",
    "find fellowships",
    "external fellowships",
    "national fellowship listings",
    "fellowship advising search",
  ];

  for (const signal of fellowshipAggregatorSignals) {
    if (combined.includes(normalizeText(signal))) {
      score += 14;
      reasons.push(`Fellowship aggregator signal: ${signal}.`);
    }
  }

  const grantAggregatorSignals = [
    "grant database",
    "grant directory",
    "grant search",
    "funding database",
    "funding directory",
    "funding opportunity database",
    "funding opportunity search",
  ];

  for (const signal of grantAggregatorSignals) {
    if (combined.includes(normalizeText(signal))) {
      score += 14;
      reasons.push(`Grant/funding aggregator signal: ${signal}.`);
    }
  }

  const competitionAggregatorSignals = [
    "competition directory",
    "competition database",
    "student competitions",
    "case competition list",
    "hackathon directory",
    "challenge database",
    "pitch competition list",
  ];

  for (const signal of competitionAggregatorSignals) {
    if (combined.includes(normalizeText(signal))) {
      score += 14;
      reasons.push(`Competition aggregator signal: ${signal}.`);
    }
  }

  const leadershipCareerPipelineAggregatorSignals = [
    "leadership program directory",
    "leadership program list",
    "career development program list",
    "career development programs",
    "pipeline program directory",
    "pipeline program list",
    "student program directory",
    "student programs directory",
  ];

  for (const signal of leadershipCareerPipelineAggregatorSignals) {
    if (combined.includes(normalizeText(signal))) {
      score += 14;
      reasons.push(`Leadership/career/pipeline aggregator signal: ${signal}.`);
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
    if (combined.includes(normalizeText(signal))) {
      score += 5;
      reasons.push(`Weak directory/listing signal: ${signal}.`);
    }
  }

  const sourceProviderOverlap = tokenOverlap(provider, domain || "");
  const pageProviderOverlap = tokenOverlap(provider, combined);

  if (provider && domain && sourceProviderOverlap < 0.15 && pageProviderOverlap < 0.25) {
    score += 10;
    reasons.push("Provider does not appear aligned with source domain/page.");
  }

  return {
    isAggregatorLike: score >= 35,
    score,
    reasons,
  };
}

export function assessProviderSourceRelationship({
  provider,
  url,
  pageText,
}: {
  provider?: string | null;
  url?: string | null;
  pageText?: string | null;
}): ProviderSourceRelationship {
  const domain = getDomain(url);
  const reasons: string[] = [];
  let score = 0;

  if (!provider || !domain) {
    return {
      isProviderAligned: false,
      score: 0,
      reasons: ["Missing provider or source domain."],
    };
  }

  const providerDomainOverlap = tokenOverlap(provider, domain);
  const providerPageOverlap = tokenOverlap(provider, pageText || "");

  if (providerDomainOverlap >= 0.35) {
    score += 50;
    reasons.push("Provider name aligns with source domain.");
  } else if (providerDomainOverlap >= 0.2) {
    score += 25;
    reasons.push("Provider name partially aligns with source domain.");
  }

  if (providerPageOverlap >= 0.45) {
    score += 35;
    reasons.push("Provider is clearly mentioned on the page.");
  } else if (providerPageOverlap >= 0.25) {
    score += 15;
    reasons.push("Provider is partially mentioned on the page.");
  }

  if (isKnownAggregatorDomain(domain)) {
    score -= 60;
    reasons.push("Source domain is a known aggregator, not provider-aligned.");
  }

  return {
    isProviderAligned: score >= 35,
    score,
    reasons,
  };
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
