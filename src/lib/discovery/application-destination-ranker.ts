import { capturePageWithHybrid } from "@/lib/discovery/capture/hybrid-capture";
import {
  assessProviderSourceRelationship,
  assessSourceQuality,
  detectAggregatorBehavior,
  getDomain,
  isKnownAggregatorDomain,
  isKnownBlockedDomain,
} from "@/lib/discovery/source-quality";
import { searchDiscoveryWeb } from "@/lib/discovery/search/search-provider";

export type DestinationConfidence = "high" | "medium" | "low" | "none";

export type CandidatePurpose =
  | "official_application_page"
  | "official_program_page"
  | "application_document"
  | "third_party_portal"
  | "login_gated_portal"
  | "email_based_application"
  | "nomination_based"
  | "press_or_news"
  | "aggregator_or_database"
  | "resource_listing"
  | "generic_provider_page"
  | "unknown";

export type ApplicationDestinationInput = {
  title?: string | null;
  provider?: string | null;
  type?: string | null;
  sourceUrl?: string | null;
  deadline?: string | null;
};

export type DestinationCandidate = {
  url: string;
  title?: string | null;
  snippet?: string | null;
  domain: string | null;
};

type ApplicationActionType =
  | "internal_application_page"
  | "registration_page"
  | "application_document"
  | "third_party_portal"
  | "login_portal"
  | "email_submission"
  | "nomination_instruction"
  | "application_instructions"
  | "unknown";

type ApplicationAction = {
  url: string | null;
  label: string;
  type: ApplicationActionType;
  score: number;
  reasons: string[];
};

export type RankedDestinationCandidate = DestinationCandidate & {
  purpose: CandidatePurpose;
  score: number;
  confidence: DestinationConfidence;
  reasons: string[];
  applicationDocumentUrl: string | null;
  applicationDocumentType: string | null;
  applicationDestinationUrl: string | null;
  applicationDestinationType: CandidatePurpose;
};

export type ApplicationDestinationResult = {
  officialSourceUrl: string | null;
  applicationDestinationUrl: string | null;
  applicationDestinationType: CandidatePurpose | "not_found";
  officialSourceStatus:
    | "not_searched"
    | "candidate_found"
    | "verified_destination"
    | "aggregator_only"
    | "needs_human_review"
    | "failed_lookup";
  destinationConfidence: DestinationConfidence;
  destinationReasons: string[];
  applicationDocumentUrl: string | null;
  applicationDocumentType: string | null;
  candidates: RankedDestinationCandidate[];
};

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

function hasAnySignal(text: string, signals: string[]) {
  const normalized = normalizeText(text);
  return signals.some((signal) => normalized.includes(normalizeText(signal)));
}

function isWeakOrAggregatorProvider(provider: string | null | undefined) {
  const normalized = normalizeText(provider);

  if (!normalized) return true;

  const weakProviders = [
    "scholarships com",
    "fastweb",
    "bold org",
    "unigo",
    "niche",
    "cappex",
    "going merry",
    "scholarship owl",
    "studentscholarships",
    "scholarshiproar",
    "access scholarships",
    "scholarships360",
    "appily",
    "petersons",
  ];

  return weakProviders.some((providerName) => normalized.includes(providerName));
}

function isLikelyResourceOrListingPage({
  url,
  title,
  text,
}: {
  url?: string | null;
  title?: string | null;
  text?: string | null;
}) {
  const combined = normalizeText([url, title, text].filter(Boolean).join(" "));
  const urlText = normalizeText(url);

  const strongListingSignals = [
    "list of",
    "directory",
    "database",
    "search results",
    "browse opportunities",
    "browse scholarships",
    "bay area scholarships",
    "scholarships and grants",
    "scholarship list",
    "fellowship list",
    "grant list",
    "program list",
    "opportunity list",
    "external opportunities",
    "resource guide",
    "resources",
    "student resources",
  ];

  const listingUrlSignals = [
    "scholarships",
    "fellowships",
    "grants",
    "opportunities",
    "resources",
    "database",
    "directory",
  ];

  let score = 0;
  const reasons: string[] = [];

  for (const signal of strongListingSignals) {
    if (combined.includes(normalizeText(signal))) {
      score += 18;
      reasons.push(`Resource/listing signal: ${signal}.`);
    }
  }

  for (const signal of listingUrlSignals) {
    if (urlText.includes(normalizeText(signal))) {
      score += 6;
      reasons.push(`Resource/listing URL signal: ${signal}.`);
    }
  }

  return {
    isResourceListing: score >= 24,
    score,
    reasons,
  };
}

function isRecognizedApplicationPortalUrl(url: string | null | undefined) {
  const lower = String(url || "").toLowerCase();

  return (
    lower.includes("smapply.io") ||
    lower.includes("submittable.com") ||
    lower.includes("awardspring.com") ||
    lower.includes("academicworks.com") ||
    lower.includes("surveyapply.com") ||
    lower.includes("forms.office.com") ||
    lower.includes("docs.google.com/forms") ||
    lower.includes("form.jotform.com") ||
    lower.includes("typeform.com") ||
    lower.includes("my.reviewr.com")
  );
}

function isDocumentUrl(url: string) {
  const lower = url.toLowerCase().split("?")[0];
  return (
    lower.endsWith(".pdf") ||
    lower.endsWith(".doc") ||
    lower.endsWith(".docx")
  );
}

function getDocumentType(url: string) {
  const lower = url.toLowerCase().split("?")[0];

  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".doc")) return "doc";
  if (lower.endsWith(".docx")) return "docx";

  return null;
}

function deadlineAppearsInText(deadline: string | null | undefined, text: string) {
  if (!deadline) return false;

  const raw = String(deadline).trim();
  if (!raw) return false;

  const normalizedText = normalizeText(text);

  if (normalizedText.includes(normalizeText(raw))) return true;

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const [, year, month, day] = match;
  const monthIndex = Number(month) - 1;
  const dayNumber = Number(day);

  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];

  const monthName = monthNames[monthIndex];
  if (!monthName || !dayNumber || !year) return false;

  const datePatterns = [
    `${monthName} ${dayNumber} ${year}`,
    `${monthName} ${dayNumber}`,
    `${monthName} ${String(dayNumber).padStart(2, "0")} ${year}`,
    `${monthName} ${String(dayNumber).padStart(2, "0")}`,
  ];

  return datePatterns.some((pattern) => normalizedText.includes(pattern));
}

function classifyStaticPurpose(candidate: DestinationCandidate): CandidatePurpose | null {
  const url = candidate.url.toLowerCase();
  const domain = getDomain(candidate.url);

  if (!domain || isKnownBlockedDomain(domain)) return "unknown";

  if (isKnownAggregatorDomain(domain)) return "aggregator_or_database";

  if (isDocumentUrl(candidate.url)) return "application_document";

  if (
    url.includes("prnewswire.com") ||
    url.includes("businesswire.com") ||
    url.includes("accessnewswire.com") ||
    url.includes("newswire.com") ||
    url.includes("/news/") ||
    url.includes("/press") ||
    url.includes("press-release") ||
    url.includes("press_release") ||
    url.includes("newsroom")
  ) {
    return "press_or_news";
  }

  if (
    url.includes("smapply.io") ||
    url.includes("submittable.com") ||
    url.includes("awardspring.com") ||
    url.includes("academicworks.com") ||
    url.includes("surveyapply.com")
  ) {
    return "third_party_portal";
  }

  if (
    url.includes("login") ||
    url.includes("signin") ||
    url.includes("sign_in") ||
    url.includes("account") ||
    url.includes("portal")
  ) {
    return "login_gated_portal";
  }

  return null;
}

function extractCandidateLinks({
  pageText,
  candidateUrl,
}: {
  pageText: string;
  candidateUrl: string;
}) {
  const links: { url: string; label: string }[] = [];

  const hrefRegex = /href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(pageText))) {
    const rawUrl = match[1];
    const rawLabel = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    if (!rawUrl) continue;

    try {
      const absoluteUrl = new URL(rawUrl, candidateUrl).toString();
      links.push({
        url: absoluteUrl,
        label: rawLabel,
      });
    } catch {
      continue;
    }
  }

  return links;
}

function classifyApplicationActionUrl(url: string): ApplicationActionType {
  const lower = url.toLowerCase();

  if (isDocumentUrl(url)) return "application_document";

  if (
    lower.includes("smapply.io") ||
    lower.includes("submittable.com") ||
    lower.includes("awardspring.com") ||
    lower.includes("academicworks.com") ||
    lower.includes("surveyapply.com") ||
    lower.includes("forms.office.com") ||
    lower.includes("docs.google.com/forms") ||
    lower.includes("form.jotform.com") ||
    lower.includes("typeform.com")
  ) {
    return "third_party_portal";
  }

  if (
    lower.includes("login") ||
    lower.includes("signin") ||
    lower.includes("sign_in") ||
    lower.includes("account") ||
    lower.includes("portal")
  ) {
    return "login_portal";
  }

  if (
    lower.includes("register") ||
    lower.includes("registration")
  ) {
    return "registration_page";
  }

  if (
    lower.includes("nomination") ||
    lower.includes("nominate")
  ) {
    return "nomination_instruction";
  }

  if (
    lower.includes("apply") ||
    lower.includes("application") ||
    lower.includes("submit") ||
    lower.includes("form")
  ) {
    return "internal_application_page";
  }

  if (
    lower.includes("how-to-apply") ||
    lower.includes("instructions") ||
    lower.includes("requirements") ||
    lower.includes("eligibility")
  ) {
    return "application_instructions";
  }

  return "unknown";
}

function scoreApplicationAction({
  action,
  candidateUrl,
  opportunityTitle,
  provider,
}: {
  action: {
    url: string | null;
    label: string;
    type: ApplicationActionType;
  };
  candidateUrl: string;
  opportunityTitle?: string | null;
  provider?: string | null;
}): ApplicationAction {
  const reasons: string[] = [];
  const label = normalizeText(action.label);
  const urlText = normalizeText(action.url || "");
  const combined = `${label} ${urlText}`;
  const candidateDomain = getDomain(candidateUrl);
  const actionDomain = getDomain(action.url || "");

  let score = 0;

  const typeBaseScores: Record<ApplicationActionType, number> = {
    internal_application_page: 55,
    registration_page: 52,
    application_document: 58,
    third_party_portal: 50,
    login_portal: 42,
    email_submission: 48,
    nomination_instruction: 46,
    application_instructions: 38,
    unknown: 0,
  };

  score += typeBaseScores[action.type];

  if (action.type !== "unknown") {
    reasons.push(`Detected ${action.type.replace(/_/g, " ")}.`);
  }

  const strongActionSignals = [
    "apply",
    "apply now",
    "application",
    "start application",
    "submit application",
    "application form",
    "download application",
    "register",
    "registration",
    "nomination form",
    "nominate",
    "application portal",
  ];

  for (const signal of strongActionSignals) {
    if (combined.includes(normalizeText(signal))) {
      score += 10;
      reasons.push(`Strong application action signal: ${signal}.`);
    }
  }

  const instructionSignals = [
    "how to apply",
    "application instructions",
    "eligibility",
    "requirements",
    "deadline",
    "guidelines",
  ];

  for (const signal of instructionSignals) {
    if (combined.includes(normalizeText(signal))) {
      score += 5;
      reasons.push(`Application instruction signal: ${signal}.`);
    }
  }

  if (action.url && isDocumentUrl(action.url)) {
    score += 18;
    reasons.push("Action URL is an application document.");
  }

  if (action.url && candidateDomain && actionDomain) {
    if (candidateDomain === actionDomain || actionDomain.endsWith(`.${candidateDomain}`)) {
      score += 8;
      reasons.push("Action URL stays on the official/provider domain.");
    } else if (
      action.type === "third_party_portal" ||
      action.url.includes("forms.office.com") ||
      action.url.includes("docs.google.com/forms")
    ) {
      score += 5;
      reasons.push("Action URL uses a recognized third-party form or portal.");
    } else if (isKnownAggregatorDomain(actionDomain)) {
      score -= 60;
      reasons.push("Action URL points to an aggregator, not an application destination.");
    } else {
      score -= 5;
      reasons.push("Action URL leaves the source domain.");
    }
  }

  const weakOrBadSignals = [
    "about",
    "contact",
    "donate",
    "privacy",
    "terms",
    "news",
    "press",
    "winners",
    "past recipients",
    "recipient",
    "sponsor",
    "alumni",
    "home",
  ];

  for (const signal of weakOrBadSignals) {
    if (label === normalizeText(signal) || urlText.endsWith(` ${normalizeText(signal)}`)) {
      score -= 22;
      reasons.push(`Weak/non-application link signal: ${signal}.`);
    }
  }

  const titleOverlap = tokenOverlap(opportunityTitle, `${label} ${urlText}`);
  if (titleOverlap >= 0.35) {
    score += 8;
    reasons.push("Action link partially matches opportunity title.");
  }

  const providerOverlap = tokenOverlap(provider, `${label} ${urlText}`);
  if (providerOverlap >= 0.35) {
    score += 5;
    reasons.push("Action link partially matches provider.");
  }

  return {
    url: action.url,
    label: action.label,
    type: action.type,
    score,
    reasons: Array.from(new Set(reasons)),
  };
}

function extractApplicationActionsFromPage({
  pageText,
  candidateUrl,
  opportunityTitle,
  provider,
}: {
  pageText: string;
  candidateUrl: string;
  opportunityTitle?: string | null;
  provider?: string | null;
}): ApplicationAction[] {
  const links = extractCandidateLinks({ pageText, candidateUrl });
  const actions: ApplicationAction[] = [];

  for (const link of links) {
    const type = classifyApplicationActionUrl(link.url);
    const labelType = classifyApplicationActionUrl(link.label);

    const chosenType = type !== "unknown" ? type : labelType;

    const scored = scoreApplicationAction({
      action: {
        url: link.url,
        label: link.label,
        type: chosenType,
      },
      candidateUrl,
      opportunityTitle,
      provider,
    });

    if (scored.score >= 35) {
      actions.push(scored);
    }
  }

  const emailMatch = pageText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) {
    actions.push({
      url: `mailto:${emailMatch[0]}`,
      label: "Email submission address detected.",
      type: "email_submission",
      score: 48,
      reasons: ["Detected possible email-based application submission."],
    });
  }

  const documentUrlMatch = pageText.match(/https?:\/\/[^\s"'<>]+?\.(pdf|doc|docx)(\?[^\s"'<>]*)?/i);
  if (documentUrlMatch?.[0]) {
    const documentUrl = documentUrlMatch[0];

    actions.push(
      scoreApplicationAction({
        action: {
          url: documentUrl,
          label: "Detected application document URL.",
          type: "application_document",
        },
        candidateUrl,
        opportunityTitle,
        provider,
      })
    );
  }

  return actions
    .sort((left, right) => right.score - left.score)
    .filter((action, index, array) => {
      if (!action.url) return true;
      return array.findIndex((item) => item.url === action.url) === index;
    });
}

function getBestApplicationAction({
  pageText,
  candidateUrl,
  opportunityTitle,
  provider,
}: {
  pageText: string;
  candidateUrl: string;
  opportunityTitle?: string | null;
  provider?: string | null;
}) {
  const actions = extractApplicationActionsFromPage({
    pageText,
    candidateUrl,
    opportunityTitle,
    provider,
  });

  return actions[0] || null;
}

function classifyPagePurpose({
  input,
  candidate,
  pageText,
}: {
  input: ApplicationDestinationInput;
  candidate: DestinationCandidate;
  pageText: string;
}): {
  purpose: CandidatePurpose;
  reasons: string[];
  applicationDocumentUrl: string | null;
  applicationDocumentType: string | null;
} {
  const staticPurpose = classifyStaticPurpose(candidate);
  const combined = [candidate.title, candidate.snippet, candidate.url, pageText]
    .filter(Boolean)
    .join(" ");

  const reasons: string[] = [];

  if (staticPurpose === "aggregator_or_database") {
    return {
      purpose: "aggregator_or_database",
      reasons: ["Candidate is a known aggregator/database source."],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
    };
  }

  if (staticPurpose === "press_or_news") {
    return {
      purpose: "press_or_news",
      reasons: ["Candidate appears to be a press/news page."],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
    };
  }

  if (staticPurpose === "application_document") {
    return {
      purpose: "application_document",
      reasons: ["Candidate URL is an application document."],
      applicationDocumentUrl: candidate.url,
      applicationDocumentType: getDocumentType(candidate.url),
    };
  }

  if (staticPurpose === "third_party_portal") {
    return {
      purpose: "third_party_portal",
      reasons: ["Candidate is a recognized third-party application portal."],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
    };
  }

  const aggregatorBehavior = detectAggregatorBehavior({
    url: candidate.url,
    title: candidate.title,
    text: combined,
    provider: input.provider,
  });

  if (aggregatorBehavior.isAggregatorLike) {
    return {
      purpose: "aggregator_or_database",
      reasons: [
        "Candidate behaves like an opportunity aggregator/database.",
        ...aggregatorBehavior.reasons,
      ],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
    };
  }

  const resourceListing = isLikelyResourceOrListingPage({
    url: candidate.url,
    title: candidate.title,
    text: combined,
  });

  if (resourceListing.isResourceListing) {
    return {
      purpose: "resource_listing",
      reasons: [
        "Candidate appears to be a resource/listing page, not a direct applicant destination.",
        ...resourceListing.reasons,
      ],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
    };
  }

  const bestApplicationAction = getBestApplicationAction({
    pageText,
    candidateUrl: candidate.url,
    opportunityTitle: input.title,
    provider: input.provider,
  });

  const applicationDocument =
    bestApplicationAction?.type === "application_document"
      ? {
          url: bestApplicationAction.url || "",
          type: getDocumentType(bestApplicationAction.url || ""),
          label: bestApplicationAction.label,
        }
      : null;

  const hasApplicationAction = hasAnySignal(combined, [
    "apply",
    "application",
    "start application",
    "submit application",
    "application deadline",
    "eligibility",
    "requirements",
    "nomination form",
    "download application",
  ]);

  const hasNominationSignal = hasAnySignal(combined, [
    "nomination",
    "nominated",
    "self nominations are not accepted",
    "school must submit",
    "institutional nomination",
  ]);

  const hasEmailApplicationSignal =
    hasAnySignal(combined, [
      "email completed applications",
      "applications must be emailed",
      "submit by email",
      "emailed to",
    ]) || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(combined);

  const hasLoginSignal = hasAnySignal(combined, [
    "sign in to apply",
    "login to apply",
    "create an account",
    "applicant portal",
    "application portal",
  ]);

  const hasProgramSignal = hasAnySignal(combined, [
    "program",
    "scholarship",
    "fellowship",
    "grant",
    "competition",
    "leadership",
    "career development",
    "pipeline program",
    "research program",
  ]);

  if (bestApplicationAction) {
    reasons.push(...bestApplicationAction.reasons);
  }

  if (applicationDocument) {
    reasons.push("Candidate page links to an application document.");
  }

  if (bestApplicationAction?.type === "registration_page") {
    return {
      purpose: "official_application_page",
      reasons: ["Candidate page links to a registration/application page.", ...reasons],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
    };
  }

  if (bestApplicationAction?.type === "internal_application_page") {
    return {
      purpose: "official_application_page",
      reasons: ["Candidate page links to an internal application page.", ...reasons],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
    };
  }

  if (bestApplicationAction?.type === "third_party_portal") {
    return {
      purpose: "third_party_portal",
      reasons: ["Candidate page links to a third-party application portal.", ...reasons],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
    };
  }

  if (bestApplicationAction?.type === "login_portal") {
    return {
      purpose: "login_gated_portal",
      reasons: ["Candidate page links to a login-gated application portal.", ...reasons],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
    };
  }

  if (bestApplicationAction?.type === "nomination_instruction") {
    return {
      purpose: "nomination_based",
      reasons: ["Candidate page links to nomination/application instructions.", ...reasons],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
    };
  }

  if (bestApplicationAction?.type === "application_instructions") {
    return {
      purpose: "official_application_page",
      reasons: ["Candidate page links to application instructions.", ...reasons],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
    };
  }

  if (hasNominationSignal) {
    return {
      purpose: "nomination_based",
      reasons: ["Candidate indicates nomination-based application process.", ...reasons],
      applicationDocumentUrl: applicationDocument?.url || null,
      applicationDocumentType: applicationDocument?.type || null,
    };
  }

  if (hasEmailApplicationSignal) {
    return {
      purpose: "email_based_application",
      reasons: ["Candidate indicates email-based application process.", ...reasons],
      applicationDocumentUrl: applicationDocument?.url || null,
      applicationDocumentType: applicationDocument?.type || null,
    };
  }

  if (hasLoginSignal || staticPurpose === "login_gated_portal") {
    return {
      purpose: "login_gated_portal",
      reasons: ["Candidate appears to require login/account access.", ...reasons],
      applicationDocumentUrl: applicationDocument?.url || null,
      applicationDocumentType: applicationDocument?.type || null,
    };
  }

  if (hasApplicationAction && applicationDocument) {
    return {
      purpose: "official_application_page",
      reasons: ["Candidate has application actions and links to an application document.", ...reasons],
      applicationDocumentUrl: applicationDocument.url,
      applicationDocumentType: applicationDocument.type,
    };
  }

  if (hasApplicationAction) {
    return {
      purpose: "official_application_page",
      reasons: ["Candidate contains applicant-facing application signals.", ...reasons],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
    };
  }

  if (hasProgramSignal) {
    return {
      purpose: "official_program_page",
      reasons: ["Candidate appears to be an official program/opportunity page.", ...reasons],
      applicationDocumentUrl: applicationDocument?.url || null,
      applicationDocumentType: applicationDocument?.type || null,
    };
  }

  return {
    purpose: "unknown",
    reasons: ["Candidate purpose is unclear."],
    applicationDocumentUrl: applicationDocument?.url || null,
    applicationDocumentType: applicationDocument?.type || null,
  };
}

function purposeScore(purpose: CandidatePurpose) {
  const scores: Record<CandidatePurpose, number> = {
    official_application_page: 70,
    official_program_page: 58,
    application_document: 62,
    third_party_portal: 56,
    login_gated_portal: 50,
    email_based_application: 54,
    nomination_based: 54,
    press_or_news: -80,
    aggregator_or_database: -100,
    resource_listing: -20,
    generic_provider_page: 10,
    unknown: 0,
  };

  return scores[purpose];
}

function confidenceFromScore(score: number): DestinationConfidence {
  if (score >= 90) return "high";
  if (score >= 65) return "medium";
  if (score >= 40) return "low";
  return "none";
}

function buildApplicationDestinationQueries(input: ApplicationDestinationInput) {
  const title = String(input.title || "").trim();
  const provider = String(input.provider || "").trim();
  const type = String(input.type || "").replace(/_/g, " ").trim();

  const queries: string[] = [];

  if (title && provider) {
    queries.push(`"${title}" "${provider}" application`);
    queries.push(`"${title}" "${provider}" apply`);
    queries.push(`"${title}" "${provider}"`);
  }

  if (title) {
    queries.push(`"${title}" application`);
    queries.push(`"${title}" apply`);
    queries.push(`"${title}" official`);
  }

  if (title && type) {
    queries.push(`"${title}" "${type}" application`);
  }

  return Array.from(new Set(queries)).slice(0, 6);
}

async function collectDestinationCandidates(
  input: ApplicationDestinationInput
): Promise<DestinationCandidate[]> {
  const queries = buildApplicationDestinationQueries(input);
  const candidatesByUrl = new Map<string, DestinationCandidate>();

  for (const query of queries) {
    const results = await searchDiscoveryWeb({
      query,
      maxResults: 8,
    });

    for (const result of results) {
      const domain = getDomain(result.url);

      if (!domain || isKnownBlockedDomain(domain)) continue;

      const key = result.url.replace(/#.*$/, "").replace(/\/$/, "");

      if (!candidatesByUrl.has(key)) {
        candidatesByUrl.set(key, {
          url: result.url,
          title: result.title,
          snippet: result.snippet,
          domain,
        });
      }
    }
  }

  return Array.from(candidatesByUrl.values()).slice(0, 20);
}

async function rankDestinationCandidate({
  input,
  candidate,
}: {
  input: ApplicationDestinationInput;
  candidate: DestinationCandidate;
}): Promise<RankedDestinationCandidate> {
  let pageText = "";

  try {
    if (!isDocumentUrl(candidate.url)) {
      const capture = await capturePageWithHybrid(candidate.url);
      pageText = String(capture.finalResult.cleanText || "");
    }
  } catch {
    pageText = "";
  }

  const combined = [candidate.title, candidate.snippet, candidate.url, pageText]
    .filter(Boolean)
    .join(" ");

  const bestApplicationAction = getBestApplicationAction({
    pageText: combined,
    candidateUrl: candidate.url,
    opportunityTitle: input.title,
    provider: input.provider,
  });

  const purposeResult = classifyPagePurpose({
    input,
    candidate,
    pageText: combined,
  });

  const providerForRelationship = isWeakOrAggregatorProvider(input.provider)
    ? null
    : input.provider;

  const providerRelationship = assessProviderSourceRelationship({
    provider: providerForRelationship,
    url: candidate.url,
    pageText: combined,
  });

  const titleOverlap = tokenOverlap(input.title, combined);
  const providerOverlap = isWeakOrAggregatorProvider(input.provider)
    ? 0
    : tokenOverlap(input.provider, combined);
  const deadlineMatched = deadlineAppearsInText(input.deadline, combined);
  const resourceListing = isLikelyResourceOrListingPage({
    url: candidate.url,
    title: candidate.title,
    text: combined,
  });
  const recognizedPortal = isRecognizedApplicationPortalUrl(
    bestApplicationAction?.url || candidate.url
  );

  let score = purposeScore(purposeResult.purpose);
  const reasons = [...purposeResult.reasons];

  if (titleOverlap >= 0.65) {
    score += 18;
    reasons.push("Strong title match.");
  } else if (titleOverlap >= 0.35) {
    score += 9;
    reasons.push("Partial title match.");
  }

  if (providerRelationship.isProviderAligned) {
    score += 18;
    reasons.push("Provider/source relationship is aligned.");
    reasons.push(...providerRelationship.reasons);
  } else if (providerOverlap >= 0.35) {
    score += 8;
    reasons.push("Provider appears in candidate content.");
  }

  if (deadlineMatched) {
    score += 8;
    reasons.push("Candidate contains matching deadline.");
  }

  if (purposeResult.applicationDocumentUrl) {
    score += 10;
    reasons.push("Application document detected.");

    const documentText = [
      purposeResult.applicationDocumentUrl,
      candidate.title,
      candidate.snippet,
      pageText,
    ]
      .filter(Boolean)
      .join(" ");

    const documentTitleOverlap = tokenOverlap(input.title, documentText);
    const documentProviderOverlap = isWeakOrAggregatorProvider(input.provider)
      ? 0
      : tokenOverlap(input.provider, documentText);

    if (
      documentTitleOverlap < 0.35 &&
      documentProviderOverlap < 0.3 &&
      !providerRelationship.isProviderAligned
    ) {
      score -= 35;
      reasons.push("Application document is weakly matched to the opportunity/provider.");
    }
  }

  if (resourceListing.isResourceListing && !bestApplicationAction) {
    score = Math.min(score, 35);
    reasons.push("Resource/listing page capped because no stronger application action was found.");
  }

  if (purposeResult.purpose === "resource_listing") {
    score = Math.min(score, 35);
    reasons.push("Resource/listing pages cannot be high-confidence destinations.");
  }

  if (
    purposeResult.purpose === "aggregator_or_database" ||
    purposeResult.purpose === "press_or_news"
  ) {
    score = Math.min(score, 10);
  }

  const hasStrongOwnershipSignal =
    providerRelationship.isProviderAligned ||
    recognizedPortal ||
    (
      purposeResult.purpose !== "resource_listing" &&
      purposeResult.purpose !== "aggregator_or_database" &&
      purposeResult.purpose !== "press_or_news" &&
      !isWeakOrAggregatorProvider(input.provider) &&
      providerOverlap >= 0.45
    );

  if (!hasStrongOwnershipSignal && score >= 90) {
    score = 78;
    reasons.push("High confidence capped because provider/source ownership is not strong enough.");
  }

  if (purposeResult.purpose === "application_document" && !hasStrongOwnershipSignal && score >= 65) {
    score = 55;
    reasons.push("Document confidence capped because source/provider ownership is unclear.");
  }

  const confidence = confidenceFromScore(score);

  const rankedCandidate: RankedDestinationCandidate = {
    ...candidate,
    purpose: purposeResult.purpose,
    score,
    confidence,
    reasons: Array.from(new Set(reasons)),
    applicationDocumentUrl: purposeResult.applicationDocumentUrl,
    applicationDocumentType: purposeResult.applicationDocumentType,
    applicationDestinationUrl:
      purposeResult.applicationDocumentUrl ||
      bestApplicationAction?.url ||
      (confidence !== "none" ? candidate.url : null),
    applicationDestinationType:
      bestApplicationAction?.type === "application_document"
        ? "application_document"
        : bestApplicationAction?.type === "third_party_portal"
          ? "third_party_portal"
          : bestApplicationAction?.type === "login_portal"
            ? "login_gated_portal"
            : bestApplicationAction?.type === "email_submission"
              ? "email_based_application"
              : bestApplicationAction?.type === "nomination_instruction"
                ? "nomination_based"
                : purposeResult.purpose,
  };

  return applyDestinationAlignmentGuard({
    input,
    candidate: rankedCandidate,
  });
}


function sourceUrlDestinationResult(
  input: ApplicationDestinationInput
): ApplicationDestinationResult | null {
  const sourceUrl = input.sourceUrl;

  if (!sourceUrl) return null;

  const domain = getDomain(sourceUrl);
  const sourceQuality = assessSourceQuality(sourceUrl);
  const urlLower = sourceUrl.toLowerCase();
  const combined = normalizeText(
    [input.title, input.provider, input.type, input.sourceUrl].filter(Boolean).join(" ")
  );

  if (!domain) return null;

  if (isKnownBlockedDomain(sourceUrl) || isKnownAggregatorDomain(sourceUrl)) {
    return null;
  }

  const strongApplicationSignals = [
    "/apply",
    "/application",
    "/applications",
    "/register",
    "/registration",
    "/submit",
    "/submission",
    "/scholarshipdetails",
    "/scholarship-details",
    "/home/scholarshipdetails",
    "apply now",
    "start application",
    "submit application",
    "application portal",
    "scholarship details",
    "sign in to apply",
    "login to apply",
    "create account",
  ];

  const programPageSignals = [
    "/scholarship",
    "/scholarships",
    "/fellowship",
    "/fellowships",
    "/grant",
    "/grants",
    "/program",
    "/programs",
    "/funding",
    "/awards",
    "/opportunities",
  ];

  const hasStrongApplicationSignal =
    strongApplicationSignals.some((signal) =>
      urlLower.includes(normalizeText(signal).replaceAll(" ", ""))
    ) || hasAnySignal(combined, strongApplicationSignals);

  const hasProgramPageSignal = programPageSignals.some((signal) =>
    urlLower.includes(signal)
  );

  const isTrustedOfficialSource = [
    "government",
    "university",
    "official_provider",
    "foundation_or_nonprofit",
  ].includes(sourceQuality.category);

  if (sourceQuality.category === "application_portal") {
    const confidence: DestinationConfidence = hasStrongApplicationSignal
      ? "high"
      : "medium";

    return {
      officialSourceUrl: null,
      applicationDestinationUrl: sourceUrl,
      applicationDestinationType: "third_party_portal",
      officialSourceStatus: "candidate_found",
      destinationConfidence: confidence,
      destinationReasons: [
        `Source URL is a known application portal (${domain}) and was used as the applicant destination.`,
        ...sourceQuality.reasons,
      ],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
      candidates: [],
    };
  }

  if (isTrustedOfficialSource && hasStrongApplicationSignal) {
    return {
      officialSourceUrl: sourceUrl,
      applicationDestinationUrl: sourceUrl,
      applicationDestinationType: "official_application_page",
      officialSourceStatus: "verified_destination",
      destinationConfidence: "high",
      destinationReasons: [
        "Source URL is an official or institution-hosted applicant-facing page with strong application signals.",
        ...sourceQuality.reasons,
      ],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
      candidates: [],
    };
  }

  if (isTrustedOfficialSource && hasProgramPageSignal) {
    return {
      officialSourceUrl: sourceUrl,
      applicationDestinationUrl: sourceUrl,
      applicationDestinationType: "official_program_page",
      officialSourceStatus: "verified_destination",
      destinationConfidence: "medium",
      destinationReasons: [
        "Source URL is an official or institution-hosted program/funding page and was used as the applicant destination candidate.",
        ...sourceQuality.reasons,
      ],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
      candidates: [],
    };
  }

  if (
    sourceQuality.category === "unknown" &&
    hasStrongApplicationSignal &&
    !isKnownAggregatorDomain(sourceUrl)
  ) {
    return {
      officialSourceUrl: null,
      applicationDestinationUrl: sourceUrl,
      applicationDestinationType: "unknown",
      officialSourceStatus: "needs_human_review",
      destinationConfidence: "low",
      destinationReasons: [
        "Unknown source has strong application behavior signals, but needs human review before publishing.",
        ...sourceQuality.reasons,
      ],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
      candidates: [],
    };
  }

  return null;
}



function downgradeDestinationConfidence(
  confidence: DestinationConfidence
): DestinationConfidence {
  if (confidence === "high") return "low";
  if (confidence === "medium") return "low";
  return confidence;
}

function applyDestinationAlignmentGuard({
  input,
  candidate,
}: {
  input: ApplicationDestinationInput;
  candidate: RankedDestinationCandidate;
}): RankedDestinationCandidate {
  if (candidate.confidence === "none") return candidate;

  const destinationUrl = candidate.applicationDestinationUrl || candidate.url;
  const destinationDomain = getDomain(destinationUrl);
  const sourceDomain = getDomain(input.sourceUrl || null);
  const destinationQuality = assessSourceQuality(destinationUrl);
  const sourceQuality = input.sourceUrl ? assessSourceQuality(input.sourceUrl) : null;

  const destinationText = [
    candidate.title,
    candidate.snippet,
    candidate.url,
    candidate.applicationDestinationUrl,
  ]
    .filter(Boolean)
    .join(" ");

  const destinationAggregatorBehavior = detectAggregatorBehavior({
    url: destinationUrl,
    title: candidate.title || input.title,
    text: destinationText,
    provider: input.provider,
  });

  const hardAggregatorDestinationDomains = new Set([
    "scholarshipbuddy.com",
    "scholarshipguidance.com",
    "scholarshipinstitute.org",
    "scholarshipscanada.com",
    "collegescholarships.org",
    "collegevine.com",
    "collegewhale.com",
    "sallie.com",
    "biglawinvestor.com",
    "mastersportal.com",
    "findamasters.com",
    "findaphd.com",
    "hotcoursesabroad.com",
    "applykite.com",
    "gyandhan.com",
    "yocket.com",
    "leverageedu.com",
    "upgrad.com",
  ]);

  const isHardAggregatorDestination =
    destinationDomain !== null &&
    Array.from(hardAggregatorDestinationDomains).some(
      (knownDomain) =>
        destinationDomain === knownDomain ||
        destinationDomain.endsWith(`.${knownDomain}`)
    );

  if (
    destinationQuality.isAggregator ||
    destinationAggregatorBehavior.isAggregatorLike ||
    isHardAggregatorDestination
  ) {
    return {
      ...candidate,
      purpose: "aggregator_or_database",
      confidence: "none",
      score: -100,
      applicationDestinationUrl: null,
      applicationDestinationType: "aggregator_or_database",
      reasons: Array.from(
        new Set([
          ...candidate.reasons,
          "Destination rejected because it is an aggregator/listing/database page, not an applicant destination.",
          ...destinationQuality.reasons,
          ...destinationAggregatorBehavior.reasons,
        ])
      ),
    };
  }

  const providerRelationship = assessProviderSourceRelationship({
    provider: input.provider,
    url: destinationUrl,
    pageText: destinationText,
  });

  const titleOverlap = tokenOverlap(input.title, destinationText);
  const providerDomainOverlap = tokenOverlap(input.provider, destinationDomain || "");

  const sameTrustedSourceDomain =
    Boolean(sourceDomain && destinationDomain) &&
    sourceDomain === destinationDomain &&
    sourceQuality !== null &&
    !sourceQuality.isAggregator;

  const isKnownPortalDestination =
    destinationQuality.category === "application_portal";

  const isTrustedOfficialDestination = [
    "government",
    "university",
    "official_provider",
    "foundation_or_nonprofit",
  ].includes(destinationQuality.category);

  const providerDomainAligned =
    providerDomainOverlap >= 0.15 ||
    providerRelationship.reasons.some((reason) =>
      reason.toLowerCase().includes("provider appears aligned with source domain")
    );

  const isApplicationDocument =
    candidate.applicationDestinationType === "application_document";

  const isSafeDocument =
    isApplicationDocument &&
    (providerDomainAligned ||
      sameTrustedSourceDomain ||
      isKnownPortalDestination ||
      isTrustedOfficialDestination);

  const isSafeNonDocument =
    !isApplicationDocument &&
    (providerRelationship.isProviderAligned ||
      sameTrustedSourceDomain ||
      isKnownPortalDestination ||
      (isTrustedOfficialDestination && titleOverlap >= 0.35));

  const isSafe = isSafeDocument || isSafeNonDocument;

  if (isSafe) {
    return candidate;
  }

  return {
    ...candidate,
    confidence: downgradeDestinationConfidence(candidate.confidence),
    score: Math.min(candidate.score, 25),
    reasons: Array.from(
      new Set([
        ...candidate.reasons,
        "Destination confidence downgraded because provider/domain alignment was weak.",
        ...providerRelationship.reasons,
      ])
    ),
  };
}



type DestinationAvailabilityResult = {
  isAvailable: boolean;
  reason: string | null;
};

async function verifyDestinationAvailability(
  url: string | null | undefined
): Promise<DestinationAvailabilityResult> {
  if (!url) {
    return {
      isAvailable: false,
      reason: "Missing destination URL.",
    };
  }

  const lower = url.toLowerCase();

  if (
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    lower.endsWith(".pdf") ||
    lower.endsWith(".doc") ||
    lower.endsWith(".docx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".xlsx")
  ) {
    return {
      isAvailable: true,
      reason: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; OppscoresBot/1.0; +https://oppscores.com)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (response.status === 404 || response.status === 410) {
      return {
        isAvailable: false,
        reason: `Destination returned HTTP ${response.status}.`,
      };
    }

    if (response.status >= 500) {
      return {
        isAvailable: false,
        reason: `Destination returned server error HTTP ${response.status}.`,
      };
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      const html = (await response.text()).slice(0, 12000);
      const normalizedHtml = normalizeText(html);

      const pageNotFoundSignals = [
        "404 page not found",
        "page not found",
        "the page you re looking for doesn t exist",
        "the page you are looking for does not exist",
        "may have been moved",
        "not found error",
      ];

      if (hasAnySignal(normalizedHtml, pageNotFoundSignals)) {
        return {
          isAvailable: false,
          reason: "Destination page content indicates a 404/page-not-found page.",
        };
      }
    }

    return {
      isAvailable: true,
      reason: null,
    };
  } catch (error) {
    return {
      isAvailable: false,
      reason: `Destination availability check failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  } finally {
    clearTimeout(timeout);
  }
}


export function emptyApplicationDestinationResult(
  reason: string
): ApplicationDestinationResult {
  return {
    officialSourceUrl: null,
    applicationDestinationUrl: null,
    applicationDestinationType: "not_found",
    officialSourceStatus: "failed_lookup",
    destinationConfidence: "none",
    destinationReasons: [reason],
    applicationDocumentUrl: null,
    applicationDocumentType: null,
    candidates: [],
  };
}

export async function rankApplicationDestination(
  input: ApplicationDestinationInput
): Promise<ApplicationDestinationResult> {
  if (!input.title || !input.provider) {
    return emptyApplicationDestinationResult(
      "Missing title or provider; cannot rank application destination safely."
    );
  }

  const sourceUrlResult = sourceUrlDestinationResult(input);

  if (sourceUrlResult) {
    return sourceUrlResult;
  }

  const candidates = await collectDestinationCandidates(input);
  const ranked: RankedDestinationCandidate[] = [];

  for (const candidate of candidates.slice(0, 8)) {
    const rankedCandidate = await rankDestinationCandidate({
      input,
      candidate,
    });

    ranked.push(rankedCandidate);
  }

  const sorted = ranked.sort((left, right) => right.score - left.score);
  let best: RankedDestinationCandidate | null = null;

  for (const candidate of sorted) {
    if (candidate.confidence === "none") continue;

    const destinationUrl = candidate.applicationDestinationUrl || candidate.url;
    const availability = await verifyDestinationAvailability(destinationUrl);

    if (availability.isAvailable) {
      best = candidate;
      break;
    }

    candidate.confidence = "none";
    candidate.score = -100;
    candidate.applicationDestinationUrl = null;
    candidate.applicationDestinationType = "unknown";
    candidate.reasons = Array.from(
      new Set([
        ...candidate.reasons,
        availability.reason || "Destination failed availability check.",
      ])
    );
  }

  if (!best) {
    return {
      officialSourceUrl: null,
      applicationDestinationUrl: null,
      applicationDestinationType: "not_found",
      officialSourceStatus: candidates.length ? "needs_human_review" : "aggregator_only",
      destinationConfidence: "none",
      destinationReasons: candidates.length
        ? [
            "No strong applicant-facing destination found among candidates.",
            "Candidate destinations were either weak, aggregator-like, unavailable, or failed availability checks.",
          ]
        : ["No destination candidates found."],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
      candidates: sorted,
    };
  }

  // `best` here came from web search (the sourceUrl self-check path returns
  // earlier). A searched candidate may only be marked "verified_destination"
  // when it is high confidence AND has strong provider/domain ownership.
  const bestDestinationUrl = best.applicationDestinationUrl || best.url;
  const bestDestinationDomain = getDomain(bestDestinationUrl);
  const bestSourceDomain = getDomain(input.sourceUrl || null);
  const bestDestinationQuality = assessSourceQuality(bestDestinationUrl);
  const bestProviderRelationship = assessProviderSourceRelationship({
    provider: input.provider,
    url: bestDestinationUrl,
    pageText: [best.title, best.snippet].filter(Boolean).join(" "),
  });
  const bestSameTrustedSourceDomain =
    Boolean(bestSourceDomain && bestDestinationDomain) &&
    bestSourceDomain === bestDestinationDomain &&
    !assessSourceQuality(input.sourceUrl || "").isAggregator;

  const hasStrongOwnership =
    bestProviderRelationship.isProviderAligned ||
    bestDestinationQuality.category === "application_portal" ||
    isRecognizedApplicationPortalUrl(bestDestinationUrl) ||
    bestSameTrustedSourceDomain;

  let officialSourceStatus: ApplicationDestinationResult["officialSourceStatus"];
  if (best.confidence === "high" && hasStrongOwnership) {
    officialSourceStatus = "verified_destination";
  } else if (best.confidence === "low") {
    officialSourceStatus = "needs_human_review";
  } else {
    officialSourceStatus = "candidate_found";
  }

  return {
    officialSourceUrl:
      best.purpose === "application_document" ? null : best.url,
    applicationDestinationUrl: best.applicationDestinationUrl,
    applicationDestinationType: best.applicationDestinationType,
    officialSourceStatus,
    destinationConfidence: best.confidence,
    destinationReasons: [
      `Best applicant destination selected with ${best.confidence} confidence.`,
      ...best.reasons,
    ],
    applicationDocumentUrl: best.applicationDocumentUrl,
    applicationDocumentType: best.applicationDocumentType,
    candidates: sorted,
  };
}
