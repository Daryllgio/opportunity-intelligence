/**
 * Tier 1 of the two-tier eligibility system: free, instant, deterministic.
 *
 * Combines the structured-criteria evaluator with the canonical
 * education-level matcher and rolls the result up to a single decision:
 *
 *   "eligible"   — every strict criterion positively met
 *   "ineligible" — a strict criterion is POSITIVELY contradicted by profile
 *                  data (wrong country for a state residency, wrong level on
 *                  recognized vocabulary, age outside a parsed range, GPA
 *                  below the floor under every conversion...)
 *   "uncertain"  — anything else. Missing profile data, unrecognized
 *                  vocabulary, natural-language nuance: all uncertain.
 *
 * THE CARDINAL RULE: never wrongly exclude. "ineligible" requires full
 * deterministic confidence; every doubt returns "uncertain" and is resolved
 * by the cached Tier-2 AI pass (tier2-eligibility.ts). Ten borderline rows
 * sent to Flash cost less than one wrongly hidden scholarship.
 */
import {
  evaluateEligibility,
  type EligibilityCheck,
  type EligibilityResult,
} from "@/lib/matching/eligibility";
import { educationLevelVerdict } from "@/lib/matching/education-levels";

export type Tier1Decision = "eligible" | "ineligible" | "uncertain";

export type Tier1Result = {
  decision: Tier1Decision;
  /** Positively contradicted strict criteria (why the row is hidden). */
  blockers: EligibilityCheck[];
  /** Strict criteria the rules could not confirm — Tier-2's work queue. */
  uncertainChecks: EligibilityCheck[];
  /** The underlying evaluator result, for display code. */
  evaluation: EligibilityResult;
  /** Short human-readable reasons for the decision. */
  reasons: string[];
};

type Row = Record<string, unknown>;

export function tier1Eligibility({
  profile,
  opportunity,
}: {
  profile: Row;
  opportunity: Row;
}): Tier1Result {
  const evaluation = evaluateEligibility({
    profile,
    criteria: opportunity.eligibility_criteria,
  });

  const blockers = [...evaluation.blockers];
  const reasons: string[] = blockers.map(
    (check) => check.criterion.requirement
  );

  // Education-level gate on the legacy eligible_education_levels array —
  // rows published before structured criteria still carry their levels
  // there. Recognized-vocabulary mismatch is a hard exclusion; unrecognized
  // vocabulary fails open.
  let levelVerdict = educationLevelVerdict(
    profile,
    opportunity.eligible_education_levels
  );

  // When a row states no levels at all, its TITLE is often explicit
  // ("Guaranteed Funding Package for PhD Students") — titles are
  // high-precision for level mentions, and the check still fails open
  // when the title names no level.
  if (
    levelVerdict === "open" &&
    (!Array.isArray(opportunity.eligible_education_levels) ||
      (opportunity.eligible_education_levels as unknown[]).length === 0)
  ) {
    const titleVerdict = educationLevelVerdict(profile, [
      String(opportunity.title || ""),
    ]);
    if (titleVerdict === "mismatch") levelVerdict = "mismatch";
  }

  if (levelVerdict === "mismatch") {
    reasons.push("This opportunity is for a different education level.");
  }

  if (blockers.length > 0 || levelVerdict === "mismatch") {
    return {
      decision: "ineligible",
      blockers,
      uncertainChecks: [],
      evaluation,
      reasons,
    };
  }

  const uncertainChecks = evaluation.checks.filter(
    (check) => check.criterion.strict && check.verdict === "unknown"
  );

  // no_criteria is NOT eligibility: a row with zero captured requirements
  // is the unknown case (extraction may simply have missed them). It stays
  // visible and scoreable, but never claims "eligible".
  if (evaluation.status === "eligible" && uncertainChecks.length === 0) {
    return {
      decision: "eligible",
      blockers: [],
      uncertainChecks: [],
      evaluation,
      reasons: [],
    };
  }

  return {
    decision: "uncertain",
    blockers: [],
    uncertainChecks,
    evaluation,
    reasons: uncertainChecks.map((check) => check.criterion.requirement),
  };
}
