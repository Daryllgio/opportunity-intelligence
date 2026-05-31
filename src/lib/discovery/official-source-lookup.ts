import { capturePageWithHybrid } from "@/lib/discovery/capture/hybrid-capture";
import {
  assessProviderSourceRelationship,
  detectAggregatorBehavior,
  getDomain,
  isKnownAggregatorDomain,
} from "@/lib/discovery/source-quality";
import { searchDiscoveryWeb } from "@/lib/discovery/search/search-provider";

export type OfficialSourceConfidence = "high" | "medium" | "low" | "none";

export type OfficialSourceLookupInput = {
  title?: string | null;
  provider?: string | null;
  type?: string | null;
  sourceUrl?: string | null;
  deadline?: string | null;
};

export type OfficialSourceCandidate = {
  url: string;
  title?: string | null;
  snippet?: string | null;
  domain: string | null;
  confidence: Exclude<OfficialSourceConfidence, "none">;
  reasons: string[];
};

export type OfficialSourceVerification = {
  verified: boolean;
  confidence: OfficialSourceConfidence;
  reasons: string[];
  evidence: {
    titleMatched: boolean;
    providerMatched: boolean;
    deadlineMatched: boolean;
    opportunitySignalFound: boolean;
    applicationSignalFound: boolean;
    pageTextLength: number;
    captureMethod: "cheerio" | "playwright" | null;
  };
};

export type OfficialSourceLookupResult = {
  officialSourceUrl: string | null;
  officialApplicationUrl: string | null;
  officialSourceVerified: boolean;
  confidence: OfficialSourceConfidence;
  candidates: OfficialSourceCandidate[];
  verification: OfficialSourceVerification | null;
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
  const leftTokens = new Set(
    normalizeText(left)
      .split(" ")
      .filter((token) => token.length >= 3)
  );

  const rightTokens = new Set(
    normalizeText(right)
      .split(" ")
      .filter((token) => token.length >= 3)
  );

  if (!leftTokens.size || !rightTokens.size) return 0;

  const intersection = Array.from(leftTokens).filter((token) =>
    rightTokens.has(token)
  );

  return intersection.length / Math.min(leftTokens.size, rightTokens.size);
}

function confidenceRank(confidence: OfficialSourceConfidence) {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  if (confidence === "low") return 1;
  return 0;
}

function isLikelyAggregatorOrSearchResult(url: string) {
  const domain = getDomain(url);

  if (!domain) return true;

  if (isKnownAggregatorDomain(domain)) return true;

  return [
    "google.com",
    "bing.com",
    "facebook.com",
    "linkedin.com",
    "reddit.com",
  ].some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

function hasAnySignal(text: string, signals: string[]) {
  const normalized = normalizeText(text);
  return signals.some((signal) => normalized.includes(normalizeText(signal)));
}

function deadlineAppearsInText(deadline: string | null | undefined, text: string) {
  if (!deadline) return false;

  const raw = String(deadline).trim();
  if (!raw) return false;

  const normalizedText = normalizeText(text);

  if (normalizedText.includes(normalizeText(raw))) {
    return true;
  }

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
  const candidateText = [candidate.title, candidate.snippet, candidate.url]
    .filter(Boolean)
    .join(" ");

  const aggregatorBehavior = detectAggregatorBehavior({
    url: candidate.url,
    title: candidate.title,
    text: candidate.snippet,
    provider: input.provider,
  });

  if (aggregatorBehavior.isAggregatorLike) {
    return null;
  }

  const providerRelationship = assessProviderSourceRelationship({
    provider: input.provider,
    url: candidate.url,
    pageText: candidateText,
  });

  const titleOverlap = tokenOverlap(input.title, candidateText);
  const providerOverlap = tokenOverlap(input.provider, candidateText);

  const reasons: string[] = [];

  if (titleOverlap >= 0.6) {
    reasons.push("Candidate strongly matches opportunity title.");
  } else if (titleOverlap >= 0.35) {
    reasons.push("Candidate partially matches opportunity title.");
  }

  if (providerOverlap >= 0.5) {
    reasons.push("Candidate strongly matches provider.");
  } else if (providerOverlap >= 0.3) {
    reasons.push("Candidate partially matches provider.");
  }

  if (providerRelationship.isProviderAligned) {
    reasons.push("Candidate domain/page appears aligned with provider.");
  }

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
    "apply",
  ];

  const hasOfficialSignal = officialSignals.some((signal) =>
    candidate.url.toLowerCase().includes(signal)
  );

  if (hasOfficialSignal) {
    reasons.push("Candidate URL has official/provider/application signals.");
  }

  let confidence: OfficialSourceCandidate["confidence"] | null = null;

  if (
    titleOverlap >= 0.6 &&
    (providerOverlap >= 0.35 || providerRelationship.isProviderAligned) &&
    hasOfficialSignal
  ) {
    confidence = "high";
  } else if (
    titleOverlap >= 0.35 &&
    (providerOverlap >= 0.25 || providerRelationship.isProviderAligned || hasOfficialSignal)
  ) {
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
    queries.push(`"${title}" scholarship application`);
  }

  return Array.from(new Set(queries)).slice(0, 4);
}

export function emptyOfficialSourceLookupResult(
  reason: string
): OfficialSourceLookupResult {
  return {
    officialSourceUrl: null,
    officialApplicationUrl: null,
    officialSourceVerified: false,
    confidence: "none",
    candidates: [],
    verification: null,
    reasons: [reason],
  };
}

async function verifyOfficialSourceCandidate({
  input,
  candidate,
}: {
  input: OfficialSourceLookupInput;
  candidate: OfficialSourceCandidate;
}): Promise<OfficialSourceVerification> {
  const capture = await capturePageWithHybrid(candidate.url);
  const finalResult = capture.finalResult;
  const pageText = String(finalResult.cleanText || "");
  const combinedText = [
    candidate.title,
    candidate.snippet,
    candidate.url,
    pageText.slice(0, 15000),
  ]
    .filter(Boolean)
    .join(" ");

  const aggregatorBehavior = detectAggregatorBehavior({
    url: candidate.url,
    title: candidate.title,
    text: combinedText,
    provider: input.provider,
  });

  const providerRelationship = assessProviderSourceRelationship({
    provider: input.provider,
    url: candidate.url,
    pageText: combinedText,
  });

  const titleOverlap = tokenOverlap(input.title, combinedText);
  const providerOverlap = tokenOverlap(input.provider, combinedText);

  const titleMatched = titleOverlap >= 0.45;
  const providerMatched = providerOverlap >= 0.3;
  const deadlineMatched = deadlineAppearsInText(input.deadline, combinedText);

  const opportunitySignalFound = hasAnySignal(combinedText, [
    "scholarship",
    "fellowship",
    "grant",
    "award",
    "research program",
    "summer program",
    "leadership program",
    "competition",
  ]);

  const applicationSignalFound = hasAnySignal(combinedText, [
    "apply",
    "application",
    "deadline",
    "eligibility",
    "requirements",
    "submit",
  ]);

  const reasons: string[] = [];

  if (!finalResult.ok) {
    reasons.push("Official source candidate could not be captured cleanly.");
  }

  if (aggregatorBehavior.isAggregatorLike) {
    reasons.push("Captured candidate behaves like an aggregator/database page.");
  }

  if (providerRelationship.isProviderAligned) {
    reasons.push("Captured candidate appears provider-aligned.");
  }

  if (titleMatched) reasons.push("Captured page matches opportunity title.");
  if (providerMatched) reasons.push("Captured page matches provider.");
  if (deadlineMatched) reasons.push("Captured page contains matching deadline.");
  if (opportunitySignalFound) reasons.push("Captured page contains opportunity signals.");
  if (applicationSignalFound) reasons.push("Captured page contains application signals.");

  let confidence: OfficialSourceConfidence = "none";

  if (
    finalResult.ok &&
    !aggregatorBehavior.isAggregatorLike &&
    titleMatched &&
    (providerMatched || providerRelationship.isProviderAligned || deadlineMatched) &&
    opportunitySignalFound &&
    applicationSignalFound
  ) {
    confidence = "high";
  } else if (
    finalResult.ok &&
    !aggregatorBehavior.isAggregatorLike &&
    titleMatched &&
    (providerMatched || providerRelationship.isProviderAligned) &&
    opportunitySignalFound &&
    applicationSignalFound
  ) {
    confidence = "medium";
  } else if (
    finalResult.ok &&
    !aggregatorBehavior.isAggregatorLike &&
    (titleMatched || providerMatched || providerRelationship.isProviderAligned) &&
    (opportunitySignalFound || applicationSignalFound)
  ) {
    confidence = "low";
  }

  return {
    verified: confidence === "high" || confidence === "medium",
    confidence,
    reasons: reasons.length ? reasons : ["Official source candidate did not verify."],
    evidence: {
      titleMatched,
      providerMatched,
      deadlineMatched,
      opportunitySignalFound,
      applicationSignalFound,
      pageTextLength: pageText.length,
      captureMethod: capture.captureMethod,
    },
  };
}

export async function lookupOfficialSource(
  input: OfficialSourceLookupInput
): Promise<OfficialSourceLookupResult> {
  if (!input.title || !input.provider) {
    return emptyOfficialSourceLookupResult(
      "Missing title or provider; cannot search for official source safely."
    );
  }

  const queries = buildOfficialSourceSearchQueries(input);
  const candidatesByUrl = new Map<string, OfficialSourceCandidate>();

  for (const query of queries) {
    const results = await searchDiscoveryWeb({
      query,
      maxResults: 6,
    });

    for (const result of results) {
      const scored = scoreOfficialSourceCandidate({
        input,
        candidate: result,
      });

      if (!scored) continue;

      const key = scored.url.replace(/#.*$/, "").replace(/\/$/, "");
      const existing = candidatesByUrl.get(key);

      if (
        !existing ||
        confidenceRank(scored.confidence) > confidenceRank(existing.confidence)
      ) {
        candidatesByUrl.set(key, scored);
      }
    }
  }

  const candidates = Array.from(candidatesByUrl.values()).sort((left, right) => {
    const confidenceDelta =
      confidenceRank(right.confidence) - confidenceRank(left.confidence);

    if (confidenceDelta !== 0) return confidenceDelta;

    return right.reasons.length - left.reasons.length;
  });

  const candidatesToVerify = candidates.slice(0, 2);

  for (const candidate of candidatesToVerify) {
    const verification = await verifyOfficialSourceCandidate({
      input,
      candidate,
    });

    if (verification.verified) {
      return {
        officialSourceUrl: candidate.url,
        officialApplicationUrl: candidate.url,
        officialSourceVerified: true,
        confidence: verification.confidence,
        candidates,
        verification,
        reasons: [
          `Official source verified with ${verification.confidence} confidence.`,
          ...candidate.reasons,
          ...verification.reasons,
        ],
      };
    }
  }

  const best = candidates[0];

  if (!best) {
    return emptyOfficialSourceLookupResult(
      "No likely official source candidate found."
    );
  }

  return {
    officialSourceUrl: best.url,
    officialApplicationUrl: best.url,
    officialSourceVerified: false,
    confidence: best.confidence,
    candidates,
    verification: null,
    reasons: [
      `Official source candidate found with ${best.confidence} confidence, but it was not automatically verified.`,
      ...best.reasons,
    ],
  };
}
