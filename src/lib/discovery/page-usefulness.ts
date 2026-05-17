import { evaluateEvidenceCoverage } from "@/lib/discovery/evidence-coverage";

export type PageUsefulness = {
  score: number;
  reasons: string[];
  shouldIgnore: boolean;
};

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const HIGH_VALUE_PATH_SIGNALS = [
  "how-to-apply",
  "apply",
  "application",
  "eligibility",
  "requirements",
  "faq",
  "frequently-asked-questions",
  "selection",
  "deadline",
  "award",
  "funding",
  "program",
  "how-it-works",
];

const LOW_VALUE_PATH_SIGNALS = [
  "privacy",
  "terms",
  "cookie",
  "donate",
  "staff",
  "team",
  "news",
  "blog",
  "press",
  "media",
  "annual-report",
  "annual-reports",
  "alumni-stories",
  "scholar-stories",
  "remembering",
];

const BAD_TITLE_SIGNALS = [
  "skip to main content",
  "skip to content",
  "home",
  "privacy policy",
  "terms of use",
];

export function scorePageUsefulness({
  title,
  url,
  text,
  opportunityType,
  existingQualityScore = 0,
}: {
  title?: string | null;
  url?: string | null;
  text?: string;
  opportunityType?: string | null;
  existingQualityScore?: number | null;
}): PageUsefulness {
  const normalizedTitle = normalize(title);
  const normalizedUrl = normalize(url);
  const combined = `${normalizedTitle} ${normalizedUrl}`;

  const reasons: string[] = [];
  let score = Math.min(Number(existingQualityScore || 0), 40);

  if (
    BAD_TITLE_SIGNALS.some((signal) => normalizedTitle.includes(signal)) &&
    !HIGH_VALUE_PATH_SIGNALS.some((signal) => normalizedUrl.includes(signal))
  ) {
    return {
      score: 0,
      reasons: ["Ignored weak/navigation title."],
      shouldIgnore: true,
    };
  }

  for (const signal of HIGH_VALUE_PATH_SIGNALS) {
    if (combined.includes(signal)) {
      score += 12;
      reasons.push(`High-value page signal: ${signal}`);
    }
  }

  for (const signal of LOW_VALUE_PATH_SIGNALS) {
    if (combined.includes(signal)) {
      score -= 18;
      reasons.push(`Low-value page signal: ${signal}`);
    }
  }

  if (text && text.length >= 1000) {
    const coverage = evaluateEvidenceCoverage({
      text,
      opportunityType,
    });

    score += Math.round(coverage.score * 0.45);

    if (coverage.hasDeadlineOrStatus) {
      score += 8;
      reasons.push("Contains deadline/status evidence.");
    }

    if (coverage.hasEligibility) {
      score += 8;
      reasons.push("Contains eligibility evidence.");
    }

    if (coverage.hasFundingOrValue) {
      score += 8;
      reasons.push("Contains funding/value evidence.");
    }

    if (coverage.hasApplicationSignal) {
      score += 8;
      reasons.push("Contains application evidence.");
    }

    if (coverage.hasSelectionCriteria) {
      score += 6;
      reasons.push("Contains selection criteria evidence.");
    }
  }

  return {
    score: Math.max(0, Math.min(score, 100)),
    reasons,
    shouldIgnore: score < 8,
  };
}
