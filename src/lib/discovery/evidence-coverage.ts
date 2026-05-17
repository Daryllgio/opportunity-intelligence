import type { OpportunityType } from "@/lib/discovery/taxonomy";

export type EvidenceCoverage = {
  completeEnough: boolean;
  score: number;
  opportunityType: string | null;
  hasIdentity: boolean;
  hasDeadlineOrStatus: boolean;
  hasEligibility: boolean;
  hasFundingOrValue: boolean;
  hasApplicationSignal: boolean;
  hasSelectionCriteria: boolean;
  hasProgramStructure: boolean;
  missing: string[];
  signals: {
    identity: string[];
    deadlineOrStatus: string[];
    eligibility: string[];
    fundingOrValue: string[];
    application: string[];
    selectionCriteria: string[];
    programStructure: string[];
  };
};

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function findSignals(text: string, signals: string[]) {
  return signals.filter((signal) => text.includes(signal));
}

function hasMoneyPattern(text: string) {
  return /\$\s?\d{2,3}(?:,\d{3})*(?:\.\d{2})?/.test(text);
}

function hasDatePattern(text: string) {
  return (
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/i.test(
      text
    ) ||
    /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/.test(text) ||
    /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/.test(text)
  );
}

function hasStrongDeadlineOrRollingSignal(text: string) {
  const normalized = normalize(text);

  return (
    hasDatePattern(text) ||
    normalized.includes("application deadline") ||
    normalized.includes("deadline:") ||
    normalized.includes("apply by") ||
    normalized.includes("due date") ||
    normalized.includes("rolling deadline") ||
    normalized.includes("rolling basis") ||
    normalized.includes("no fixed deadline") ||
    normalized.includes("applications accepted year-round")
  );
}

const IDENTITY_SIGNALS = [
  "scholarship",
  "fellowship",
  "research program",
  "grant",
  "competition",
  "leadership program",
  "career development",
  "award",
  "program",
];

const DEADLINE_STATUS_SIGNALS = [
  "deadline",
  "apply by",
  "applications close",
  "applications closed",
  "applications are closed",
  "applications open",
  "application opens",
  "application deadline",
  "due date",
  "rolling basis",
  "rolling deadline",
  "ongoing",
  "no fixed deadline",
  "currently closed",
  "closed for applications",
];

const ELIGIBILITY_SIGNALS = [
  "eligible",
  "eligibility",
  "applicants must",
  "must be",
  "open to",
  "students must",
  "citizen",
  "permanent resident",
  "international students",
  "high school",
  "cegep",
  "undergraduate",
  "graduate",
  "phd",
  "master",
  "medical student",
  "law student",
  "mba",
  "minimum gpa",
  "minimum average",
  "r score",
];

const FUNDING_VALUE_SIGNALS = [
  "funding",
  "financial support",
  "stipend",
  "tuition",
  "tuition waiver",
  "award amount",
  "valued at",
  "worth",
  "grant amount",
  "cash prize",
  "prize",
  "fully funded",
  "scholarship amount",
  "travel support",
  "reimbursement",
];

const APPLICATION_SIGNALS = [
  "apply",
  "application",
  "application portal",
  "submit",
  "submission",
  "reference",
  "recommendation",
  "transcript",
  "essay",
  "interview",
  "nomination",
  "shortlisted",
  "finalist",
  "required documents",
];

const SELECTION_SIGNALS = [
  "selection criteria",
  "selected based on",
  "selection process",
  "criteria",
  "leadership",
  "service",
  "community service",
  "academic excellence",
  "research potential",
  "character",
  "community impact",
  "interview process",
  "judging criteria",
  "evaluation criteria",
];

const PROGRAM_STRUCTURE_SIGNALS = [
  "program",
  "cohort",
  "duration",
  "summer",
  "work placement",
  "mentorship",
  "training",
  "workshop",
  "seminar",
  "research project",
  "presentation",
  "conference",
  "four-year",
  "multi-stage",
  "leadership development",
];

function getRequiredEvidence(opportunityType?: string | null) {
  const type = opportunityType as OpportunityType | undefined;

  const base = [
    "identity",
    "deadlineOrStatus",
    "eligibility",
    "applicationSignal",
  ];

  if (type === "scholarship" || type === "grant") {
    return [...base, "fundingOrValue", "selectionCriteria"];
  }

  if (type === "research_program") {
    return [...base, "programStructure"];
  }

  if (type === "competition") {
    return [...base, "fundingOrValue", "selectionCriteria", "programStructure"];
  }

  if (type === "fellowship") {
    return [...base, "fundingOrValue", "selectionCriteria", "programStructure"];
  }

  if (type === "leadership_program" || type === "career_development_program") {
    return [...base, "selectionCriteria", "programStructure"];
  }

  return [...base, "fundingOrValue", "selectionCriteria"];
}

export function evaluateEvidenceCoverage({
  text,
  opportunityType = null,
}: {
  text: string;
  opportunityType?: string | null;
}): EvidenceCoverage {
  const normalized = normalize(text);

  const identitySignals = findSignals(normalized, IDENTITY_SIGNALS);
  const deadlineSignals = findSignals(normalized, DEADLINE_STATUS_SIGNALS);
  const eligibilitySignals = findSignals(normalized, ELIGIBILITY_SIGNALS);
  const fundingSignals = findSignals(normalized, FUNDING_VALUE_SIGNALS);
  const applicationSignals = findSignals(normalized, APPLICATION_SIGNALS);
  const selectionSignals = findSignals(normalized, SELECTION_SIGNALS);
  const programSignals = findSignals(normalized, PROGRAM_STRUCTURE_SIGNALS);

  const hasIdentity = identitySignals.length >= 1;
  const hasDeadlineOrStatus = hasStrongDeadlineOrRollingSignal(text);
  const hasEligibility = eligibilitySignals.length >= 2;
  const hasFundingOrValue = fundingSignals.length >= 1 || hasMoneyPattern(text);
  const hasApplicationSignal = applicationSignals.length >= 1;
  const hasSelectionCriteria = selectionSignals.length >= 1;
  const hasProgramStructure = programSignals.length >= 2;

  const evidenceMap: Record<string, boolean> = {
    identity: hasIdentity,
    deadlineOrStatus: hasDeadlineOrStatus,
    eligibility: hasEligibility,
    fundingOrValue: hasFundingOrValue,
    applicationSignal: hasApplicationSignal,
    selectionCriteria: hasSelectionCriteria,
    programStructure: hasProgramStructure,
  };

  const required = getRequiredEvidence(opportunityType);
  const missing = required.filter((key) => !evidenceMap[key]);

  let score = 0;
  if (hasIdentity) score += 12;
  if (hasDeadlineOrStatus) score += 18;
  if (hasEligibility) score += 18;
  if (hasFundingOrValue) score += 16;
  if (hasApplicationSignal) score += 14;
  if (hasSelectionCriteria) score += 12;
  if (hasProgramStructure) score += 10;

  const completeEnough = missing.length === 0 && score >= 78;

  return {
    completeEnough,
    score,
    opportunityType,
    hasIdentity,
    hasDeadlineOrStatus,
    hasEligibility,
    hasFundingOrValue,
    hasApplicationSignal,
    hasSelectionCriteria,
    hasProgramStructure,
    missing,
    signals: {
      identity: identitySignals,
      deadlineOrStatus: deadlineSignals,
      eligibility: eligibilitySignals,
      fundingOrValue: fundingSignals,
      application: applicationSignals,
      selectionCriteria: selectionSignals,
      programStructure: programSignals,
    },
  };
}
