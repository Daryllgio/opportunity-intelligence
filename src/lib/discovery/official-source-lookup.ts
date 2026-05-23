import { getDomain } from "@/lib/discovery/source-quality";

export type OfficialSourceConfidence = "high" | "medium" | "low" | "none";

export type OfficialSourceLookupInput = {
  title?: string | null;
  provider?: string | null;
  type?: string | null;
  sourceUrl?: string | null;
};

export type OfficialSourceCandidate = {
  url: string;
  title?: string | null;
  snippet?: string | null;
  domain: string | null;
  confidence: Exclude<OfficialSourceConfidence, "none">;
  reasons: string[];
};

export type OfficialSourceLookupResult = {
  officialSourceUrl: string | null;
  officialApplicationUrl: string | null;
  confidence: OfficialSourceConfidence;
  candidates: OfficialSourceCandidate[];
  reasons: string[];
};

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlap(left: string | null | undefined, right: string | null | undefined) {
  const leftTokens = new Set(normalizeText(left).split(" ").filter((token) => token.length >= 3));
  const rightTokens = new Set(normalizeText(right).split(" ").filter((token) => token.length >= 3));

  if (!leftTokens.size || !rightTokens.size) return 0;

  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token));
  return intersection.length / Math.min(leftTokens.size, rightTokens.size);
}

function isLikelyAggregatorOrSearchResult(url: string) {
  const domain = getDomain(url);

  if (!domain) return true;

  return [
    "scholarships.com",
    "studentscholarships.org",
    "scholarshiproar.com",
    "accessscholarships.com",
    "scholarships360.org",
    "google.com",
    "bing.com",
    "facebook.com",
    "linkedin.com",
    "reddit.com",
  ].some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

export function scoreOfficialSourceCandidate({
  input,
  candidate,
}: {
  input: OfficialSourceLookupInput;
  candidate: {
    url: string;
    title?: string | null;
    snippet?: string | null;
  };
}): OfficialSourceCandidate | null {
  if (!candidate.url || isLikelyAggregatorOrSearchResult(candidate.url)) {
    return null;
  }

  const domain = getDomain(candidate.url);
  const candidateText = [candidate.title, candidate.snippet, candidate.url].filter(Boolean).join(" ");

  const titleOverlap = tokenOverlap(input.title, candidateText);
  const providerOverlap = tokenOverlap(input.provider, candidateText);

  const reasons: string[] = [];

  if (titleOverlap >= 0.6) reasons.push("Candidate strongly matches opportunity title.");
  else if (titleOverlap >= 0.35) reasons.push("Candidate partially matches opportunity title.");

  if (providerOverlap >= 0.5) reasons.push("Candidate strongly matches provider.");
  else if (providerOverlap >= 0.3) reasons.push("Candidate partially matches provider.");

  const officialSignals = [
    ".org",
    ".edu",
    ".gov",
    ".ca",
    "foundation",
    "fund",
    "scholarship",
    "award",
    "application",
  ];

  const hasOfficialSignal = officialSignals.some((signal) =>
    candidate.url.toLowerCase().includes(signal)
  );

  if (hasOfficialSignal) {
    reasons.push("Candidate URL has official/provider/application signals.");
  }

  let confidence: OfficialSourceCandidate["confidence"] | null = null;

  if (titleOverlap >= 0.6 && (providerOverlap >= 0.35 || hasOfficialSignal)) {
    confidence = "high";
  } else if (titleOverlap >= 0.35 && (providerOverlap >= 0.25 || hasOfficialSignal)) {
    confidence = "medium";
  } else if (titleOverlap >= 0.25 || providerOverlap >= 0.35) {
    confidence = "low";
  }

  if (!confidence) return null;

  return {
    url: candidate.url,
    title: candidate.title || null,
    snippet: candidate.snippet || null,
    domain,
    confidence,
    reasons,
  };
}

export function buildOfficialSourceSearchQueries(input: OfficialSourceLookupInput) {
  const title = String(input.title || "").trim();
  const provider = String(input.provider || "").trim();

  const queries: string[] = [];

  if (title && provider) {
    queries.push(`"${title}" "${provider}"`);
    queries.push(`"${title}" "${provider}" application`);
  }

  if (title) {
    queries.push(`"${title}" official application`);
  }

  if (provider && title) {
    queries.push(`site:${provider.toLowerCase().replace(/[^a-z0-9]+/g, "")}.org "${title}"`);
  }

  return Array.from(new Set(queries)).slice(0, 4);
}

export function emptyOfficialSourceLookupResult(reason: string): OfficialSourceLookupResult {
  return {
    officialSourceUrl: null,
    officialApplicationUrl: null,
    confidence: "none",
    candidates: [],
    reasons: [reason],
  };
}
