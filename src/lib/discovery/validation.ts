import {
  isSupportedOpportunityType,
  type OpportunityType,
} from "@/lib/discovery/taxonomy";

export type SourceTrust = "trusted" | "standard" | "experimental" | "blocked";
export type DuplicateRisk = "low" | "medium" | "high";
export type ValidationDecision = "auto_publish" | "review" | "reject";

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
  application_url?: string | null;
  source_url?: string | null;
  effort_level?: string | null;
  reward_level?: string | null;
  competitiveness_factors?: string[] | null;
};

function hasText(value: unknown, minLength = 1) {
  return typeof value === "string" && value.trim().length >= minLength;
}

function hasArrayItems(value: unknown, minItems = 1) {
  return Array.isArray(value) && value.filter(Boolean).length >= minItems;
}

function isRollingOpportunity(opportunity: ExtractedOpportunityForValidation) {
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

export function validateExtractedOpportunity({
  opportunity,
  sourceTrust = "standard",
  duplicateRisk = "low",
}: {
  opportunity: ExtractedOpportunityForValidation;
  sourceTrust?: SourceTrust;
  duplicateRisk?: DuplicateRisk;
}) {
  const reasons: string[] = [];
  const hardBlockers: string[] = [];

  if (sourceTrust === "blocked") {
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

  if (!hasText(opportunity.deadline) && !isRollingOpportunity(opportunity)) {
    hardBlockers.push("Missing deadline or clear rolling status.");
  }

  if (!hasUsefulEligibility(opportunity)) {
    hardBlockers.push("Eligibility is unclear.");
  }

  if (duplicateRisk === "high") {
    hardBlockers.push("High duplicate risk.");
  }

  if (hardBlockers.length > 0) {
    return {
      decision: "reject" as ValidationDecision,
      score: 0,
      autoPublishEligible: false,
      duplicateRisk,
      sourceTrust,
      reasons: hardBlockers,
    };
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
  if (sourceTrust === "trusted") score += 5;
  if (sourceTrust === "standard") score += 3;
  if (sourceTrust === "experimental") score += 1;
  if (getDescriptionLength(opportunity) >= 2000) score += 4;

  score = Math.min(score, 100);

  if (duplicateRisk === "medium") {
    reasons.push("Medium duplicate risk.");
  }

  if (sourceTrust === "experimental") {
    reasons.push("Experimental source requires review.");
  }

  if (score < 70) {
    return {
      decision: "reject" as ValidationDecision,
      score,
      autoPublishEligible: false,
      duplicateRisk,
      sourceTrust,
      reasons: reasons.length ? reasons : ["Validation score below 70."],
    };
  }

  const trustedAutoPublish = sourceTrust === "trusted" && score >= 88;
  const standardAutoPublish = sourceTrust === "standard" && score >= 94;

  if (duplicateRisk === "low" && (trustedAutoPublish || standardAutoPublish)) {
    return {
      decision: "auto_publish" as ValidationDecision,
      score,
      autoPublishEligible: true,
      duplicateRisk,
      sourceTrust,
      reasons: ["Passed auto-publish validation."],
    };
  }

  return {
    decision: "review" as ValidationDecision,
    score,
    autoPublishEligible: false,
    duplicateRisk,
    sourceTrust,
    reasons: reasons.length
      ? reasons
      : ["Opportunity requires review before publishing."],
  };
}
