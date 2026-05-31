import { aggregatorDomains } from "@/lib/discovery/source-quality";

export type SourcePageClassification =
  | "direct_opportunity_page"
  | "provider_listing"
  | "aggregator_listing"
  | "resource_guide"
  | "login_or_portal"
  | "junk";

export type SourceClassificationResult = {
  classification: SourcePageClassification;
  shouldExtractDirectly: boolean;
  shouldExpandLinks: boolean;
  shouldRejectLead: boolean;
  reasons: string[];
};

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getHostname(value: unknown) {
  try {
    return new URL(String(value || "")).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getPathname(value: unknown) {
  try {
    return new URL(String(value || "")).pathname.toLowerCase();
  } catch {
    return "";
  }
}

// Single source of truth for aggregator domains lives in source-quality.ts.
const AGGREGATOR_DOMAINS = Array.from(aggregatorDomains);

const RESOURCE_GUIDE_SIGNALS = [
  "resource guide",
  "scholarship guide",
  "list of scholarships",
  "scholarships with",
  "scholarship list",
  "top scholarships",
  "opportunities database",
  "search fellowships",
  "search scholarships",
  "research opportunities database",
  "all scholarships",
  "undergraduate research programs",
  "summer research opportunities",
  "programs for students",
  "student resources",
];

const LISTING_URL_SIGNALS = [
  "/all-scholarships",
  "/resources/",
  "/resource-category/",
  "/article/",
  "/financial-aid",
  "/types-aid/scholarships",
  "/programs.aspx",
  "/opportunities",
  "/find-research",
  "/student-resources",
];

const LISTING_TEXT_SIGNALS = [
  "view all scholarships",
  "browse scholarships",
  "search scholarships",
  "find scholarships",
  "scholarship directory",
  "opportunity database",
  "program database",
  "filter results",
  "sort by",
  "results found",
  "more scholarships",
  "featured scholarships",
  "related opportunities",
];

const DIRECT_OPPORTUNITY_SIGNALS = [
  "eligibility",
  "eligible",
  "deadline",
  "application deadline",
  "apply by",
  "applications open",
  "applications are open",
  "application requirements",
  "requirements",
  "scholarship amount",
  "award amount",
  "stipend",
  "tuition",
  "must be",
  "applicants must",
  "students must",
  "letter of recommendation",
  "transcript",
  "essay",
  "gpa",
  "award",
  "fellowship",
  "scholarship",
];

const JUNK_TITLE_SIGNALS = [
  "apply now",
  "apply",
  "search",
  "home",
  "resources",
  "previous award winners",
  "switch to basic html version",
  "logout",
  "log out",
  "sign out",
  "français",
  "pdf",
  "word",
];

const JUNK_URL_SIGNALS = [
  "/account/",
  "/account/register",
  "/home/scholarships",
  "/signout",
  "/sign-out",
  "/logout",
  "/log-out",
  "/privacy",
  "/terms",
  "/donate",
  "/winner",
  "/winners",
  "/awardees",
  "/previous-awards",
  "/scholarship-honorees",
  ".pdf",
  ".doc",
  ".docx",
];

const CANADA_INFO_ONLY_SIGNALS = [
  "command philosophy",
  "statement on ethics",
  "leadership of the programs",
  "adult leadership",
  "command team",
  "cadets and junior canadian rangers",
];

function countSignals(text: string, signals: string[]) {
  return signals.reduce((count, signal) => {
    return text.includes(signal) ? count + 1 : count;
  }, 0);
}

function isSpecificOpportunityPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);

  if (pathname.includes("/home/scholarshipdetails/")) return true;

  if (
    pathname.includes("/scholarships-awards/") &&
    parts.length >= 2 &&
    !pathname.endsWith("/scholarships-awards/")
  ) {
    return true;
  }

  if (
    pathname.includes("/scholarship/") &&
    parts.length >= 2 &&
    !pathname.endsWith("/scholarship/")
  ) {
    return true;
  }

  if (
    pathname.includes("/students/") &&
    pathname.includes("scholarship") &&
    parts.length >= 2
  ) {
    return true;
  }

  if (
    pathname.includes("/programs/") &&
    parts.length >= 2 &&
    !pathname.endsWith("/programs/")
  ) {
    return true;
  }

  return false;
}

export function classifySourcePage({
  url,
  title,
  text,
}: {
  url: string;
  title: string;
  text: string;
}): SourceClassificationResult {
  const hostname = getHostname(url);
  const pathname = getPathname(url);
  const normalizedTitle = normalize(title);
  const normalizedText = normalize(text);
  const combined = `${hostname} ${pathname} ${normalizedTitle} ${normalizedText}`;

  const isAggregator = AGGREGATOR_DOMAINS.includes(hostname);

  const isKnownApplicationHost =
    hostname.includes("awardspring.com") ||
    hostname.includes("smapply.io") ||
    hostname.includes("submittable.com");

  const isApplicationDetailPage =
    pathname.includes("/home/scholarshipdetails/") ||
    pathname.includes("/submit/");

  const portalUrlSignals = [
    "/account/",
    "/account/register",
    "/login",
    "/sign-in",
    "/signin",
    "/password",
    "/users/sign_in",
  ];

  const portalTitleSignals = [
    "login",
    "sign in",
    "create account",
    "register",
    "forgot your password",
    "password",
  ];

  const hasJunkUrl = JUNK_URL_SIGNALS.some((signal) => pathname.includes(signal));
  const hasWeakTitle =
    !normalizedTitle ||
    JUNK_TITLE_SIGNALS.includes(normalizedTitle);

  const directSignalCount = countSignals(combined, DIRECT_OPPORTUNITY_SIGNALS);
  const listingSignalCount = countSignals(combined, LISTING_TEXT_SIGNALS);

  const looksSpecific = isSpecificOpportunityPath(pathname);

  const hasStrongDirectOpportunityEvidence =
    looksSpecific &&
    directSignalCount >= 5 &&
    !hasWeakTitle &&
    !hasJunkUrl;

  const isPortal =
    portalUrlSignals.some((signal) => pathname.includes(signal)) ||
    portalTitleSignals.some((signal) => normalizedTitle.includes(signal)) ||
    (isKnownApplicationHost && !isApplicationDetailPage && directSignalCount < 5);

  const isCanadaInfoOnly =
    hostname === "canada.ca" &&
    CANADA_INFO_ONLY_SIGNALS.some((signal) => combined.includes(signal)) &&
    !combined.includes("apply by") &&
    !combined.includes("application deadline") &&
    !combined.includes("scholarship amount") &&
    !combined.includes("stipend");

  if (isPortal) {
    return {
      classification: "login_or_portal",
      shouldExtractDirectly: false,
      shouldExpandLinks: false,
      shouldRejectLead: true,
      reasons: ["Login/application portal pages should not be extracted directly."],
    };
  }

  if (hasStrongDirectOpportunityEvidence) {
    return {
      classification: "direct_opportunity_page",
      shouldExtractDirectly: true,
      shouldExpandLinks: true,
      shouldRejectLead: false,
      reasons: ["Specific opportunity page with strong direct opportunity evidence."],
    };
  }

  if (hasJunkUrl) {
    return {
      classification: "junk",
      shouldExtractDirectly: false,
      shouldExpandLinks: false,
      shouldRejectLead: true,
      reasons: ["Junk, document, historical, winner, or non-opportunity URL."],
    };
  }

  if (isCanadaInfoOnly) {
    return {
      classification: "junk",
      shouldExtractDirectly: false,
      shouldExpandLinks: false,
      shouldRejectLead: true,
      reasons: ["Canada.ca informational leadership page, not a student-facing opportunity."],
    };
  }

  if (hasWeakTitle && directSignalCount < 6) {
    return {
      classification: "junk",
      shouldExtractDirectly: false,
      shouldExpandLinks: false,
      shouldRejectLead: true,
      reasons: ["Weak generic title without enough direct opportunity evidence."],
    };
  }

  const hasResourceGuideSignal = RESOURCE_GUIDE_SIGNALS.some((signal) =>
    combined.includes(signal)
  );

  const hasListingUrlSignal = LISTING_URL_SIGNALS.some((signal) =>
    pathname.includes(signal)
  );

  const pathParts = pathname.split("/").filter(Boolean);

  const looksLikeSpecificProgramPage =
    pathParts.length >= 2 &&
    (
      pathname.includes("/scholarships-awards/") ||
      pathname.includes("/scholarship/") ||
      pathname.includes("/scholarships/") ||
      pathname.includes("/fellowship/") ||
      pathname.includes("/fellowships/") ||
      pathname.includes("/award/") ||
      pathname.includes("/awards/") ||
      pathname.includes("/program/") ||
      pathname.includes("/programs/")
    );

  const isSpecificOpportunityUrl =
    looksLikeSpecificProgramPage ||
    /\/(scholarships-awards|scholarship|scholarships|fellowship|fellowships|award|awards)\/[^/]+\/?$/.test(pathname);

  const shouldTreatAsListing =
    !isSpecificOpportunityUrl &&
    (hasResourceGuideSignal || listingSignalCount >= 2 || hasListingUrlSignal);

  if (shouldTreatAsListing) {
    return {
      classification: isAggregator ? "aggregator_listing" : "resource_guide",
      shouldExtractDirectly: false,
      shouldExpandLinks: true,
      shouldRejectLead: false,
      reasons: [
        isAggregator
          ? "Aggregator/listing page. Expand child opportunity links instead of extracting this page."
          : "Resource guide/listing page. Expand links instead of extracting directly.",
      ],
    };
  }

  if (isAggregator && !isSpecificOpportunityUrl && directSignalCount < 6) {
    return {
      classification: "aggregator_listing",
      shouldExtractDirectly: false,
      shouldExpandLinks: true,
      shouldRejectLead: false,
      reasons: ["Aggregator domain without enough specific opportunity evidence. Expand child links instead."],
    };
  }

  const awardLikeTitle =
    normalizedTitle.includes("award") ||
    normalizedTitle.includes("scholarship") ||
    normalizedTitle.includes("fellowship") ||
    normalizedTitle.includes("grant") ||
    normalizedTitle.includes("internship");

  const programLikeTitle =
    awardLikeTitle ||
    normalizedTitle.includes("ambassador") ||
    normalizedTitle.includes("research") ||
    normalizedTitle.includes("scholars") ||
    normalizedTitle.includes("scholarships") ||
    normalizedTitle.includes("grants") ||
    normalizedTitle.includes("student") ||
    normalizedTitle.includes("undergraduate");

  const specificProgramOrScholarshipPath =
    isSpecificOpportunityUrl ||
    pathname.includes("/scholarships-and-grants") ||
    pathname.includes("/undergraduate-research") ||
    pathname.includes("/resources/undergraduate-research") ||
    pathname.includes("/program-details") ||
    pathname.includes("/welcome");

  if (
    directSignalCount >= 4 ||
    (isSpecificOpportunityUrl && awardLikeTitle && directSignalCount >= 2) ||
    (specificProgramOrScholarshipPath && programLikeTitle && directSignalCount >= 2)
  ) {
    return {
      classification: "direct_opportunity_page",
      shouldExtractDirectly: true,
      shouldExpandLinks: true,
      shouldRejectLead: false,
      reasons: ["Direct opportunity evidence found."],
    };
  }

  return {
    classification: "junk",
    shouldExtractDirectly: false,
    shouldExpandLinks: false,
    shouldRejectLead: true,
    reasons: ["Not enough evidence that this is a student-facing opportunity."],
  };
}
