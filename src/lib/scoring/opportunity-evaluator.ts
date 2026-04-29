import type { OpportunityForScoring, OpportunityPriorityAnalysis } from "./types";

function normalizeWeights(weights: Record<string, number>) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);

  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, Math.round((value / total) * 100)])
  );
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

export function evaluateOpportunityPriorities(
  opportunity: OpportunityForScoring
): OpportunityPriorityAnalysis {
  const text = [
    opportunity.title,
    opportunity.type,
    opportunity.description,
    opportunity.funding_type,
    opportunity.competitiveness_factors?.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const weights = {
    academic_weight: 15,
    research_weight: 10,
    leadership_weight: 10,
    community_impact_weight: 10,
    work_project_weight: 10,
    awards_weight: 8,
    field_alignment_weight: 20,
    institution_signal_weight: 5,
  };

  const primaryPriorities: string[] = [];
  const hiddenPriorities: string[] = [];

  if (includesAny(text, ["gpa", "academic", "merit", "grades", "transcript", "excellence"])) {
    weights.academic_weight += 20;
    primaryPriorities.push("academic excellence");
  }

  if (includesAny(text, ["research", "lab", "publication", "poster", "thesis", "scientific", "experiment"])) {
    weights.research_weight += 25;
    primaryPriorities.push("research potential");
  }

  if (includesAny(text, ["leadership", "leader", "president", "initiative", "founded", "organizer"])) {
    weights.leadership_weight += 22;
    primaryPriorities.push("leadership");
  }

  if (includesAny(text, ["community", "service", "volunteer", "underserved", "impact", "social", "nonprofit"])) {
    weights.community_impact_weight += 22;
    primaryPriorities.push("community impact");
  }

  if (includesAny(text, ["project", "startup", "innovation", "entrepreneur", "portfolio", "built", "product"])) {
    weights.work_project_weight += 22;
    primaryPriorities.push("project or innovation experience");
  }

  if (includesAny(text, ["award", "honor", "recognition", "winner", "competition", "prize"])) {
    weights.awards_weight += 15;
    primaryPriorities.push("recognition or awards");
  }

  if (includesAny(text, ["prestigious", "selective", "highly competitive", "top students", "exceptional"])) {
    weights.awards_weight += 5;
    weights.academic_weight += 5;
    weights.institution_signal_weight += 5;
    hiddenPriorities.push("high selectivity signals");
  }

  if (opportunity.type === "research") {
    weights.research_weight += 10;
  }

  if (opportunity.type === "funded_conference" || opportunity.type === "leadership_program") {
    weights.leadership_weight += 8;
    weights.community_impact_weight += 8;
  }

  if (opportunity.type === "grant") {
    weights.work_project_weight += 10;
    weights.community_impact_weight += 8;
  }

  if (opportunity.type === "competition") {
    weights.work_project_weight += 10;
    weights.awards_weight += 8;
  }

  const normalized = normalizeWeights(weights);

  return {
    academic_weight: normalized.academic_weight,
    research_weight: normalized.research_weight,
    leadership_weight: normalized.leadership_weight,
    community_impact_weight: normalized.community_impact_weight,
    work_project_weight: normalized.work_project_weight,
    awards_weight: normalized.awards_weight,
    field_alignment_weight: normalized.field_alignment_weight,
    institution_signal_weight: normalized.institution_signal_weight,
    primary_priorities:
      primaryPriorities.length > 0 ? primaryPriorities : ["general profile strength"],
    hidden_priorities: hiddenPriorities,
  };
}
