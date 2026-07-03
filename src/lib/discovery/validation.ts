import {
  isSupportedOpportunityType,
  type OpportunityType,
} from "@/lib/discovery/taxonomy";
import {
  assessApplicationUrlQuality,
  assessSourceQuality,
  buildSourceReviewFlags,
  type ApplicationUrlQuality,
  type ReviewFlag,
  type SourceCategory,
} from "@/lib/discovery/source-quality";

export type SourceTrust = "trusted" | "standard" | "experimental" | "blocked";
export type DuplicateRisk = "low" | "medium" | "high";
export type ValidationDecision =
  | "auto_publish"
  | "review"
  | "reject"
  | "track_for_next_cycle";

export type ExtractedOpportunityForValidation = {
  title?: string | null;
  provider?: string | null;
  type?: string | null;
  description?: string | null;
  ai_summary?: string | null;
  country?: string | null;
  eligible_countries?: string[] | null;
  eligible_education_levels?: string[] | null;
  eligible_fields?: string[] | null;
  funding_amount?: string | null;
  funding_type?: string | null;
  deadline?: string | null;
  application_status?: "open" | "closed" | "rolling" | "unknown" | string | null;
  deadline_confidence?: "high" | "medium" | "low" | "unknown" | string | null;
  cycle_notes?: string | null;
  application_url?: string | null;
  source_url?: string | null;
  effort_level?: string | null;
  reward_level?: string | null;
  competitiveness_factors?: string[] | null;
};

type ValidationResult = {
  decision: ValidationDecision;
  score: number;
  autoPublishEligible: boolean;
  duplicateRisk: DuplicateRisk;
  sourceTrust: SourceTrust;
  sourceCategory: SourceCategory;
  applicationUrlQuality: ApplicationUrlQuality;
  reviewFlags: ReviewFlag[];
  sourceQualityReasons: string[];
  reasons: string[];
};

function hasText(value: unknown, minLength = 1) {
  return typeof value === "string" && value.trim().length >= minLength;
}

function hasArrayItems(value: unknown, minItems = 1) {
  return Array.isArray(value) && value.filter(Boolean).length >= minItems;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueReviewFlags(values: ReviewFlag[]) {
  return Array.from(new Set(values));
}

function isRollingOpportunity(opportunity: ExtractedOpportunityForValidation) {
  // The extractor sets application_status explicitly — trust it first.
  if (opportunity.application_status === "rolling") return true;

  const text = [
    opportunity.deadline,
    opportunity.description,
    opportunity.ai_summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    text.includes("rolling") ||
    text.includes("ongoing") ||
    text.includes("no fixed deadline") ||
    text.includes("applications accepted year-round")
  );
}

function isClosedOpportunity(opportunity: ExtractedOpportunityForValidation) {
  const text = [
    opportunity.application_status,
    opportunity.deadline,
    opportunity.description,
    opportunity.ai_summary,
    opportunity.cycle_notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    opportunity.application_status === "closed" ||
    text.includes("applications are closed") ||
    text.includes("applications closed") ||
    text.includes("currently closed") ||
    text.includes("closed for applications")
  );
}

function hasUsefulDeadlineOrStatus(opportunity: ExtractedOpportunityForValidation) {
  return (
    hasText(opportunity.deadline) ||
    isRollingOpportunity(opportunity) ||
    isClosedOpportunity(opportunity)
  );
}

function hasUsefulEligibility(opportunity: ExtractedOpportunityForValidation) {
  return (
    hasArrayItems(opportunity.eligible_countries) ||
    hasArrayItems(opportunity.eligible_education_levels) ||
    hasArrayItems(opportunity.eligible_fields)
  );
}

function hasUsefulFundingOrValue(opportunity: ExtractedOpportunityForValidation) {
  return (
    hasText(opportunity.funding_amount) ||
    hasText(opportunity.funding_type) ||
    hasText(opportunity.reward_level) ||
    hasText(opportunity.description, 600)
  );
}

function getDescriptionLength(opportunity: ExtractedOpportunityForValidation) {
  return [opportunity.description, opportunity.ai_summary]
    .filter(Boolean)
    .join(" ")
    .trim().length;
}

function parseDeadlineDate(value: unknown) {
  const raw = String(value || "").trim();

  if (!raw) return null;

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
}

function isPastDeadline(value: unknown) {
  const deadline = parseDeadlineDate(value);

  if (!deadline) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadlineDay = new Date(
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate()
  );

  return deadlineDay < today;
}

function buildValidationResult({
  decision,
  score,
  autoPublishEligible,
  duplicateRisk,
  sourceTrust,
  sourceCategory,
  applicationUrlQuality,
  reviewFlags,
  sourceQualityReasons,
  reasons,
}: ValidationResult): ValidationResult {
  return {
    decision,
    score,
    autoPublishEligible,
    duplicateRisk,
    sourceTrust,
    sourceCategory,
    applicationUrlQuality,
    reviewFlags: uniqueReviewFlags(reviewFlags),
    sourceQualityReasons: uniqueStrings(sourceQualityReasons),
    reasons: uniqueStrings(reasons),
  };
}

export function validateExtractedOpportunity({
  opportunity,
  sourceTrust = "standard",
  duplicateRisk = "low",
}: {
  opportunity: ExtractedOpportunityForValidation;
  sourceTrust?: SourceTrust;
  duplicateRisk?: DuplicateRisk;
}): ValidationResult {
  const sourceQuality = assessSourceQuality(
    opportunity.source_url || opportunity.application_url
  );

  const effectiveSourceTrust: SourceTrust =
    sourceTrust === "blocked" || sourceQuality.trust === "blocked"
      ? "blocked"
      : sourceQuality.trust || sourceTrust;

  const applicationUrlQuality = assessApplicationUrlQuality({
    applicationUrl: opportunity.application_url,
    sourceUrl: opportunity.source_url,
  });

  const reviewFlags = buildSourceReviewFlags({
    sourceQuality,
    applicationUrlQuality,
    duplicateRisk,
    provider: opportunity.provider,
    deadlineConfidence: opportunity.deadline_confidence,
  });

  const reasons: string[] = [];
  const hardBlockers: string[] = [];

  if (effectiveSourceTrust === "blocked") {
    hardBlockers.push("Source is blocked.");
  }

  if (!hasText(opportunity.title, 4)) {
    hardBlockers.push("Missing or weak title.");
  }

  if (!hasText(opportunity.provider, 2)) {
    hardBlockers.push("Missing provider.");
  }

  if (!opportunity.type || !isSupportedOpportunityType(opportunity.type)) {
    hardBlockers.push("Unsupported or missing opportunity type.");
  }

  if (!hasText(opportunity.source_url) && !hasText(opportunity.application_url)) {
    hardBlockers.push("Missing source/application URL.");
  }

  if (!hasUsefulDeadlineOrStatus(opportunity)) {
    hardBlockers.push("Missing deadline or clear application status.");
  }

  if (!hasUsefulEligibility(opportunity)) {
    hardBlockers.push("Eligibility is unclear.");
  }

  if (duplicateRisk === "high") {
    hardBlockers.push("High duplicate risk.");
  }

  const closedButReal =
    isClosedOpportunity(opportunity) &&
    hasText(opportunity.title, 4) &&
    hasText(opportunity.provider, 2) &&
    Boolean(opportunity.type) &&
    hasUsefulEligibility(opportunity) &&
    hasUsefulFundingOrValue(opportunity);

  if (
    closedButReal &&
    duplicateRisk !== "high" &&
    effectiveSourceTrust !== "blocked"
  ) {
    return buildValidationResult({
      decision: "track_for_next_cycle",
      score: 75,
      autoPublishEligible: false,
      duplicateRisk,
      sourceTrust: effectiveSourceTrust,
      sourceCategory: sourceQuality.category,
      applicationUrlQuality,
      reviewFlags: [...reviewFlags, "closed_opportunity"],
      sourceQualityReasons: sourceQuality.reasons,
      reasons: [
        "Applications are closed. Track for next cycle instead of publishing live.",
      ],
    });
  }

  if (isPastDeadline(opportunity.deadline)) {
    return buildValidationResult({
      decision: "track_for_next_cycle",
      score: 75,
      autoPublishEligible: false,
      duplicateRisk,
      sourceTrust: effectiveSourceTrust,
      sourceCategory: sourceQuality.category,
      applicationUrlQuality,
      reviewFlags: [...reviewFlags, "closed_opportunity"],
      sourceQualityReasons: sourceQuality.reasons,
      reasons: [
        "Deadline has passed. Track for next cycle instead of publishing live.",
      ],
    });
  }

  if (hardBlockers.length > 0) {
    return buildValidationResult({
      decision: "reject",
      score: 0,
      autoPublishEligible: false,
      duplicateRisk,
      sourceTrust: effectiveSourceTrust,
      sourceCategory: sourceQuality.category,
      applicationUrlQuality,
      reviewFlags,
      sourceQualityReasons: sourceQuality.reasons,
      reasons: hardBlockers,
    });
  }

  let score = 0;

  // Identity fields: 20
  if (hasText(opportunity.title, 4)) score += 5;
  if (hasText(opportunity.provider, 2)) score += 5;
  if (
    opportunity.type &&
    isSupportedOpportunityType(opportunity.type as OpportunityType)
  ) {
    score += 5;
  }
  if (hasText(opportunity.source_url) || hasText(opportunity.application_url)) {
    score += 5;
  }

  // Deadline/cycle clarity: 15
  if (hasText(opportunity.deadline)) score += 10;
  else if (isRollingOpportunity(opportunity)) score += 8;
  if (hasText(opportunity.country)) score += 5;

  // Eligibility clarity: 20
  if (hasArrayItems(opportunity.eligible_education_levels)) score += 6;
  if (hasArrayItems(opportunity.eligible_countries)) score += 5;
  if (hasArrayItems(opportunity.eligible_fields)) score += 5;
  if (hasUsefulEligibility(opportunity)) score += 4;

  // Value clarity: 15
  if (hasText(opportunity.funding_amount)) score += 6;
  if (hasText(opportunity.funding_type)) score += 4;
  if (hasText(opportunity.reward_level)) score += 2;
  if (getDescriptionLength(opportunity) >= 600) score += 3;

  // Selection/application clarity: 15
  if (hasArrayItems(opportunity.competitiveness_factors, 2)) score += 8;
  if (hasText(opportunity.effort_level)) score += 3;
  if (getDescriptionLength(opportunity) >= 1200) score += 4;

  // Safety/source quality: 15
  if (duplicateRisk === "low") score += 6;
  if (duplicateRisk === "medium") score += 2;

  if (effectiveSourceTrust === "trusted") score += 5;
  if (effectiveSourceTrust === "standard") score += 3;
  if (effectiveSourceTrust === "experimental") score += 1;

  if (sourceQuality.isOfficialLeaning) score += 2;
  if (sourceQuality.isAggregator) score -= 8;

  if (applicationUrlQuality === "official_application") score += 3;
  if (applicationUrlQuality === "third_party_application_portal") score += 2;
  if (applicationUrlQuality === "aggregator_application") score -= 6;
  if (
    applicationUrlQuality === "same_as_source" &&
    sourceQuality.isAggregator
  ) {
    score -= 6;
  }
  if (applicationUrlQuality === "missing_application") score -= 8;

  if (getDescriptionLength(opportunity) >= 2000) score += 4;

  score = Math.max(0, Math.min(score, 100));

  if (duplicateRisk === "medium") {
    reasons.push("Medium duplicate risk.");
  }

  if (effectiveSourceTrust === "experimental") {
    reasons.push("Experimental source requires review.");
  }

  if (sourceQuality.isAggregator) {
    reasons.push("Aggregator source requires review before publishing.");
  }

  if (sourceQuality.category === "low_trust_blog") {
    reasons.push("Low-trust source requires review.");
  }

  if (sourceQuality.category === "unknown") {
    reasons.push("Unknown source category requires review.");
  }

  if (applicationUrlQuality === "aggregator_application") {
    reasons.push("Application appears to be hosted by an aggregator.");
  }

  if (
    applicationUrlQuality === "same_as_source" &&
    sourceQuality.isAggregator
  ) {
    reasons.push("Application URL is the same as an aggregator source page.");
  }

  if (applicationUrlQuality === "missing_application") {
    reasons.push("Missing application URL.");
  }

  if (applicationUrlQuality === "unknown_application") {
    reasons.push("Application URL quality is unknown.");
  }

  if (opportunity.deadline_confidence === "low") {
    reasons.push("Low confidence deadline.");
  }

  if (score < 70) {
    return buildValidationResult({
      decision: "reject",
      score,
      autoPublishEligible: false,
      duplicateRisk,
      sourceTrust: effectiveSourceTrust,
      sourceCategory: sourceQuality.category,
      applicationUrlQuality,
      reviewFlags,
      sourceQualityReasons: sourceQuality.reasons,
      reasons: reasons.length ? reasons : ["Validation score below 70."],
    });
  }

  const needsSourceReview =
    sourceQuality.isAggregator ||
    sourceQuality.category === "low_trust_blog" ||
    sourceQuality.category === "unknown" ||
    applicationUrlQuality === "aggregator_application" ||
    applicationUrlQuality === "missing_application" ||
    applicationUrlQuality === "unknown_application" ||
    (applicationUrlQuality === "same_as_source" && sourceQuality.isAggregator);

  // Calibration note: these thresholds are deliberately achievable. The final
  // safety gate lives in ingest — nothing goes live without a high/medium
  // confidence, non-aggregator applicant destination from the ranker. With
  // that backstop, validation only needs to prove the extraction itself is
  // complete and from a source we trust.
  const trustedAutoPublish =
    effectiveSourceTrust === "trusted" && score >= 78 && !needsSourceReview;

  const standardAutoPublish =
    effectiveSourceTrust === "standard" &&
    score >= 84 &&
    sourceQuality.isOfficialLeaning &&
    !needsSourceReview;

  if (duplicateRisk === "low" && (trustedAutoPublish || standardAutoPublish)) {
    return buildValidationResult({
      decision: "auto_publish",
      score,
      autoPublishEligible: true,
      duplicateRisk,
      sourceTrust: effectiveSourceTrust,
      sourceCategory: sourceQuality.category,
      applicationUrlQuality,
      reviewFlags,
      sourceQualityReasons: sourceQuality.reasons,
      reasons: ["Passed auto-publish validation."],
    });
  }

  return buildValidationResult({
    decision: "review",
    score,
    autoPublishEligible: false,
    duplicateRisk,
    sourceTrust: effectiveSourceTrust,
    sourceCategory: sourceQuality.category,
    applicationUrlQuality,
    reviewFlags,
    sourceQualityReasons: sourceQuality.reasons,
    reasons: reasons.length
      ? reasons
      : ["Opportunity requires review before publishing."],
  });
}
