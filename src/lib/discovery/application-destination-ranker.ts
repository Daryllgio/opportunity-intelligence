/**
 * Application destination ranker.
 *
 * Given an extracted opportunity (title, provider, type, source URL,
 * deadline), find the page an applicant should actually land on — the
 * official application/program page, a recognized third-party portal, or an
 * application document — and report an HONEST confidence level.
 *
 * Hard rules:
 * - Domains on the blocked-destination policy (aggregators, social media,
 *   Wikipedia/informational, news, generic hosting) are NEVER returned as
 *   destinations, no matter how relevant their content looks.
 * - "high" confidence requires domain-level ownership evidence (the provider
 *   plausibly owns the destination domain, or it is a recognized application
 *   portal, or it is the same non-aggregator domain the opportunity was
 *   extracted from) — a page merely mentioning the provider is not ownership.
 * - Every returned destination must have been fetched and look alive.
 */

import {
  capturePageWithHybrid,
  type HybridCaptureResult,
} from "@/lib/discovery/capture/hybrid-capture";
import type { CapturedLink } from "@/lib/discovery/capture/cheerio-capture";
import {
  getDomain,
  isAggregatorDomain,
  isBlockedDestinationUrl,
  isRecognizedApplicationPortalUrl,
  providerMatchesDomain,
} from "@/lib/discovery/domain-policy";
import {
  assessSourceQuality,
  detectAggregatorBehavior,
} from "@/lib/discovery/source-quality";
import { searchDiscoveryWeb } from "@/lib/discovery/search/search-provider";
import { verifyApplicationDestination } from "@/lib/discovery/verify-destination";
import {
  deadlineAppearsInText,
  hasAnySignal,
  normalizeMatchText,
  tokenOverlap,
  tokenSet,
} from "@/lib/discovery/text-match";

// Tokens too common across opportunity titles to prove a page is about THIS
// opportunity. Used by the distinctive-title guard in evaluateCandidate.
const GENERIC_OPPORTUNITY_TITLE_TOKENS = new Set([
  "the",
  "and",
  "for",
  "student",
  "students",
  "research",
  "fellowship",
  "fellowships",
  "scholarship",
  "scholarships",
  "program",
  "programs",
  "award",
  "awards",
  "grant",
  "grants",
  "summer",
  "annual",
  "memorial",
  "medical",
  "health",
  "science",
  "sciences",
  "school",
  "university",
  "college",
  "undergraduate",
  "graduate",
  "doctoral",
  "postdoctoral",
  "national",
  "international",
  "foundation",
  "society",
  "association",
  "institute",
  "competition",
  "leadership",
  "development",
  "career",
  "pipeline",
  "training",
  "education",
  "studentship",
  "studentships",
  "opportunity",
  "opportunities",
]);

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

export type RankedDestinationCandidate = DestinationCandidate & {
  purpose: CandidatePurpose;
  score: number;
  confidence: DestinationConfidence;
  reasons: string[];
  applicationDocumentUrl: string | null;
  applicationDocumentType: string | null;
  applicationDestinationUrl: string | null;
  applicationDestinationType: CandidatePurpose;
  // Captured page content, retained so the AI verification step can reuse it
  // without a second fetch when the destination IS the evaluated page.
  capturedFinalUrl?: string | null;
  capturedTitle?: string | null;
  capturedText?: string | null;
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
  /** True only when the AI verifier read the page and confirmed it. */
  destinationVerified: boolean;
  /** The verifier's verdict for the returned destination (or last rejection). */
  verificationVerdict: string | null;
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const MAX_SEARCH_QUERIES = 3;
const MAX_CANDIDATES_TO_EVALUATE = 6;
const CANDIDATE_FETCH_CONCURRENCY = 3;
const MAX_PAGE_TEXT_CHARS = 20000;

function isDocumentUrl(url: string) {
  const lower = url.toLowerCase().split("?")[0];
  return (
    lower.endsWith(".pdf") || lower.endsWith(".doc") || lower.endsWith(".docx")
  );
}

function getDocumentType(url: string) {
  const lower = url.toLowerCase().split("?")[0];

  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".doc")) return "doc";
  if (lower.endsWith(".docx")) return "docx";

  return null;
}

function isPressOrNewsUrl(url: string) {
  const lower = url.toLowerCase();

  return (
    lower.includes("/news/") ||
    lower.includes("/newsroom") ||
    lower.includes("/press-release") ||
    lower.includes("/press_release") ||
    lower.includes("/press/") ||
    lower.includes("/blog/") ||
    lower.includes("/stories/") ||
    lower.includes("/article/") ||
    lower.includes("news-release") ||
    lower.includes("news_release") ||
    lower.includes("newsrelease") ||
    lower.includes("media-release") ||
    lower.includes("news-story") ||
    lower.includes("news_story")
  );
}

/** Tokenized URL path segments: "/gwags-scholars-program/" → [gwags, scholars, program]. */
function getPathTokens(url: string): string[] {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.split(/[/\-_.]+/).filter((token) => token.length >= 2);
  } catch {
    return [];
  }
}

function getPathDepth(url: string): number {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}

const APPLY_PATH_TOKENS = new Set([
  "apply",
  "application",
  "applications",
  "register",
  "registration",
  "submit",
  "submission",
  "scholarshipdetails",
]);

const PROGRAM_PATH_TOKENS = new Set([
  "scholarship",
  "scholarships",
  "scholar",
  "scholars",
  "fellowship",
  "fellowships",
  "fellow",
  "fellows",
  "grant",
  "grants",
  "award",
  "awards",
  "bursary",
  "bursaries",
  "program",
  "programs",
  "funding",
  "opportunity",
  "opportunities",
  "competition",
  "competitions",
  "challenge",
  "research",
]);

function hasApplyPathSignal(url: string) {
  return getPathTokens(url).some((token) => APPLY_PATH_TOKENS.has(token));
}

function hasProgramPathSignal(url: string) {
  return getPathTokens(url).some((token) => PROGRAM_PATH_TOKENS.has(token));
}

const LOGIN_PATH_SIGNALS = ["login", "signin", "sign-in", "sign_in", "/account"];

function hasLoginPathSignal(url: string) {
  const lower = url.toLowerCase();
  return LOGIN_PATH_SIGNALS.some((signal) => lower.includes(signal));
}

const NOT_FOUND_SIGNALS = [
  "404 page not found",
  "page not found",
  "the page you re looking for doesn t exist",
  "the page you are looking for does not exist",
  "this page may have been moved",
  "not found error",
];

function looksLikeNotFoundPage(title: string | null, text: string) {
  return hasAnySignal(`${title || ""} ${text.slice(0, 4000)}`, NOT_FOUND_SIGNALS);
}

const RESOURCE_LISTING_SIGNALS = [
  "list of scholarships",
  "scholarship list",
  "scholarship directory",
  "scholarship database",
  "browse scholarships",
  "search scholarships",
  "find scholarships",
  "fellowship list",
  "fellowship directory",
  "external fellowships",
  "grant directory",
  "funding database",
  "opportunity database",
  "student resources",
  "resource guide",
  "filter results",
  "sort by",
  "results found",
];

function looksLikeResourceListing(title: string | null, url: string, text: string) {
  return hasAnySignal(`${title || ""} ${url} ${text.slice(0, 8000)}`, RESOURCE_LISTING_SIGNALS);
}

const NOMINATION_SIGNALS = [
  "self nominations are not accepted",
  "must be nominated",
  "institutional nomination",
  "school must submit",
  "nomination form",
];

const EMAIL_APPLICATION_SIGNALS = [
  "email completed applications",
  "applications must be emailed",
  "submit by email",
  "email your application",
];

// ---------------------------------------------------------------------------
// Application actions: real links extracted from the captured page
// ---------------------------------------------------------------------------

type ApplicationActionType =
  | "internal_application_page"
  | "registration_page"
  | "application_document"
  | "third_party_portal"
  | "login_portal"
  | "nomination_instruction";

type ApplicationAction = {
  url: string;
  label: string;
  type: ApplicationActionType;
  score: number;
};

const ACTION_LABEL_NOISE = new Set([
  "privacy",
  "privacy policy",
  "terms",
  "terms of use",
  "contact",
  "contact us",
  "donate",
  "about",
  "about us",
  "home",
  "news",
  "press",
  "winners",
  "past recipients",
  "alumni",
  "faq",
]);

function classifyActionLink(link: CapturedLink): ApplicationActionType | null {
  const href = link.href.toLowerCase();
  const label = normalizeMatchText(link.text);

  if (ACTION_LABEL_NOISE.has(label)) return null;

  // Same-page anchors and accessibility skip-links are navigation, not actions.
  if (label.startsWith("skip to")) return null;
  if (href.includes("#") && !href.split("#")[1]?.includes("/")) {
    const withoutFragment = href.split("#")[0];
    if (!hasApplyPathSignal(withoutFragment) && !isDocumentUrl(withoutFragment)) {
      return null;
    }
  }

  if (isDocumentUrl(link.href)) {
    // Only application-ish documents, not annual reports etc.
    if (
      hasAnySignal(`${href} ${label}`, ["application", "apply", "nomination", "form"])
    ) {
      return "application_document";
    }
    return null;
  }

  if (isRecognizedApplicationPortalUrl(link.href)) return "third_party_portal";

  if (hasLoginPathSignal(href) && hasAnySignal(label, ["apply", "application", "portal", "sign in", "log in"])) {
    return "login_portal";
  }

  if (hasAnySignal(`${href} ${label}`, ["nominate", "nomination"])) {
    return "nomination_instruction";
  }

  if (
    hasApplyPathSignal(link.href) ||
    hasAnySignal(label, [
      "apply now",
      "apply today",
      "apply here",
      "start application",
      "start your application",
      "submit application",
      "application form",
      "begin application",
      "how to apply",
    ]) ||
    label === "apply"
  ) {
    // Institution-wide "Apply" nav links (→ /admissions, /admission/apply)
    // are about enrolling at the school, not applying to this opportunity.
    const pathTokens = getPathTokens(link.href);
    if (
      pathTokens.some((token) => token === "admission" || token === "admissions") &&
      !hasAnySignal(label, ["scholarship", "award", "fellowship", "grant", "program"])
    ) {
      return null;
    }

    return hasAnySignal(`${href} ${label}`, ["register", "registration"])
      ? "registration_page"
      : "internal_application_page";
  }

  return null;
}

// Site-chrome actions that read as "register"/"sign up" but have nothing to
// do with applying to an opportunity (voter registration, newsletters, events).
const UNRELATED_ACTION_SIGNALS = [
  "register to vote",
  "voter registration",
  "vote",
  "voting",
  "election",
  "newsletter",
  "subscribe",
  "mailing list",
  "donate",
  "donation",
  "volunteer",
  "membership",
  "become a member",
  "rsvp",
  "event registration",
  "sign up for updates",
];

/**
 * Find the strongest applicant-facing action link on a captured page.
 * Only actions pointing at safe targets (same/related domain, provider-owned
 * domain, recognized portal, or an application document) are eligible.
 */
function findBestApplicationAction({
  links,
  pageUrl,
  provider,
  title,
  opportunityType,
}: {
  links: CapturedLink[];
  pageUrl: string;
  provider: string | null | undefined;
  title?: string | null;
  opportunityType?: string | null;
}): ApplicationAction | null {
  const pageDomain = getDomain(pageUrl);
  const pageKey = pageUrl.split("#")[0].replace(/\/$/, "");
  const pagePathTokens = getPathTokens(pageUrl);
  const actions: ApplicationAction[] = [];

  for (const link of links.slice(0, 400)) {
    if (!link.href || isBlockedDestinationUrl(link.href)) continue;

    // Links back to the page itself are not actions.
    if (link.href.split("#")[0].replace(/\/$/, "") === pageKey) continue;

    const type = classifyActionLink(link);
    if (!type) continue;

    const actionContext = normalizeMatchText(
      `${link.text} ${getPathTokens(link.href).join(" ")}`
    );

    if (hasAnySignal(actionContext, UNRELATED_ACTION_SIGNALS)) continue;

    const typeText = String(opportunityType || "").replace(/_/g, " ");
    const topical =
      tokenOverlap(`${title || ""} ${typeText}`, actionContext) > 0 ||
      getPathTokens(link.href).some(
        (token) => token.length >= 4 && pagePathTokens.includes(token)
      );

    // Registration links are the most boilerplate-prone class (member signup,
    // account creation): they must stay on topic — no root-level exemption.
    if (type === "registration_page" && !topical) continue;

    // Apply links must be either an unambiguous apply CTA or on topic.
    // This keeps "Apply Now" buttons while dropping links that apply to
    // something else entirely ("Apply for New Residential Water Service").
    if (type === "internal_application_page" && !topical) {
      const label = normalizeMatchText(link.text);
      const strongApplyCta =
        label === "apply" ||
        label === "apply online" ||
        hasAnySignal(label, [
          "apply now",
          "apply today",
          "apply here",
          "start application",
          "start your application",
          "begin application",
          "submit application",
          "application form",
          "how to apply",
        ]);

      if (!strongApplyCta) continue;
    }

    const actionDomain = getDomain(link.href);
    const sameDomain =
      Boolean(pageDomain && actionDomain) &&
      (pageDomain === actionDomain ||
        actionDomain!.endsWith(`.${pageDomain}`) ||
        pageDomain!.endsWith(`.${actionDomain}`));
    const portal = type === "third_party_portal";
    const providerOwned = providerMatchesDomain(provider, actionDomain).matched;
    const document = type === "application_document";

    // Off-domain, non-portal, non-owned, non-document targets are unsafe.
    if (!sameDomain && !portal && !providerOwned && !document) continue;

    const baseScores: Record<ApplicationActionType, number> = {
      internal_application_page: 60,
      registration_page: 55,
      application_document: 55,
      third_party_portal: 58,
      login_portal: 40,
      nomination_instruction: 42,
    };

    let score = baseScores[type];

    const label = normalizeMatchText(link.text);
    if (hasAnySignal(label, ["apply now", "start application", "submit application", "apply today"])) {
      score += 15;
    }
    if (sameDomain) score += 8;
    if (providerOwned) score += 8;

    actions.push({ url: link.href, label: link.text, type, score });
  }

  actions.sort((left, right) => right.score - left.score);

  return actions[0] || null;
}

// ---------------------------------------------------------------------------
// Candidate evaluation
// ---------------------------------------------------------------------------

type OwnershipEvidence = {
  strong: boolean;
  providerOwned: boolean;
  recognizedPortal: boolean;
  sameTrustedSourceDomain: boolean;
  reasons: string[];
};

function assessOwnership({
  input,
  destinationUrl,
}: {
  input: ApplicationDestinationInput;
  destinationUrl: string;
}): OwnershipEvidence {
  const reasons: string[] = [];
  const destinationDomain = getDomain(destinationUrl);
  const sourceDomain = getDomain(input.sourceUrl || null);

  const providerMatch = providerMatchesDomain(input.provider, destinationDomain);
  const recognizedPortal = isRecognizedApplicationPortalUrl(destinationUrl);
  const sameTrustedSourceDomain =
    Boolean(sourceDomain && destinationDomain) &&
    sourceDomain === destinationDomain &&
    !isAggregatorDomain(sourceDomain);

  if (providerMatch.matched) {
    reasons.push(providerMatch.reason || "Provider owns the destination domain.");
  }
  if (recognizedPortal) {
    reasons.push("Destination is a recognized application portal.");
  }
  if (sameTrustedSourceDomain) {
    reasons.push("Destination is on the same non-aggregator domain as the source page.");
  }

  return {
    strong: providerMatch.matched || recognizedPortal || sameTrustedSourceDomain,
    providerOwned: providerMatch.matched,
    recognizedPortal,
    sameTrustedSourceDomain,
    reasons,
  };
}

function confidenceRank(confidence: DestinationConfidence) {
  return { high: 3, medium: 2, low: 1, none: 0 }[confidence];
}

async function evaluateCandidate({
  input,
  candidate,
}: {
  input: ApplicationDestinationInput;
  candidate: DestinationCandidate;
}): Promise<RankedDestinationCandidate> {
  const reject = (purpose: CandidatePurpose, reason: string): RankedDestinationCandidate => ({
    ...candidate,
    purpose,
    score: -100,
    confidence: "none",
    reasons: [reason],
    applicationDocumentUrl: null,
    applicationDocumentType: null,
    applicationDestinationUrl: null,
    applicationDestinationType: purpose,
  });

  // Hard destination blocklist — never fetch, never rank.
  if (isBlockedDestinationUrl(candidate.url)) {
    return reject(
      "aggregator_or_database",
      "Domain is on the blocked-destination policy (aggregator/social/informational/news/hosting)."
    );
  }

  if (isPressOrNewsUrl(candidate.url)) {
    return reject("press_or_news", "URL pattern indicates a press/news/blog page.");
  }

  // Documents are ranked without fetching.
  if (isDocumentUrl(candidate.url)) {
    const ownership = assessOwnership({ input, destinationUrl: candidate.url });
    const titleMatch = tokenOverlap(
      input.title,
      `${candidate.title || ""} ${candidate.snippet || ""} ${candidate.url}`
    );

    if (!ownership.strong && titleMatch < 0.5) {
      return reject(
        "application_document",
        "Unowned document with weak title match — not safe to use as a destination."
      );
    }

    const confidence: DestinationConfidence = ownership.strong ? "medium" : "low";

    return {
      ...candidate,
      purpose: "application_document",
      score: ownership.strong ? 60 : 40,
      confidence,
      reasons: [
        "Candidate URL is an application document.",
        ...ownership.reasons,
      ],
      applicationDocumentUrl: candidate.url,
      applicationDocumentType: getDocumentType(candidate.url),
      applicationDestinationUrl: candidate.url,
      applicationDestinationType: "application_document",
    };
  }

  // Fetch the page once. Captured-and-parsed doubles as the availability check.
  let capture: HybridCaptureResult;
  try {
    capture = await capturePageWithHybrid(candidate.url);
  } catch (error) {
    return reject(
      "unknown",
      `Capture failed: ${error instanceof Error ? error.message : "unknown error"}.`
    );
  }

  const page = capture.finalResult;

  if (!page.ok) {
    return reject("unknown", `Destination not available (${page.error || "fetch failed"}).`);
  }

  const pageText = page.cleanText.slice(0, MAX_PAGE_TEXT_CHARS);

  if (looksLikeNotFoundPage(page.title, pageText)) {
    return reject("unknown", "Destination renders a page-not-found message.");
  }

  // Republished announcements don't always have news-ish URLs — catch them by
  // their opening text/title instead. A news release is never an application
  // destination, even when it links to one.
  const newsProbe = normalizeMatchText(
    `${page.title || ""} ${pageText.slice(0, 600)}`
  );
  if (
    hasAnySignal(newsProbe, [
      "news release",
      "press release",
      "for immediate release",
      "media release",
    ]) ||
    normalizeMatchText(page.title || "").includes("announces")
  ) {
    return reject("press_or_news", "Page reads as a news/press release.");
  }

  const combinedText = [candidate.title, candidate.snippet, page.title, pageText]
    .filter(Boolean)
    .join(" ");

  // Behavioral aggregator screen (unknown domains acting like databases).
  const aggregatorBehavior = detectAggregatorBehavior({
    url: candidate.url,
    title: candidate.title || page.title,
    text: combinedText,
    provider: input.provider,
  });

  if (aggregatorBehavior.isAggregatorLike) {
    return reject(
      "aggregator_or_database",
      "Page behaves like an opportunity aggregator/database."
    );
  }

  const reasons: string[] = [];
  const finalUrl = page.finalUrl || candidate.url;

  // Real apply links from the captured page (structured links, not regex).
  const action = findBestApplicationAction({
    links: page.links,
    pageUrl: finalUrl,
    provider: input.provider,
    title: input.title,
    opportunityType: input.type,
  });

  // Destination = the apply link when we found one, else the page itself.
  let destinationUrl = finalUrl;
  let purpose: CandidatePurpose = "unknown";
  let documentUrl: string | null = null;
  let documentType: string | null = null;

  const isListing = looksLikeResourceListing(candidate.title || page.title, candidate.url, pageText);

  if (action) {
    // Strip tracking params from action destinations.
    try {
      const cleaned = new URL(action.url);
      for (const param of Array.from(cleaned.searchParams.keys())) {
        if (param.toLowerCase().startsWith("utm_")) cleaned.searchParams.delete(param);
      }
      action.url = cleaned.toString().replace(/\?$/, "");
    } catch {
      // Keep the raw URL when parsing fails.
    }

    reasons.push(`Page has an applicant action link: "${action.label.slice(0, 60)}" → ${action.url.slice(0, 100)}`);

    if (action.type === "application_document") {
      documentUrl = action.url;
      documentType = getDocumentType(action.url);
      purpose = "official_application_page";
      // Keep the page as the destination; the document is supplementary.
    } else if (action.type === "third_party_portal") {
      destinationUrl = action.url;
      purpose = "third_party_portal";
    } else if (action.type === "login_portal") {
      destinationUrl = action.url;
      purpose = "login_gated_portal";
    } else if (action.type === "nomination_instruction") {
      purpose = "nomination_based";
    } else {
      destinationUrl = action.url;
      purpose = "official_application_page";
    }
  } else if (isListing) {
    return reject(
      "resource_listing",
      "Page is a resource/listing page with no direct applicant action."
    );
  } else if (isRecognizedApplicationPortalUrl(candidate.url)) {
    purpose = "third_party_portal";
  } else if (hasAnySignal(combinedText, NOMINATION_SIGNALS)) {
    purpose = "nomination_based";
  } else if (hasAnySignal(combinedText, EMAIL_APPLICATION_SIGNALS)) {
    purpose = "email_based_application";
  } else if (hasApplyPathSignal(candidate.url)) {
    purpose = "official_application_page";
  } else if (
    hasProgramPathSignal(candidate.url) &&
    hasAnySignal(combinedText, ["apply", "application", "deadline", "eligibility"])
  ) {
    purpose = "official_program_page";
  } else if (getPathDepth(candidate.url) === 0) {
    purpose = "generic_provider_page";
  }

  if (purpose === "unknown") {
    return reject("unknown", "No applicant-facing purpose could be established for this page.");
  }

  const ownership = assessOwnership({ input, destinationUrl });
  reasons.push(...ownership.reasons);

  const slugText = getPathTokens(candidate.url).join(" ");
  let titleMatch = Math.max(
    tokenOverlap(input.title, `${candidate.title || ""} ${page.title || ""} ${slugText}`),
    tokenOverlap(input.title, combinedText.slice(0, 4000)) * 0.9
  );

  // Generic tokens ("student research fellowship") can produce a high overlap
  // on a page about a DIFFERENT opportunity. When the title has distinctive
  // tokens (names like "Kuckein"), at least one must appear somewhere on the
  // page — otherwise the match is capped below every confidence gate.
  const distinctiveTokens = Array.from(tokenSet(input.title)).filter(
    (token) => !GENERIC_OPPORTUNITY_TITLE_TOKENS.has(token)
  );
  if (distinctiveTokens.length) {
    const haystack = normalizeMatchText(
      `${candidate.title || ""} ${page.title || ""} ${slugText} ${combinedText.slice(0, 8000)}`
    );
    const hasDistinctiveMatch = distinctiveTokens.some((token) =>
      haystack.includes(token)
    );
    if (!hasDistinctiveMatch) {
      titleMatch = Math.min(titleMatch, 0.3);
      reasons.push(
        "No distinctive title token found on the page — title match capped."
      );
    }
  }
  const deadlineMatch = deadlineAppearsInText(input.deadline, combinedText);
  const destinationQuality = assessSourceQuality(destinationUrl);
  const officialLeaningDomain = destinationQuality.isOfficialLeaning;

  if (titleMatch >= 0.6) reasons.push("Strong opportunity title match.");
  else if (titleMatch >= 0.35) reasons.push("Partial opportunity title match.");
  if (deadlineMatch) reasons.push("Page contains the opportunity deadline.");

  // Generic homepage without an apply action can never be a good destination.
  if (purpose === "generic_provider_page") {
    const confidence: DestinationConfidence = ownership.providerOwned ? "low" : "none";
    return {
      ...candidate,
      purpose,
      score: ownership.providerOwned ? 25 : -50,
      confidence,
      reasons: [
        ...reasons,
        "Provider homepage without a specific application path — needs human review.",
      ],
      applicationDocumentUrl: null,
      applicationDocumentType: null,
      applicationDestinationUrl: ownership.providerOwned ? destinationUrl : null,
      applicationDestinationType: purpose,
    };
  }

  // -------------------------------------------------------------------------
  // Honest confidence gates.
  // -------------------------------------------------------------------------
  const applicantFacing =
    purpose === "official_application_page" ||
    purpose === "third_party_portal" ||
    purpose === "login_gated_portal";

  let confidence: DestinationConfidence = "none";

  if (
    ownership.strong &&
    applicantFacing &&
    (titleMatch >= 0.5 || deadlineMatch)
  ) {
    confidence = "high";
  } else if (
    (ownership.strong &&
      (applicantFacing ||
        purpose === "official_program_page" ||
        purpose === "nomination_based" ||
        purpose === "email_based_application")) ||
    (officialLeaningDomain && applicantFacing && titleMatch >= 0.6)
  ) {
    confidence = "medium";
  } else if (
    titleMatch >= 0.35 &&
    (applicantFacing || purpose === "official_program_page")
  ) {
    confidence = "low";
  }

  if (confidence === "none") {
    return reject(purpose, "Candidate did not pass ownership/title confidence gates.");
  }

  const score =
    confidenceRank(confidence) * 30 +
    Math.round(titleMatch * 20) +
    (deadlineMatch ? 8 : 0) +
    (action ? 10 : 0) +
    (ownership.providerOwned ? 10 : 0);

  return {
    ...candidate,
    purpose,
    score,
    confidence,
    reasons: Array.from(new Set(reasons)),
    applicationDocumentUrl: documentUrl,
    applicationDocumentType: documentType,
    applicationDestinationUrl: destinationUrl,
    applicationDestinationType: purpose,
    capturedFinalUrl: finalUrl,
    capturedTitle: page.title,
    capturedText: pageText.slice(0, 9500),
  };
}

// ---------------------------------------------------------------------------
// Source-URL fast path
// ---------------------------------------------------------------------------

/**
 * If the page the opportunity was extracted from is itself official/owned,
 * it is usually the right destination — no web search needed. The page is
 * captured (availability + apply-link detection) before we trust it.
 */
async function evaluateSourceUrlAsDestination(
  input: ApplicationDestinationInput
): Promise<RankedDestinationCandidate | null> {
  const sourceUrl = input.sourceUrl;

  if (!sourceUrl) return null;
  if (isBlockedDestinationUrl(sourceUrl)) return null;

  const quality = assessSourceQuality(sourceUrl);
  const providerMatch = providerMatchesDomain(input.provider, getDomain(sourceUrl));

  const trustedCategory = [
    "government",
    "university",
    "official_provider",
    "foundation_or_nonprofit",
    "application_portal",
  ].includes(quality.category);

  // Unknown, unowned domains go through the full search path instead.
  if (!trustedCategory && !providerMatch.matched) return null;

  const candidate: DestinationCandidate = {
    url: sourceUrl,
    title: input.title || null,
    snippet: null,
    domain: getDomain(sourceUrl),
  };

  const evaluated = await evaluateCandidate({ input, candidate });

  if (evaluated.confidence === "none") return null;

  evaluated.reasons.unshift(
    "Source page itself qualifies as the applicant destination."
  );

  return evaluated;
}

// ---------------------------------------------------------------------------
// Search phase
// ---------------------------------------------------------------------------

function buildSearchQueries(input: ApplicationDestinationInput) {
  const title = String(input.title || "").trim();
  const provider = String(input.provider || "").trim();

  const queries: string[] = [];

  if (title && provider) {
    queries.push(`"${title}" "${provider}" apply`);
    queries.push(`"${title}" application`);
    queries.push(`${title} ${provider} official application`);
  } else if (title) {
    queries.push(`"${title}" apply`);
    queries.push(`"${title}" application`);
    queries.push(`${title} official application`);
  }

  return Array.from(new Set(queries)).slice(0, MAX_SEARCH_QUERIES);
}

async function collectSearchCandidates(
  input: ApplicationDestinationInput
): Promise<DestinationCandidate[]> {
  const queries = buildSearchQueries(input);
  const candidatesByUrl = new Map<string, DestinationCandidate>();

  for (const query of queries) {
    let results;
    try {
      results = await searchDiscoveryWeb({ query, maxResults: 8 });
    } catch {
      continue; // One failed query must not kill the lookup.
    }

    for (const result of results) {
      const domain = getDomain(result.url);

      if (!domain) continue;
      if (isBlockedDestinationUrl(result.url)) continue;
      if (isPressOrNewsUrl(result.url)) continue;

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

  return Array.from(candidatesByUrl.values());
}

/** Cheap pre-ranking so the fetch budget goes to the most promising URLs. */
function preRankCandidate(
  input: ApplicationDestinationInput,
  candidate: DestinationCandidate
) {
  let score = 0;

  if (providerMatchesDomain(input.provider, candidate.domain).matched) score += 40;
  if (isRecognizedApplicationPortalUrl(candidate.url)) score += 30;
  if (hasApplyPathSignal(candidate.url)) score += 20;
  if (hasProgramPathSignal(candidate.url)) score += 10;
  score += Math.round(
    tokenOverlap(input.title, `${candidate.title || ""} ${candidate.snippet || ""}`) * 20
  );
  if (assessSourceQuality(candidate.url).isOfficialLeaning) score += 10;

  return score;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );

  return results;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

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
    destinationVerified: false,
    verificationVerdict: null,
  };
}

function buildResultFromCandidate(
  best: RankedDestinationCandidate,
  allCandidates: RankedDestinationCandidate[],
  verification: { verified: boolean; verdict: string | null; reason?: string }
): ApplicationDestinationResult {
  const isDocument = best.applicationDestinationType === "application_document";

  const officialSourceStatus: ApplicationDestinationResult["officialSourceStatus"] =
    verification.verified
      ? "verified_destination"
      : best.confidence === "medium" || best.confidence === "high"
        ? "candidate_found"
        : "needs_human_review";

  return {
    officialSourceUrl: isDocument ? null : best.url,
    applicationDestinationUrl: best.applicationDestinationUrl,
    applicationDestinationType: best.applicationDestinationType,
    officialSourceStatus,
    destinationConfidence: verification.verified ? best.confidence : "low",
    destinationReasons: [
      verification.verified
        ? `AI verification confirmed the destination (${verification.verdict}): ${verification.reason || ""}`
        : `Best heuristic candidate, NOT AI-verified${verification.reason ? `: ${verification.reason}` : "."}`,
      ...best.reasons,
    ],
    applicationDocumentUrl: best.applicationDocumentUrl,
    applicationDocumentType: best.applicationDocumentType,
    candidates: allCandidates,
    destinationVerified: verification.verified,
    verificationVerdict: verification.verdict,
  };
}

// How many candidates get the (capture + model) verification treatment per
// lookup. Three attempts covers the realistic depth of good candidates.
const MAX_VERIFICATION_ATTEMPTS = 3;

/**
 * Try candidates best-first until the AI verifier confirms one. Returns the
 * verified result, or a rejection summary when nothing survives reading.
 */
async function verifyBestCandidate(
  input: ApplicationDestinationInput,
  sorted: RankedDestinationCandidate[]
): Promise<ApplicationDestinationResult | null> {
  const rejections: string[] = [];
  let attempts = 0;
  let sawExpired = false;
  let sawDegree = false;

  for (const candidate of sorted) {
    if (attempts >= MAX_VERIFICATION_ATTEMPTS) break;
    if (candidate.confidence === "none") continue;
    if (!candidate.applicationDestinationUrl) continue;

    attempts += 1;

    // Reuse the already-captured page when the destination IS that page.
    const destinationIsEvaluatedPage =
      candidate.capturedFinalUrl &&
      candidate.capturedText &&
      candidate.applicationDestinationUrl.replace(/\/$/, "") ===
        candidate.capturedFinalUrl.replace(/\/$/, "");

    const verdict = await verifyApplicationDestination({
      title: input.title,
      provider: input.provider,
      type: input.type,
      deadline: input.deadline,
      url: candidate.applicationDestinationUrl,
      preCaptured: destinationIsEvaluatedPage
        ? {
            pageTitle: candidate.capturedTitle ?? null,
            pageText: candidate.capturedText as string,
          }
        : null,
    });

    if (verdict.ok) {
      return buildResultFromCandidate(candidate, sorted, {
        verified: true,
        verdict: verdict.verdict,
        reason: verdict.reason,
      });
    }

    if (verdict.verdict === "expired_or_closed") sawExpired = true;
    if (verdict.verdict === "degree_or_admissions") sawDegree = true;

    rejections.push(
      `Rejected ${candidate.applicationDestinationUrl.slice(0, 90)} — ${verdict.verdict}: ${verdict.reason}`
    );
  }

  if (rejections.length === 0) return null;

  // Everything readable was wrong. Surface the strongest signal so ingest can
  // act on it (expired → track next cycle; degree page → out of scope).
  return {
    officialSourceUrl: null,
    applicationDestinationUrl: null,
    applicationDestinationType: "not_found",
    officialSourceStatus: "failed_lookup",
    destinationConfidence: "none",
    destinationReasons: [
      "AI verification rejected every candidate destination.",
      ...rejections,
    ],
    applicationDocumentUrl: null,
    applicationDocumentType: null,
    candidates: sorted,
    destinationVerified: false,
    verificationVerdict: sawDegree
      ? "degree_or_admissions"
      : sawExpired
        ? "expired_or_closed"
        : "all_candidates_rejected",
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

  // Phase 1: the source page itself (cheap — one capture, no search). Even a
  // high-confidence heuristic result must survive AI verification: "the source
  // page looks official" is exactly how content-farm pages slipped through.
  const sourceEvaluation = await evaluateSourceUrlAsDestination(input);
  let sourceRejectedByVerifier = false;

  if (
    sourceEvaluation &&
    (sourceEvaluation.confidence === "high" ||
      sourceEvaluation.confidence === "medium")
  ) {
    const verified = await verifyBestCandidate(input, [sourceEvaluation]);
    if (verified?.destinationVerified) return verified;
    // Source page failed reading — fall through to the search phase and don't
    // spend another verification attempt on the same page.
    sourceRejectedByVerifier = true;
  }

  // Phase 2: web search for the official destination.
  const collected = await collectSearchCandidates(input);

  const toEvaluate = collected
    .map((candidate) => ({
      candidate,
      preScore: preRankCandidate(input, candidate),
    }))
    .sort((left, right) => right.preScore - left.preScore)
    .slice(0, MAX_CANDIDATES_TO_EVALUATE)
    .map((entry) => entry.candidate);

  const evaluated = await mapWithConcurrency(
    toEvaluate,
    CANDIDATE_FETCH_CONCURRENCY,
    (candidate) => evaluateCandidate({ input, candidate })
  );

  // A low-confidence source page was never verified in phase 1 — let it
  // compete here. A verify-rejected one must not burn a second attempt.
  if (sourceEvaluation && !sourceRejectedByVerifier) {
    evaluated.push(sourceEvaluation);
  }

  const sorted = evaluated.sort((left, right) => {
    const confidenceDelta =
      confidenceRank(right.confidence) - confidenceRank(left.confidence);
    if (confidenceDelta !== 0) return confidenceDelta;
    return right.score - left.score;
  });

  const verified = await verifyBestCandidate(input, sorted);
  if (verified) return verified;

  const sourceWasAggregator = isAggregatorDomain(getDomain(input.sourceUrl || null));

  return {
    officialSourceUrl: null,
    applicationDestinationUrl: null,
    applicationDestinationType: "not_found",
    officialSourceStatus: sourceWasAggregator ? "aggregator_only" : "failed_lookup",
    destinationConfidence: "none",
    destinationReasons: collected.length
      ? [
          "No candidate passed the ownership/availability confidence gates.",
          "Candidates were aggregator-like, unavailable, unowned, or not applicant-facing.",
        ]
      : ["No destination candidates found in web search."],
    applicationDocumentUrl: null,
    applicationDocumentType: null,
    candidates: sorted,
    destinationVerified: false,
    verificationVerdict: null,
  };
}
