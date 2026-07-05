import { evaluateEligibility } from "@/lib/matching/eligibility";
import type {
  MatchEvaluation,
  OpportunityForScoring,
  OpportunityPriorityAnalysis,
  ProfileStrengthAnalysis,
  StudentProfileForScoring,
} from "./types";

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function fieldAlignment(profile: StudentProfileForScoring, opportunity: OpportunityForScoring) {
  const profileField = (
    profile.field_of_study === "Other"
      ? profile.field_of_study_other
      : profile.field_of_study
  )?.toLowerCase();

  const eligibleFields = opportunity.eligible_fields || [];

  if (!profileField) return 45;
  if (eligibleFields.includes("Any")) return 80;

  const text = eligibleFields.join(" ").toLowerCase();

  if (text.includes(profileField)) return 95;

  const broadMatches: [string, string[]][] = [
    ["computer", ["technology", "stem", "engineering", "data"]],
    ["biology", ["health", "medicine", "life sciences", "stem"]],
    ["medicine", ["health", "public health", "biology"]],
    ["business", ["economics", "entrepreneurship", "management"]],
    ["political", ["policy", "law", "international relations", "social sciences"]],
    ["engineering", ["stem", "technology"]],
  ];

  for (const [profileSignal, opportunitySignals] of broadMatches) {
    if (
      profileField.includes(profileSignal) &&
      opportunitySignals.some((signal) => text.includes(signal))
    ) {
      return 82;
    }
  }

  return 55;
}

function recommendationFromScore(score: number): MatchEvaluation["recommendation"] {
  if (score >= 78) return "apply_now";
  if (score >= 60) return "save_for_later";
  return "improve_first";
}

function labelFromScore(score: number): MatchEvaluation["label"] {
  if (score >= 78) return "Strong match";
  if (score >= 60) return "Good match";
  return "Developing match";
}

function confidenceFromProfile(profile: ProfileStrengthAnalysis): MatchEvaluation["confidence"] {
  if (profile.profile_completeness >= 80 && profile.evidence_quality >= 55) return "high";
  if (profile.profile_completeness >= 55) return "medium";
  return "low";
}

export function evaluateMatch({
  profile,
  opportunity,
  profileStrength,
  opportunityPriorities,
}: {
  profile: StudentProfileForScoring;
  opportunity: OpportunityForScoring;
  profileStrength: ProfileStrengthAnalysis;
  opportunityPriorities: OpportunityPriorityAnalysis;
}): MatchEvaluation {
  const fieldScore = fieldAlignment(profile, opportunity);

  const weightedScore =
    profileStrength.academic_strength * (opportunityPriorities.academic_weight / 100) +
    profileStrength.research_strength * (opportunityPriorities.research_weight / 100) +
    profileStrength.leadership_strength * (opportunityPriorities.leadership_weight / 100) +
    profileStrength.community_impact_strength *
      (opportunityPriorities.community_impact_weight / 100) +
    profileStrength.work_project_strength *
      (opportunityPriorities.work_project_weight / 100) +
    profileStrength.awards_strength * (opportunityPriorities.awards_weight / 100) +
    fieldScore * (opportunityPriorities.field_alignment_weight / 100) +
    profileStrength.institution_signal *
      (opportunityPriorities.institution_signal_weight / 100);

  const completenessPenalty =
    profileStrength.profile_completeness < 50 ? 8 : profileStrength.profile_completeness < 70 ? 4 : 0;

  // Structured eligibility, evaluated against the profile. Confirmed
  // eligibility lifts the score slightly; unresolved strict requirements pull
  // it down — a great-looking match the user may not qualify for should not
  // outrank one they definitely do.
  const eligibility = evaluateEligibility({
    profile: profile as unknown as Record<string, unknown>,
    criteria: opportunity.eligibility_criteria,
  });
  const eligibilityAdjustment =
    eligibility.status === "eligible"
      ? 5
      : eligibility.status === "ineligible"
        ? -35
        : eligibility.status === "unknown"
          ? -4
          : 0;

  const score = clamp(weightedScore - completenessPenalty + eligibilityAdjustment);

  const reasons: string[] = [];
  const gaps: string[] = [];

  if (eligibility.status === "eligible") {
    reasons.push("You meet every stated eligibility requirement.");
  }
  for (const blocker of eligibility.blockers) {
    gaps.push(`Eligibility: ${blocker.criterion.requirement}`);
  }
  if (eligibility.status === "unknown" || eligibility.status === "likely_eligible") {
    const unresolved = eligibility.checks.filter(
      (check) => check.verdict === "unknown" && check.criterion.strict
    );
    if (unresolved.length > 0) {
      gaps.push(
        `Confirm before applying: ${unresolved
          .slice(0, 2)
          .map((check) => check.criterion.requirement)
          .join(" ")}`
      );
    }
  }

  if (fieldScore >= 80) {
    reasons.push("Your field of study aligns well with this opportunity.");
  } else {
    gaps.push("Your field alignment is not especially strong for this opportunity.");
  }

  if (
    opportunityPriorities.research_weight >= 18 &&
    profileStrength.research_strength >= 70
  ) {
    reasons.push("Your research experience is a strong match for what this opportunity emphasizes.");
  } else if (
    opportunityPriorities.research_weight >= 18 &&
    profileStrength.research_strength < 50
  ) {
    gaps.push("This opportunity appears to value research, but your profile has limited research evidence.");
  }

  if (
    opportunityPriorities.leadership_weight >= 18 &&
    profileStrength.leadership_strength >= 70
  ) {
    reasons.push("Your leadership experience strengthens your fit for this opportunity.");
  } else if (
    opportunityPriorities.leadership_weight >= 18 &&
    profileStrength.leadership_strength < 50
  ) {
    gaps.push("This opportunity appears to value leadership, but your leadership evidence is limited.");
  }

  if (
    opportunityPriorities.community_impact_weight >= 18 &&
    profileStrength.community_impact_strength >= 70
  ) {
    reasons.push("Your community impact experience supports your competitiveness.");
  } else if (
    opportunityPriorities.community_impact_weight >= 18 &&
    profileStrength.community_impact_strength < 50
  ) {
    gaps.push("This opportunity appears to value community impact, but your profile has limited evidence there.");
  }

  if (profileStrength.academic_strength >= 80) {
    reasons.push("Your academic profile is strong.");
  }

  if (profileStrength.profile_completeness < 70) {
    gaps.push("Your profile is not fully complete, so the score may improve after adding more details.");
  }

  if (reasons.length === 0) {
    reasons.push("Your profile has some relevant signals for this opportunity.");
  }

  if (gaps.length === 0) {
    gaps.push("No major gaps detected from the current profile details.");
  }

  return {
    score,
    recommendation: recommendationFromScore(score),
    label: labelFromScore(score),
    reasons,
    gaps,
    confidence: confidenceFromProfile(profileStrength),
  };
}
