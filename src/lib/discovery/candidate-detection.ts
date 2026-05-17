import { normalizeUrl } from "@/lib/utils/url-normalizer";
import type { CapturedLink } from "@/lib/discovery/capture/cheerio-capture";

export type CandidateOpportunityLink = {
  url: string;
  normalizedUrl: string;
  linkText: string;
  score: number;
  reasons: string[];
};

const POSITIVE_URL_SIGNALS = [
  "scholarship",
  "scholarships",
  "fellowship",
  "fellowships",
  "grant",
  "grants",
  "award",
  "awards",
  "research",
  "program",
  "programs",
  "competition",
  "competitions",
  "challenge",
  "leadership",
  "career",
  "pipeline",
  "apply",
  "application",
  "eligibility",
  "student",
  "students",
];

const POSITIVE_TEXT_SIGNALS = [
  "scholarship",
  "fellowship",
  "grant",
  "award",
  "research program",
  "competition",
  "challenge",
  "leadership program",
  "career development",
  "pipeline program",
  "apply",
  "application",
  "eligibility",
  "students",
  "undergraduate",
  "graduate",
  "phd",
  "medical student",
  "law student",
  "mba",
];

const NEGATIVE_URL_SIGNALS = [
  "privacy",
  "terms",
  "cookie",
  "login",
  "signin",
  "sign-in",
  "register",
  "donate",
  "contact",
  "about",
  "staff",
  "team",
  "news",
  "blog",
  "press",
  "media",
  "events",
  "calendar",
  "wp-content",
  "cdn",
  "assets",
  "javascript:",
  "#",
];

const NEGATIVE_EXTENSIONS = [
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
];

function safeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function countSignals(text: string, signals: string[]) {
  const normalized = text.toLowerCase();

  return signals.filter((signal) => normalized.includes(signal)).length;
}

function hasNegativeExtension(pathname: string) {
  return NEGATIVE_EXTENSIONS.some((extension) =>
    pathname.toLowerCase().endsWith(extension)
  );
}

export function scoreCandidateLink(link: CapturedLink): CandidateOpportunityLink | null {
  const parsed = safeUrl(link.href);

  if (!parsed) return null;

  const normalizedUrl = normalizeUrl(link.href);
  const urlText = `${parsed.hostname} ${parsed.pathname} ${parsed.search}`.toLowerCase();
  const linkText = link.text || "";
  const normalizedLinkText = linkText.toLowerCase().trim();
  const combined = `${urlText} ${linkText}`.toLowerCase();

  if (
    parsed.hash &&
    (normalizedLinkText.includes("skip to main") ||
      normalizedLinkText.includes("skip to content"))
  ) {
    return null;
  }

  if (parsed.hash && !parsed.pathname.replace(/\/$/, "")) {
    return null;
  }

  const reasons: string[] = [];
  let score = 0;

  if (!normalizedUrl) return null;

  if (hasNegativeExtension(parsed.pathname)) {
    return null;
  }

  const negativeUrlSignalCount = countSignals(urlText, NEGATIVE_URL_SIGNALS);

  const softPathSignals = [
    "how-it-works",
    "how_it_works",
    "become",
    "becoming",
    "selection",
    "nomination",
    "the-program",
    "the_program",
  ];

  const softTextSignals = [
    "how it works",
    "become",
    "becoming",
    "selection",
    "nomination",
    "the program",
    "learn more",
  ];

  const hasSoftPathSignal = softPathSignals.some((signal) =>
    urlText.includes(signal)
  );
  const hasSoftTextSignal = softTextSignals.some((signal) =>
    linkText.toLowerCase().includes(signal)
  );

  if (negativeUrlSignalCount > 0 && !hasSoftPathSignal) {
    score -= negativeUrlSignalCount * 10;
    reasons.push("Contains weak/noisy URL signals.");
  }

  const positiveUrlSignalCount = countSignals(urlText, POSITIVE_URL_SIGNALS);
  const positiveTextSignalCount = countSignals(linkText, POSITIVE_TEXT_SIGNALS);

  if (positiveUrlSignalCount > 0) {
    score += Math.min(positiveUrlSignalCount * 10, 35);
    reasons.push("URL contains opportunity-related signals.");
  }

  if (positiveTextSignalCount > 0) {
    score += Math.min(positiveTextSignalCount * 12, 40);
    reasons.push("Link text contains opportunity-related signals.");
  }

  if (combined.includes("deadline")) {
    score += 8;
    reasons.push("Mentions deadline.");
  }

  if (combined.includes("eligibility") || combined.includes("eligible")) {
    score += 8;
    reasons.push("Mentions eligibility.");
  }

  if (combined.includes("apply") || combined.includes("application")) {
    score += 8;
    reasons.push("Mentions application/apply.");
  }

  if (hasSoftPathSignal) {
    score += 22;
    reasons.push("URL contains soft opportunity-navigation signals.");
  }

  if (hasSoftTextSignal && positiveUrlSignalCount > 0) {
    score += 10;
    reasons.push("Link text supports opportunity navigation.");
  }

  if (parsed.pathname.split("/").filter(Boolean).length >= 2) {
    score += 4;
  }

  if (linkText.length >= 8) {
    score += 4;
  }

  if (score < 18) {
    return null;
  }

  return {
    url: link.href,
    normalizedUrl,
    linkText,
    score: Math.max(0, Math.min(score, 100)),
    reasons,
  };
}

export function detectCandidateOpportunityLinks(links: CapturedLink[]) {
  const seen = new Set<string>();

  return links
    .map(scoreCandidateLink)
    .filter((candidate): candidate is CandidateOpportunityLink => Boolean(candidate))
    .filter((candidate) => {
      if (seen.has(candidate.normalizedUrl)) return false;
      seen.add(candidate.normalizedUrl);
      return true;
    })
    .sort((a, b) => b.score - a.score);
}
