import {
  assessSourceQuality,
  detectAggregatorBehavior,
  getDomain,
  type SourceCategory,
} from "@/lib/discovery/source-quality";

export type SearchResultIntakeDecision = "candidate" | "secondary" | "skip";

export type SearchResultIntakeInput = {
  url: string;
  title?: string | null;
  snippet?: string | null;
  campaignOpportunityType?: string | null;
  campaignQuery?: string | null;
};

export type SearchResultIntakeResult = {
  decision: SearchResultIntakeDecision;
  score: number;
  domain: string;
  sourceCategory: SourceCategory;
  reasons: string[];
};

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, signals: string[]) {
  return signals.some((signal) => text.includes(normalize(signal)));
}

function getOpportunityTypeTerms(type: string | null | undefined) {
  const normalized = normalize(type);

  const termsByType: Record<string, string[]> = {
    scholarship: ["scholarship", "award", "bursary", "financial aid"],
    research_program: [
      "research program",
      "research opportunity",
      "summer research",
      "research fellowship",
      "studentship",
      "student research",
    ],
    fellowship: ["fellowship", "fellows", "fellow"],
    grant: ["grant", "funding", "award", "travel grant", "research grant"],
    competition: [
      "competition",
      "challenge",
      "case competition",
      "pitch competition",
      "contest",
      "hackathon",
    ],
    leadership_program: [
      "leadership program",
      "leadership",
      "civic leadership",
      "youth leadership",
      "student leaders",
    ],
    career_development_program: [
      "career development",
      "professional development",
      "career preparation",
      "career program",
      "student development",
    ],
    pipeline_program: [
      "pipeline program",
      "pathway program",
      "pathways program",
      "pre med pipeline",
      "pipeline",
    ],
  };

  return termsByType[normalized] || [];
}

const applicantSignals = [
  "apply",
  "application",
  "applicant",
  "eligibility",
  "eligible",
  "deadline",
  "due date",
  "nomination",
  "nominate",
  "registration",
  "register",
  "submit",
  "submission",
  "requirements",
  "how to apply",
];

const strongUrlSignals = [
  "/apply",
  "/application",
  "/applications",
  "/register",
  "/registration",
  "/eligibility",
  "/funding",
  "/scholarship",
  "/scholarships",
  "/fellowship",
  "/fellowships",
  "/grant",
  "/grants",
  "/competition",
  "/competitions",
  "/program",
  "/programs",
  "/opportunities",
];

const directoryAdviceSignals = [
  "top scholarship",
  "top scholarships",
  "best scholarship",
  "best scholarships",
  "scholarship list",
  "list of scholarships",
  "scholarship directory",
  "scholarship database",
  "scholarship search",
  "find scholarships",
  "how to apply for scholarships",
  "how to apply for scholarship",
  "guide to scholarships",
  "scholarship guide",
  "scholarships by",
  "easy scholarships",
  "free scholarships",
  "no essay scholarships",
  "fully funded scholarships",
  "scholarships in canada",
  "scholarships for international students",
  "medical school scholarships",
  "law school scholarships",
  "masters scholarships",
  "phd scholarships",
  "updated 2026",
  "updated 2027",
  "ultimate guide",
  "best research programs",
  "top research programs",
  "summer programs for high school students",
  "opportunities for high school students",
  "funding guide",
  "funding in canada",
  "database",
  "directory",
];

const genericBlogSignals = [
  "/blog/",
  "/blogs/",
  "/article/",
  "/articles/",
  "/news/",
  " blog ",
  " guide ",
  " tips ",
];

const secondaryDatabaseDomains = new Set([
  "pathwaystoscience.org",
  "profellow.com",
]);

export function assessSearchResultIntake({
  url,
  title,
  snippet,
  campaignOpportunityType,
  campaignQuery,
}: SearchResultIntakeInput): SearchResultIntakeResult {
  const domain = getDomain(url) || "unknown";
  const sourceQuality = assessSourceQuality(url);
  const aggregatorBehavior = detectAggregatorBehavior({
    url,
    title,
    text: snippet || "",
  });

  const combined = normalize([title, snippet, url].filter(Boolean).join(" "));
  const urlLower = url.toLowerCase();

  const reasons: string[] = [];
  let score = 0;

  if (sourceQuality.category === "blocked") {
    return {
      decision: "skip",
      score: -100,
      domain,
      sourceCategory: sourceQuality.category,
      reasons: ["Blocked source domain."],
    };
  }

  if (sourceQuality.category === "low_trust_blog") {
    return {
      decision: "skip",
      score: -80,
      domain,
      sourceCategory: sourceQuality.category,
      reasons: ["Low-trust blog/source domain."],
    };
  }

  if (sourceQuality.isAggregator || aggregatorBehavior.isAggregatorLike) {
    const isTrustedSecondary = secondaryDatabaseDomains.has(domain);

    if (!isTrustedSecondary) {
      return {
        decision: "skip",
        score: -100,
        domain,
        sourceCategory: sourceQuality.category,
        reasons: [
          "Aggregator/database-like result.",
          ...sourceQuality.reasons,
          ...aggregatorBehavior.reasons,
        ].filter(Boolean),
      };
    }

    score += 15;
    reasons.push("Trusted secondary database; keep only as secondary if useful.");
  }

  if (sourceQuality.category === "government") {
    score += 45;
    reasons.push("Government source.");
  }

  if (sourceQuality.category === "university") {
    score += 45;
    reasons.push("University source.");
  }

  if (sourceQuality.category === "application_portal") {
    score += 45;
    reasons.push("Application portal source.");
  }

  if (sourceQuality.category === "official_provider") {
    score += 40;
    reasons.push("Known official provider source.");
  }

  if (sourceQuality.category === "foundation_or_nonprofit") {
    score += 25;
    reasons.push("Foundation/nonprofit source.");
  }

  if (sourceQuality.category === "trusted_database") {
    score += 15;
    reasons.push("Trusted database source.");
  }

  if (includesAny(combined, applicantSignals)) {
    score += 20;
    reasons.push("Applicant-facing signal in title/snippet/url.");
  }

  if (strongUrlSignals.some((signal) => urlLower.includes(signal))) {
    score += 15;
    reasons.push("Strong applicant/program URL signal.");
  }

  const opportunityTerms = getOpportunityTypeTerms(campaignOpportunityType);
  if (opportunityTerms.length && includesAny(combined, opportunityTerms)) {
    score += 15;
    reasons.push("Matches campaign opportunity type.");
  } else if (campaignOpportunityType) {
    score -= 20;
    reasons.push("Weak match to campaign opportunity type.");
  }

  if (includesAny(combined, directoryAdviceSignals)) {
    score -= 70;
    reasons.push("Directory/advice/list/database result signal.");
  }

  if (includesAny(` ${urlLower} ${combined} `, genericBlogSignals)) {
    score -= 30;
    reasons.push("Generic blog/article/news result signal.");
  }

  const isDotCom = domain.endsWith(".com");
  if (isDotCom && sourceQuality.category === "unknown") {
    score -= 25;
    reasons.push("Unknown .com source.");
  }

  if (
    isDotCom &&
    sourceQuality.category === "unknown" &&
    includesAny(combined, directoryAdviceSignals)
  ) {
    score -= 35;
    reasons.push("Unknown .com with directory/advice behavior.");
  }

  if (campaignQuery && normalize(campaignQuery).includes("site:com")) {
    score -= 10;
    reasons.push("Stricter threshold context: site:com campaign.");
  }

  let decision: SearchResultIntakeDecision = "skip";

  if (score >= 45) {
    decision = "candidate";
  } else if (score >= 25) {
    decision = "secondary";
  }

  if (decision === "secondary" && sourceQuality.category !== "trusted_database") {
    decision = "skip";
    reasons.push("Secondary result skipped because secondary queue is not enabled yet.");
  }

  return {
    decision,
    score,
    domain,
    sourceCategory: sourceQuality.category,
    reasons,
  };
}
