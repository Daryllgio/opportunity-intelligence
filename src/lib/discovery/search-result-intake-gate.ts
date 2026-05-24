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
  inferredOpportunityType?: string | null;
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
      "leadership scholars",
      "leadership development",
      "civic leadership",
      "youth leadership",
      "student leaders",
      "student leadership",
    ],
    career_development_program: [
      "career development",
      "professional development",
      "career preparation",
      "career program",
      "student development",
      "career services",
      "development program",
      "scholars program",
      "fellows program",
      "student success program",
    ],
    pipeline_program: [
      "pipeline program",
      "pipeline programs",
      "pathway program",
      "pathway programs",
      "pathways program",
      "pathways programs",
      "access program",
      "access programs",
      "academic access",
      "health care pipeline",
      "medical pipeline",
      "pre med pipeline",
      "pre-health pipeline",
      "college pipeline",
      "educational pipeline",
      "community pipeline",
      "pipeline",
      "pathway",
      "pathways",
    ],
  };

  return termsByType[normalized] || [];
}

function getConflictingTypeSignals(type: string | null | undefined) {
  const normalized = normalize(type);

  const conflicts: Record<string, string[]> = {
    scholarship: [
      "case competition",
      "pitch competition",
      "hackathon",
      "pipeline program",
      "career development program",
    ],
    fellowship: [
      "scholarship directory",
      "case competition",
      "student grant",
    ],
    research_program: [
      "scholarship directory",
      "case competition",
      "essay contest",
    ],
    grant: [
      "case competition",
      "scholarship directory",
      "no essay scholarship",
    ],
    competition: [
      "scholarship",
      "financial aid",
      "grant",
      "bursary",
    ],
    leadership_program: [
      "scholarship directory",
      "financial aid",
      "grant",
    ],
    career_development_program: [
      "scholarship directory",
      "financial aid",
      "no essay scholarship",
    ],
    pipeline_program: [
      "scholarship directory",
      "financial aid",
      "no essay scholarship",
      "case competition",
    ],
  };

  return conflicts[normalized] || [];
}

function isInstitutionHostedPipelineLike({
  combined,
  sourceCategory,
}: {
  combined: string;
  sourceCategory: SourceCategory;
}) {
  return (
    ["university", "government", "foundation_or_nonprofit"].includes(sourceCategory) &&
    includesAny(combined, [
      "pipeline program",
      "pipeline programs",
      "pathway program",
      "pathway programs",
      "pathways program",
      "access program",
      "access programs",
      "academic access",
      "health care pipeline",
      "medical pipeline",
      "educational pipeline",
      "community pipeline",
    ])
  );
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


function hasScholarshipOnlySignalV2(combined: string) {
  return includesAny(combined, [
    "scholarship",
    "scholarships",
    "financial aid",
    "bursary",
    "bursaries",
    "tuition aid",
    "student aid",
    "no essay scholarship",
    "scholarship search",
    "scholarship directory",
  ]);
}

function hasCompetitionSignalV2(combined: string) {
  return includesAny(combined, [
    "competition",
    "competitions",
    "challenge",
    "contest",
    "case competition",
    "pitch competition",
    "hackathon",
    "student research competition",
    "essay contest",
  ]);
}

function hasPipelineSignalV2(combined: string) {
  return includesAny(combined, [
    "pipeline program",
    "pipeline programs",
    "pathway program",
    "pathway programs",
    "access program",
    "access programs",
    "academic access",
    "health care pipeline",
    "medical pipeline",
    "educational pipeline",
    "college pipeline",
  ]);
}

function hasCareerLeadershipSignalV2(combined: string) {
  return includesAny(combined, [
    "leadership program",
    "student leadership",
    "leadership development",
    "career development",
    "professional development",
    "career preparation",
    "career program",
    "student development program",
  ]);
}

function hasDocumentOrMetaUrlV2(urlLower: string) {
  return (
    urlLower.endsWith(".pdf") ||
    urlLower.includes("/faq") ||
    urlLower.includes("faq-") ||
    urlLower.includes("-faq") ||
    urlLower.includes("fact-sheet") ||
    urlLower.includes("factsheet") ||
    urlLower.includes("/search") ||
    urlLower.includes("handler=search") ||
    urlLower.includes("scholarship/index")
  );
}

function hasMetaPageSignalV2(combined: string) {
  return includesAny(combined, [
    "faq",
    "frequently asked questions",
    "fact sheet",
    "fact-sheet",
    "review",
    "trustable site",
    "is bold org",
    "application management system",
    "search scholarship",
    "search scholarships",
    "find scholarships",
    "scholarship search",
    "scholarship database",
    "scholarship directory",
  ]);
}

function isStrictWrongTypeResultV2({
  combined,
  urlLower,
  campaignOpportunityType,
}: {
  combined: string;
  urlLower: string;
  campaignOpportunityType?: string | null;
}) {
  const type = normalize(campaignOpportunityType);

  if (!type) return false;

  const isScholarshipOnly =
    hasScholarshipOnlySignalV2(combined) &&
    !hasCompetitionSignalV2(combined) &&
    !hasPipelineSignalV2(combined) &&
    !hasCareerLeadershipSignalV2(combined) &&
    !includesAny(combined, ["fellowship", "grant"]);

  const nonScholarshipCampaign =
    type !== "scholarship" && type !== "grant" && type !== "fellowship";

  const scholarshipWrongType =
    nonScholarshipCampaign && isScholarshipOnly;

  const competitionWrongType =
    type === "competition" &&
    hasScholarshipOnlySignalV2(combined) &&
    !hasCompetitionSignalV2(combined);

  const pipelineCareerLeadershipWrongType =
    [
      "pipeline program",
      "pipeline_program",
      "career development program",
      "career_development_program",
      "leadership program",
      "leadership_program",
    ].includes(type) &&
    hasScholarshipOnlySignalV2(combined) &&
    !hasPipelineSignalV2(combined) &&
    !hasCareerLeadershipSignalV2(combined);

  return (
    scholarshipWrongType ||
    competitionWrongType ||
    pipelineCareerLeadershipWrongType ||
    hasDocumentOrMetaUrlV2(urlLower) ||
    hasMetaPageSignalV2(combined)
  );
}


function hasRequiredStrictTypeSignalV2({
  combined,
  campaignOpportunityType,
}: {
  combined: string;
  campaignOpportunityType?: string | null;
}) {
  const type = normalize(campaignOpportunityType);

  if (!type) return true;

  if (type === "competition") {
    return hasCompetitionSignalV2(combined);
  }

  if (type === "pipeline program" || type === "pipeline_program") {
    return hasPipelineSignalV2(combined);
  }

  if (type === "career development program" || type === "career_development_program") {
    return includesAny(combined, [
      "career development",
      "professional development",
      "career preparation",
      "career program",
      "student development program",
      "workforce development",
      "career readiness",
      "career pathway",
      "career pathways",
    ]);
  }

  if (type === "leadership program" || type === "leadership_program") {
    return includesAny(combined, [
      "leadership program",
      "leadership development",
      "student leadership",
      "youth leadership",
      "leadership scholars",
      "leadership academy",
      "leadership institute",
      "leadership fellowship",
    ]);
  }

  return true;
}


function inferSearchResultOpportunityType({
  title,
  snippet,
  url,
}: {
  title?: string | null;
  snippet?: string | null;
  url?: string | null;
}) {
  const combined = normalize([title, snippet, url].filter(Boolean).join(" "));

  const trueCompetitionSignals = [
    "case competition",
    "pitch competition",
    "business competition",
    "student competition",
    "student research competition",
    "innovation competition",
    "entrepreneurship competition",
    "startup competition",
    "hackathon",
    "challenge",
    "essay contest",
    "moot court",
    "debate tournament",
  ];

  const scholarshipSignals = [
    "scholarship",
    "scholarships",
    "bursary",
    "bursaries",
    "financial aid",
    "student aid",
    "tuition aid",
  ];

  const pipelineSignals = [
    "pipeline program",
    "pipeline programs",
    "pathway program",
    "pathway programs",
    "academic access",
    "health care pipeline",
    "medical pipeline",
    "college pipeline",
    "educational pipeline",
  ];

  const careerSignals = [
    "career development program",
    "career development",
    "professional development program",
    "professional development",
    "career preparation",
    "career readiness",
    "workforce development",
  ];

  const leadershipSignals = [
    "leadership program",
    "leadership development",
    "student leadership",
    "youth leadership",
    "leadership academy",
    "leadership institute",
  ];

  if (includesAny(combined, trueCompetitionSignals)) return "competition";
  if (includesAny(combined, pipelineSignals)) return "pipeline_program";
  if (includesAny(combined, careerSignals)) return "career_development_program";
  if (includesAny(combined, leadershipSignals)) return "leadership_program";
  if (includesAny(combined, ["research program", "summer research", "research opportunity", "student research"])) return "research_program";
  if (includesAny(combined, ["fellowship", "fellowships", "fellows"])) return "fellowship";
  if (includesAny(combined, ["research grant", "travel grant", "student grant", "grant application"])) return "grant";
  if (includesAny(combined, scholarshipSignals)) return "scholarship";

  return null;
}

function isStrictCampaignType(type?: string | null) {
  return [
    "competition",
    "pipeline_program",
    "career_development_program",
    "leadership_program",
  ].includes(String(type || ""));
}

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
  const inferredOpportunityType = inferSearchResultOpportunityType({ title, snippet, url });

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
      inferredOpportunityType,
    };
  }

  if (
    isStrictCampaignType(campaignOpportunityType) &&
    inferredOpportunityType &&
    inferredOpportunityType !== campaignOpportunityType
  ) {
    return {
      decision: "skip",
      score: -120,
      domain,
      sourceCategory: sourceQuality.category,
      reasons: [
        `Hard skip: inferred result type ${inferredOpportunityType} conflicts with campaign type ${campaignOpportunityType}.`,
      ],
      inferredOpportunityType,
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
  const conflictingTerms = getConflictingTypeSignals(campaignOpportunityType);
  const hasTypeMatch = opportunityTerms.length && includesAny(combined, opportunityTerms);
  const hasTypeConflict = conflictingTerms.length && includesAny(combined, conflictingTerms);
  const institutionPipelineLike =
    normalize(campaignOpportunityType) === "pipeline program" ||
    normalize(campaignOpportunityType) === "pipeline_program"
      ? isInstitutionHostedPipelineLike({
          combined,
          sourceCategory: sourceQuality.category,
        })
      : false;

  if (hasTypeMatch || institutionPipelineLike) {
    score += 20;
    reasons.push("Matches campaign opportunity type.");
  } else if (campaignOpportunityType) {
    score -= 15;
    reasons.push("Weak match to campaign opportunity type.");
  }

  if (hasTypeConflict) {
    score -= 30;
    reasons.push("Strong signal for a different opportunity type.");
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

  const isStrictWrongType = isStrictWrongTypeResultV2({
    combined,
    urlLower,
    campaignOpportunityType,
  });

  const hasRequiredStrictTypeSignal = hasRequiredStrictTypeSignalV2({
    combined,
    campaignOpportunityType,
  });

  if (isStrictWrongType) {
    score -= 90;
    reasons.push(
      "Hard skip: wrong-type, document, FAQ, search, database, meta, or scholarship-only page for this campaign."
    );
  }

  if (!hasRequiredStrictTypeSignal) {
    score -= 90;
    reasons.push(
      "Hard skip: strict campaign type requires an explicit matching type signal."
    );
  }

  let decision: SearchResultIntakeDecision = "skip";

  if (!isStrictWrongType && hasRequiredStrictTypeSignal && score >= 45) {
    decision = "candidate";
  } else if (!isStrictWrongType && hasRequiredStrictTypeSignal && score >= 25) {
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
    inferredOpportunityType,
  };
}
