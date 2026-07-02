import {
  SEARCH_AND_APP_STORE_DOMAINS,
  SOCIAL_MEDIA_DOMAINS,
} from "@/lib/discovery/domain-policy";

export function normalizeDiscoveryText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeParseUrl(value: unknown) {
  try {
    return new URL(String(value || ""));
  } catch {
    return null;
  }
}

export function hasAnySignal(text: string, signals: string[]) {
  const normalized = normalizeDiscoveryText(text);
  return signals.some((signal) => normalized.includes(signal));
}

export function countSignals(text: string, signals: string[]) {
  const normalized = normalizeDiscoveryText(text);
  return signals.filter((signal) => normalized.includes(signal)).length;
}

// Canonical lists live in domain-policy; link expansion blocks both groups.
export const BLOCKED_EXPANSION_DOMAINS = [
  ...SOCIAL_MEDIA_DOMAINS,
  ...SEARCH_AND_APP_STORE_DOMAINS,
].filter((domain) => !["google.com", "bing.com", "duckduckgo.com", "search.yahoo.com"].includes(domain));

export const BLOCKED_URL_SIGNALS = [
  "/privacy",
  "/terms",
  "/cookie",
  "/login",
  "/signin",
  "/sign-in",
  "/register",
  "/donate",
  "/contact",
  "/about",
  "/staff",
  "/team",
  "/news",
  "/blog",
  "/press",
  "/media",
  "/events",
  "/calendar",
  "/student-resources",
  "/scholarship-providers-resources",
  "/list-your-scholarship",
  "/success-stories",
  "/scholarship-winners",
  "/winner",
  "/winners",
  "/awardees",
  "/honorees",
  "/previous-awards",
  "/alumni",
  "/category/internships",
  "/internships",
  "/jobs",
  "/careers",
  "/career-tools",
  "/student_jobs",
  "/easy.php",
  "/essay.php",
  "/foundations",
  "/scholarship-upload",
  "/wp-content",
  "/cdn",
  "/assets",
];

export const BLOCKED_DOCUMENT_OR_FORM_SIGNALS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".svg",
  ".webp",
  ".css",
  ".js",
  ".ico",
  ".zip",
  ".mp4",
  ".mov",
  ".mp3",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  "box.com/s/",
  "app.box.com/s/",
  "forms.office.com",
  "google.com/forms",
];

export const LISTING_OR_RESOURCE_SIGNALS = [
  "resource guide",
  "scholarship guide",
  "list of scholarships",
  "scholarship list",
  "top scholarships",
  "all scholarships",
  "scholarship directory",
  "opportunity database",
  "program database",
  "research opportunities database",
  "student resources",
  "application strategies",
  "how to apply",
  "browse scholarships",
  "search scholarships",
  "find scholarships",
  "filter results",
  "sort by",
  "results found",
  "featured scholarships",
  "related opportunities",
];

export const ALLOWED_OPPORTUNITY_TEXT_SIGNALS = [
  "scholarship",
  "fellowship",
  "grant",
  "bursary",
  "award",
  "research program",
  "research opportunity",
  "undergraduate research",
  "summer research",
  "leadership program",
  "career development program",
  "competition",
  "challenge",
  "case competition",
  "pitch competition",
  "hackathon",
  "stipend",
  "tuition",
  "funding",
  "financial aid",
  "eligible applicants",
  "application deadline",
];

export const SPECIFIC_OPPORTUNITY_EVIDENCE_SIGNALS = [
  "eligibility",
  "eligible",
  "deadline",
  "application deadline",
  "apply by",
  "applications open",
  "application requirements",
  "requirements",
  "award amount",
  "scholarship amount",
  "grant amount",
  "stipend",
  "tuition",
  "funding",
  "must be",
  "applicants must",
  "students must",
  "letter of recommendation",
  "recommendation",
  "transcript",
  "essay",
  "gpa",
  "submit",
  "application form",
];

export const SPECIFIC_OPPORTUNITY_URL_PATTERNS = [
  /\/scholarships\/[^/?#]+\/?(?:[?#].*)?$/,
  /\/scholarship\/[^/?#]+\/?(?:[?#].*)?$/,
  /\/scholarships-awards\/[^/?#]+\/?(?:[?#].*)?$/,
  /\/fellowships\/[^/?#]+\/?(?:[?#].*)?$/,
  /\/fellowship\/[^/?#]+\/?(?:[?#].*)?$/,
  /\/grants\/[^/?#]+\/?(?:[?#].*)?$/,
  /\/grant\/[^/?#]+\/?(?:[?#].*)?$/,
  /\/awards\/[^/?#]+\/?(?:[?#].*)?$/,
  /\/award\/[^/?#]+\/?(?:[?#].*)?$/,
  /\/competitions\/[^/?#]+\/?(?:[?#].*)?$/,
  /\/competition\/[^/?#]+\/?(?:[?#].*)?$/,
  /\/programs\/[^/?#]+\/?(?:[?#].*)?$/,
  /\/program\/[^/?#]+\/?(?:[?#].*)?$/,
];

export function isBlockedDomain(url: unknown) {
  const parsed = safeParseUrl(url);
  if (!parsed) return true;

  const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();

  return BLOCKED_EXPANSION_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

export function hasBlockedUrlSignal(url: unknown) {
  const text = normalizeDiscoveryText(url);
  return BLOCKED_URL_SIGNALS.some((signal) => text.includes(signal));
}

export function hasBlockedDocumentOrFormSignal(url: unknown) {
  const text = normalizeDiscoveryText(url);
  return BLOCKED_DOCUMENT_OR_FORM_SIGNALS.some((signal) =>
    text.includes(signal)
  );
}

export function looksLikeSpecificOpportunityUrl(url: unknown) {
  const parsed = safeParseUrl(url);
  if (!parsed) return false;

  const normalizedUrl = `${parsed.hostname}${parsed.pathname}`.toLowerCase();

  return SPECIFIC_OPPORTUNITY_URL_PATTERNS.some((pattern) =>
    pattern.test(normalizedUrl)
  );
}

export function looksLikeListingOrResourcePage({
  title,
  url,
  text,
}: {
  title?: unknown;
  url?: unknown;
  text?: unknown;
}) {
  const combined = normalizeDiscoveryText(`${title || ""} ${url || ""} ${text || ""}`);
  return hasAnySignal(combined, LISTING_OR_RESOURCE_SIGNALS);
}

export function hasSpecificOpportunityEvidence({
  title,
  url,
  text,
}: {
  title?: unknown;
  url?: unknown;
  text?: unknown;
}) {
  const combined = normalizeDiscoveryText(`${title || ""} ${url || ""} ${text || ""}`);
  const evidenceCount = countSignals(combined, SPECIFIC_OPPORTUNITY_EVIDENCE_SIGNALS);

  return evidenceCount >= 3 || looksLikeSpecificOpportunityUrl(url);
}

export function shouldRejectUrlBeforeQueue(url: unknown) {
  if (!url) return { reject: true, reason: "Missing URL." };

  if (isBlockedDomain(url)) {
    return { reject: true, reason: "Blocked domain." };
  }

  if (hasBlockedUrlSignal(url)) {
    return { reject: true, reason: "Blocked URL signal." };
  }

  if (hasBlockedDocumentOrFormSignal(url)) {
    return { reject: true, reason: "Blocked document/form/media URL." };
  }

  return { reject: false, reason: null };
}
