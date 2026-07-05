/**
 * Structured eligibility criteria — capture anything, enforce what we can.
 *
 * Opportunities state who can apply in wildly different vocabularies:
 * citizenship, a specific school, a state, a GPA floor, an age band, a
 * demographic group, financial need. Extraction captures EVERY stated
 * criterion as a { kind, requirement, values, strict } record — `kind` is an
 * open vocabulary (known kinds get real matching logic, unknown kinds still
 * display), `requirement` is the human-readable statement, `values` are
 * normalized machine-comparable values, and `strict` marks hard requirements
 * versus preferences.
 *
 * Evaluation against a profile is deliberately conservative: we only say
 * "not eligible" when the profile positively contradicts a strict
 * requirement. Missing profile data yields "unknown", never exclusion —
 * demographic criteria in particular can only ever confirm, not exclude.
 */

export type EligibilityCriterion = {
  kind: string;
  requirement: string;
  values: string[];
  strict: boolean;
};

export type CriterionVerdict = "met" | "not_met" | "unknown";

export type EligibilityCheck = {
  criterion: EligibilityCriterion;
  verdict: CriterionVerdict;
  note: string | null;
};

export type EligibilityStatus =
  | "eligible" // every strict criterion positively met
  | "likely_eligible" // nothing contradicted, at least one criterion met
  | "unknown" // criteria exist but the profile can't confirm them
  | "ineligible" // a strict criterion is positively contradicted
  | "no_criteria"; // the opportunity states no constraints

export type EligibilityResult = {
  status: EligibilityStatus;
  checks: EligibilityCheck[];
  blockers: EligibilityCheck[];
};

/** Kinds with real matching logic. Anything else is display-only. */
export const KNOWN_CRITERION_KINDS = [
  "citizenship",
  "residency",
  "location",
  "specific_school",
  "education_level",
  "field_of_study",
  "gpa_minimum",
  "age",
  "demographic",
  "financial_need",
  "enrollment_status",
  "grade_level",
  "other",
] as const;

// ---------------------------------------------------------------------------
// Normalization of AI-extracted criteria
// ---------------------------------------------------------------------------

function cleanString(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEligibilityCriteria(raw: unknown): EligibilityCriterion[] {
  if (!Array.isArray(raw)) return [];
  const criteria: EligibilityCriterion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const requirement = cleanString(record.requirement).slice(0, 300);
    if (!requirement) continue;
    const kind =
      cleanString(record.kind)
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/[^a-z_]/g, "") || "other";
    const values = Array.isArray(record.values)
      ? record.values.map(cleanString).filter(Boolean).slice(0, 12)
      : [];
    criteria.push({
      kind,
      requirement,
      values,
      strict: record.strict !== false, // stated requirements default to hard
    });
  }
  return criteria.slice(0, 24);
}

// ---------------------------------------------------------------------------
// Country / place normalization
// ---------------------------------------------------------------------------

const COUNTRY_ALIASES: Record<string, string[]> = {
  "united states": ["united states", "usa", "us", "u.s.", "america", "american", "us citizen", "u.s. citizen"],
  canada: ["canada", "canadian"],
};

function normalizeLoose(value: unknown): string {
  return cleanString(value).toLowerCase().replace(/[.]/g, "");
}

function sameCountry(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  for (const aliases of Object.values(COUNTRY_ALIASES)) {
    const hasA = aliases.some((alias) => a === alias || a.includes(alias));
    const hasB = aliases.some((alias) => b === alias || b.includes(alias));
    if (hasA && hasB) return true;
  }
  return false;
}

const OPEN_VALUES = new Set([
  "any",
  "all",
  "open",
  "international",
  "global",
  "no restriction",
  "none",
]);

function isOpenValueList(values: string[]): boolean {
  return (
    values.length === 0 ||
    values.every((value) => OPEN_VALUES.has(normalizeLoose(value)))
  );
}

// ---------------------------------------------------------------------------
// Per-kind evaluation
// ---------------------------------------------------------------------------

type ProfileLike = Record<string, unknown>;

function profilePlaces(profile: ProfileLike): string[] {
  return [
    normalizeLoose(profile.state_or_province),
    normalizeLoose(profile.country_of_study),
    normalizeLoose(profile.nationality),
  ].filter(Boolean);
}

function matchAnyValue(
  values: string[],
  candidates: string[],
  compare: (value: string, candidate: string) => boolean
): boolean {
  return values.some((value) =>
    candidates.some((candidate) => compare(normalizeLoose(value), candidate))
  );
}

function evaluateCriterion(
  criterion: EligibilityCriterion,
  profile: ProfileLike
): { verdict: CriterionVerdict; note: string | null } {
  const values = criterion.values.length
    ? criterion.values
    : [criterion.requirement];

  switch (criterion.kind) {
    case "citizenship": {
      if (isOpenValueList(criterion.values)) return { verdict: "met", note: null };
      const nationality = normalizeLoose(profile.nationality);
      if (!nationality) {
        return { verdict: "unknown", note: "Add your nationality to your profile to check this." };
      }
      const met = matchAnyValue(values, [nationality], sameCountry);
      return met
        ? { verdict: "met", note: null }
        : { verdict: "not_met", note: `Your profile lists a different nationality.` };
    }

    case "residency":
    case "location": {
      if (isOpenValueList(criterion.values)) return { verdict: "met", note: null };
      const places = profilePlaces(profile);
      if (places.length === 0) {
        return { verdict: "unknown", note: "Add your location to your profile to check this." };
      }
      const met = matchAnyValue(values, places, (value, place) =>
        sameCountry(value, place) || value.includes(place) || place.includes(value)
      );
      // A location miss is only a real contradiction when the profile has a
      // state/province set; country-level data alone can't rule out a city or
      // state requirement inside that country.
      if (met) return { verdict: "met", note: null };
      const hasStateData = Boolean(normalizeLoose(profile.state_or_province));
      const valuesLookSubNational = values.some(
        (value) => !sameCountry(normalizeLoose(value), "united states") && !sameCountry(normalizeLoose(value), "canada")
      );
      if (valuesLookSubNational && !hasStateData) {
        return { verdict: "unknown", note: "Add your state or province to your profile to check this." };
      }
      return { verdict: "not_met", note: "Your location does not match this requirement." };
    }

    case "specific_school": {
      const school = normalizeLoose(profile.school || profile.school_other);
      if (!school) {
        return { verdict: "unknown", note: "Add your school to your profile to check this." };
      }
      const met = matchAnyValue(values, [school], (value, candidate) =>
        value.includes(candidate) || candidate.includes(value)
      );
      return met
        ? { verdict: "met", note: null }
        : { verdict: "not_met", note: "This is limited to students at a specific school." };
    }

    case "gpa_minimum": {
      const gpa = Number(profile.gpa);
      const requiredRaw = values
        .map((value) => {
          const match = String(value).match(/\d+(?:\.\d+)?/);
          return match ? Number(match[0]) : NaN;
        })
        .find((n) => !Number.isNaN(n) && n > 0 && n <= 4.5);
      if (requiredRaw === undefined) return { verdict: "unknown", note: null };
      if (Number.isNaN(gpa) || gpa <= 0) {
        return { verdict: "unknown", note: "Add your GPA to your profile to check this." };
      }
      return gpa >= requiredRaw
        ? { verdict: "met", note: null }
        : { verdict: "not_met", note: `Requires a GPA of ${requiredRaw}+.` };
    }

    case "education_level":
    case "grade_level": {
      const level = normalizeLoose(profile.education_level || profile.student_status).replace(/_/g, " ");
      if (!level) return { verdict: "unknown", note: null };
      const met = matchAnyValue(values, [level], (value, candidate) =>
        value.includes(candidate) || candidate.includes(value)
      );
      return met ? { verdict: "met", note: null } : { verdict: "unknown", note: null };
    }

    case "field_of_study": {
      const field = normalizeLoose(profile.field_of_study || profile.field_of_study_other);
      if (!field) return { verdict: "unknown", note: null };
      const met = matchAnyValue(values, [field], (value, candidate) =>
        value.includes(candidate) || candidate.includes(value)
      );
      return met ? { verdict: "met", note: null } : { verdict: "unknown", note: null };
    }

    case "financial_need": {
      // Stored as boolean true or an affirmative string, depending on form
      // vintage. Absence can mean "didn't answer" — only confirm, never exclude.
      const need = profile.financial_need;
      const hasNeed =
        need === true ||
        ["yes", "true", "high", "moderate", "some"].includes(normalizeLoose(need));
      return hasNeed
        ? { verdict: "met", note: null }
        : { verdict: "unknown", note: "This opportunity considers financial need." };
    }

    case "demographic": {
      // Identity data is optional and self-reported: it can confirm a match
      // but must never exclude anyone.
      const tags = Array.isArray(profile.demographic_tags)
        ? (profile.demographic_tags as unknown[]).map(normalizeLoose)
        : [];
      if (profile.first_generation === true) tags.push("first generation", "first-generation");
      if (tags.length === 0) return { verdict: "unknown", note: null };
      const met = matchAnyValue(values, tags, (value, tag) =>
        value.includes(tag) || tag.includes(value)
      );
      return met ? { verdict: "met", note: null } : { verdict: "unknown", note: null };
    }

    case "enrollment_status": {
      const status = normalizeLoose(profile.student_status).replace(/_/g, " ");
      if (!status) return { verdict: "unknown", note: null };
      const met = matchAnyValue(values, [status], (value, candidate) =>
        value.includes(candidate) || candidate.includes(value)
      );
      return met ? { verdict: "met", note: null } : { verdict: "unknown", note: null };
    }

    default:
      // Age and anything we didn't anticipate: display, don't judge.
      return { verdict: "unknown", note: null };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function evaluateEligibility({
  profile,
  criteria,
}: {
  profile: ProfileLike;
  criteria: unknown;
}): EligibilityResult {
  const normalized = normalizeEligibilityCriteria(criteria);

  if (normalized.length === 0) {
    return { status: "no_criteria", checks: [], blockers: [] };
  }

  const checks: EligibilityCheck[] = normalized.map((criterion) => {
    const { verdict, note } = evaluateCriterion(criterion, profile);
    return { criterion, verdict, note };
  });

  const blockers = checks.filter(
    (check) => check.verdict === "not_met" && check.criterion.strict
  );

  if (blockers.length > 0) {
    return { status: "ineligible", checks, blockers };
  }

  const strictChecks = checks.filter((check) => check.criterion.strict);
  const metCount = checks.filter((check) => check.verdict === "met").length;

  if (strictChecks.length > 0 && strictChecks.every((check) => check.verdict === "met")) {
    return { status: "eligible", checks, blockers: [] };
  }

  if (metCount > 0) {
    return { status: "likely_eligible", checks, blockers: [] };
  }

  return { status: "unknown", checks, blockers: [] };
}

/** Compact card-chip label for a failed requirement, e.g. "Requires US citizenship". */
export function shortBlockerLabel(check: EligibilityCheck): string {
  const { kind, values } = check.criterion;
  const first = values[0] || "";
  switch (kind) {
    case "citizenship":
      return `Requires ${first || "specific"} citizenship`;
    case "residency":
    case "location":
      return first ? `${first} residents only` : "Location restricted";
    case "specific_school":
      return first ? `${first} students only` : "School specific";
    case "gpa_minimum":
      return first ? `Requires ${first}+ GPA` : "GPA requirement";
    case "education_level":
    case "grade_level":
      return first ? `For ${first.toLowerCase()} students` : "Level restricted";
    default:
      return `${criterionKindLabel(kind)} requirement`;
  }
}

/** Short human label for a criterion kind, for chips and flags. */
export function criterionKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    citizenship: "Citizenship",
    residency: "Residency",
    location: "Location",
    specific_school: "School",
    education_level: "Education level",
    field_of_study: "Field of study",
    gpa_minimum: "GPA",
    age: "Age",
    demographic: "Eligibility group",
    financial_need: "Financial need",
    enrollment_status: "Enrollment",
    grade_level: "Grade level",
  };
  return labels[kind] || "Requirement";
}
