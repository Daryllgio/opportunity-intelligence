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

/**
 * Deterministic age backstop for rows whose extraction missed the age
 * requirement ("Cadets and Junior Canadian Rangers" is for ages 12-18; the
 * criteria array came back empty and a 21-year-old saw it). When the
 * structured criteria carry no age entry, scan the row's own words for an
 * EXPLICIT age-range phrase — "ages 12 to 18", "aged 16-25", "12 to 18
 * years" — and evaluate it against the profile DOB. Only unambiguous
 * phrases count; anything else stays with the AI layers.
 */
function explicitAgeRange(row: Record<string, unknown>): { min: number; max: number } | null {
  const text = `${row.title || ""} ${row.ai_summary || ""} ${String(row.description || "").slice(0, 800)}`
    .toLowerCase()
    .replace(/\s+/g, " ");
  const patterns = [
    /\bages?\s*(\d{1,2})\s*(?:-|–|—|to|through)\s*(\d{1,2})\b/,
    /\baged\s*(\d{1,2})\s*(?:-|–|—|to|through)\s*(\d{1,2})\b/,
    /\b(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*years?\s*(?:old|of age)\b/,
    /\byouth\s*(?:aged\s*)?(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const min = Number(match[1]);
      const max = Number(match[2]);
      if (min >= 5 && max <= 90 && min < max) return { min, max };
    }
  }
  return null;
}

function ageFromDob(profile: Record<string, unknown>): number | null {
  const raw = String(profile.date_of_birth || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const dob = new Date(raw);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const hadBirthday =
    now.getUTCMonth() > dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() >= dob.getUTCDate());
  if (!hadBirthday) age -= 1;
  return age >= 5 && age <= 100 ? age : null;
}

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

  // Age backstop: when extraction captured no age criterion but the row's
  // own words state an explicit age range, enforce it against the DOB.
  let ageBackstopBlocked = false;
  const hasAgeCriterion = evaluation.checks.some(
    (check) => check.criterion.kind === "age"
  );
  if (!hasAgeCriterion) {
    const range = explicitAgeRange(opportunity);
    const age = ageFromDob(profile);
    if (range && age !== null && (age < range.min || age > range.max)) {
      ageBackstopBlocked = true;
      reasons.push(
        `For ages ${range.min}-${range.max} (stated on the opportunity); you are ${age}.`
      );
    }
  }

  if (blockers.length > 0 || levelVerdict === "mismatch" || ageBackstopBlocked) {
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
