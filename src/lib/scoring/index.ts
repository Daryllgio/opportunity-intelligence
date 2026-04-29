import { evaluateMatch } from "./match-evaluator";
import { evaluateOpportunityPriorities } from "./opportunity-evaluator";
import { evaluateProfileStrength } from "./profile-evaluator";
import type {
  MatchEvaluation,
  OpportunityForScoring,
  StudentProfileForScoring,
} from "./types";

export function calculateCompetitivenessScore({
  profile,
  opportunity,
}: {
  profile: StudentProfileForScoring;
  opportunity: OpportunityForScoring;
}): MatchEvaluation {
  const profileStrength = evaluateProfileStrength(profile);
  const opportunityPriorities = evaluateOpportunityPriorities(opportunity);

  return evaluateMatch({
    profile,
    opportunity,
    profileStrength,
    opportunityPriorities,
  });
}

export type {
  MatchEvaluation,
  OpportunityForScoring,
  StudentProfileForScoring,
};
