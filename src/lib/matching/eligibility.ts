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

import { educationLevelVerdict } from "@/lib/matching/education-levels";
import { fieldSatisfies } from "@/lib/matching/field-families";

export type EligibilityCriterion = {
  kind: string;
  requirement: string;
  values: string[];
  strict: boolean;
  /** For field_of_study: how wide the door is. "narrow" = named major(s)
   * only, "family" = a field family ("STEM"), "open" = all fields. */
  breadth?: "narrow" | "family" | "open";
  /** True when the requirement was INFERRED from context rather than
   * stated on the page (government aid implying citizenship, a school's
   * internal award implying enrollment). Inferred criteria can never
   * produce a deterministic exclusion — only the AI tier may weigh them. */
  inferred?: boolean;
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
    const breadthRaw = cleanString(record.breadth).toLowerCase();
    const breadth =
      breadthRaw === "narrow" || breadthRaw === "family" || breadthRaw === "open"
        ? breadthRaw
        : undefined;
    criteria.push({
      kind,
      requirement,
      values,
      strict: record.strict !== false, // stated requirements default to hard
      ...(breadth ? { breadth } : {}),
      ...(record.inferred === true ? { inferred: true } : {}),
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

// Kept in sync with src/lib/data/regions.ts (duplicated here so this module
// stays dependency-free for server and client use alike).
const US_STATE_SET = new Set(
  [
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
    "connecticut", "delaware", "district of columbia", "florida", "georgia",
    "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky",
    "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota",
    "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire",
    "new jersey", "new mexico", "new york", "north carolina", "north dakota",
    "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island",
    "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
    "virginia", "washington", "west virginia", "wisconsin", "wyoming",
    "puerto rico",
  ]
);

const CA_PROVINCE_SET = new Set([
  "alberta", "british columbia", "manitoba", "new brunswick",
  "newfoundland and labrador", "northwest territories", "nova scotia",
  "nunavut", "ontario", "prince edward island", "quebec", "saskatchewan",
  "yukon",
]);

/** Which country a required region implies, when we can tell. */
function regionCountry(place: string): string | null {
  if (US_STATE_SET.has(place)) return "united states";
  if (CA_PROVINCE_SET.has(place)) return "canada";
  return null;
}

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

/** Every nationality the student holds — dual citizens qualify through any. */
function profileCitizenships(profile: ProfileLike): string[] {
  const list = Array.isArray(profile.citizenships)
    ? (profile.citizenships as unknown[]).map(normalizeLoose)
    : [];
  const primary = normalizeLoose(profile.nationality);
  if (primary) list.push(primary);
  return Array.from(new Set(list.filter(Boolean)));
}

/** Fields the student can claim: major, double major, and (for grad students)
 * their undergraduate field. Undeclared majors match nothing but are never
 * excluded — field checks only ever return met or unknown. */
function profileFields(profile: ProfileLike): string[] {
  return [
    normalizeLoose(profile.field_of_study),
    normalizeLoose(profile.field_of_study_other),
    normalizeLoose(profile.field_of_study_secondary),
    normalizeLoose(profile.undergraduate_field_of_study),
  ].filter((field) => field && field !== "other" && field !== "undeclared");
}

/** Schools the student can claim: current plus (for transfers) intended. */
function profileSchools(profile: ProfileLike): string[] {
  return [
    normalizeLoose(profile.school === "Other" ? profile.school_other : profile.school),
    normalizeLoose(profile.intended_school),
  ].filter(Boolean);
}

function ageFromDateOfBirth(profile: ProfileLike): number | null {
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

/** Parse an age requirement into [min, max]. Handles "16-18", "25+",
 * "25 and older", "under 30", "at least 21", plain "18". */
function parseAgeRequirement(values: string[]): { min: number | null; max: number | null } | null {
  for (const raw of values) {
    const text = normalizeLoose(raw);
    let match = text.match(/(\d{1,2})\s*(?:-|to|through)\s*(\d{1,2})/);
    if (match) return { min: Number(match[1]), max: Number(match[2]) };
    match = text.match(/(?:under|younger than|below)\s*(\d{1,2})/);
    if (match) return { min: null, max: Number(match[1]) - 1 };
    match = text.match(/(\d{1,2})\s*(?:\+|and (?:older|above|up)|or older)/);
    if (match) return { min: Number(match[1]), max: null };
    match = text.match(/(?:at least|minimum(?: age)?(?: of)?)\s*(\d{1,2})/);
    if (match) return { min: Number(match[1]), max: null };
    match = text.match(/^(\d{1,2})$/);
    if (match) return { min: Number(match[1]), max: Number(match[1]) };
  }
  return null;
}

/**
 * GPA comparison across scales. The profile records which scale its GPA is
 * on; requirements are almost always stated on 4.0. Conversions between
 * scales are institution-specific and lossy, so we only return met/not_met
 * when the answer holds under BOTH a generous and a conservative conversion
 * — anything in between is unknown, never exclusion.
 */
function compareGpa(
  gpa: number,
  scale: string,
  required: number
): CriterionVerdict {
  if (scale === "4.3") {
    const converted = gpa * (4.0 / 4.3);
    if (converted >= required) return "met";
    if (gpa < required) return "not_met"; // below even unconverted
    return "unknown";
  }
  if (scale === "percentage") {
    if (gpa / 25 >= required) return "met"; // 90% clears 3.6 on any mapping
    if (gpa / 20 < required) return "not_met"; // 3.5 needs at least 70% anywhere
    return "unknown";
  }
  return gpa >= required ? "met" : "not_met"; // native 4.0
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
      const citizenships = profileCitizenships(profile);
      if (citizenships.length === 0) {
        return { verdict: "unknown", note: "Add your nationality to your profile to check this." };
      }
      const met = matchAnyValue(values, citizenships, sameCountry);
      if (met) return { verdict: "met", note: null };

      const acceptsPermanentResidents = /permanent resident|green card|landed immigrant/i.test(
        criterion.requirement
      );
      if (acceptsPermanentResidents) {
        // Permanent residency is explicit profile data now. Holding PR of a
        // required country satisfies the clause; positively NOT holding it
        // (the student answered the question) plus no matching citizenship
        // is a real exclusion — an international student who is neither a
        // citizen nor a PR of Canada cannot win a "Canadian citizens or
        // permanent residents" award (the GeniusCash bug). Only a student
        // who never answered stays unknown.
        // permanent_resident_of holds country names, or the sentinel "none"
        // when the student explicitly answered that they hold no PR status.
        // An empty/missing array means the question was never answered.
        const prRaw = Array.isArray(profile.permanent_resident_of)
          ? (profile.permanent_resident_of as unknown[]).map(normalizeLoose).filter(Boolean)
          : [];
        const answeredNone = prRaw.includes("none");
        const prCountries = prRaw.filter((entry) => entry !== "none");

        if (prCountries.length > 0) {
          const prMet = matchAnyValue(values, prCountries, sameCountry);
          if (prMet) return { verdict: "met", note: "You hold permanent residency there." };
          return {
            verdict: "not_met",
            note: "Requires citizenship or permanent residency you don't hold.",
          };
        }
        if (answeredNone) {
          return {
            verdict: "not_met",
            note: "Requires citizenship or permanent residency you don't hold.",
          };
        }
        return {
          verdict: "unknown",
          note: "Open to permanent residents too. Met if you hold PR status.",
        };
      }
      return { verdict: "not_met", note: "Your citizenship does not match this requirement." };
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
      if (met) return { verdict: "met", note: null };

      // A required place that is a known US state (or Canadian province)
      // positively contradicts a profile based in the OTHER country, even
      // without state-level profile data: a student studying in Canada
      // cannot be a Kansas resident.
      const userCountry = normalizeLoose(profile.country_of_study);
      const requiredRegionCountry = values
        .map((value) => regionCountry(normalizeLoose(value)))
        .find(Boolean);
      if (
        requiredRegionCountry &&
        userCountry &&
        !sameCountry(userCountry, requiredRegionCountry)
      ) {
        return { verdict: "not_met", note: "Your location does not match this requirement." };
      }

      // Otherwise a location miss is only a real contradiction when the
      // profile has a state/province set; country-level data alone can't
      // rule out a city or state requirement inside that country.
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
      const schools = profileSchools(profile);
      if (schools.length === 0) {
        return { verdict: "unknown", note: "Add your school to your profile to check this." };
      }
      const met = matchAnyValue(values, schools, (value, candidate) =>
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
      const scale = normalizeLoose(profile.gpa_scale) || "4.0";
      const verdict = compareGpa(gpa, scale, requiredRaw);
      return {
        verdict,
        note:
          verdict === "not_met"
            ? `Requires a GPA of ${requiredRaw}+.`
            : verdict === "unknown"
              ? "GPA scales differ; check the exact conversion with the provider."
              : null,
      };
    }

    case "education_level":
    case "grade_level":
    case "class_standing": {
      const candidates = [
        normalizeLoose(profile.education_level).replace(/_/g, " "),
        normalizeLoose(profile.class_standing).replace(/_/g, " "),
        normalizeLoose(profile.student_status).replace(/_/g, " "),
      ].filter(Boolean);
      if (candidates.length === 0) return { verdict: "unknown", note: null };
      const met = matchAnyValue(values, candidates, (value, candidate) =>
        value.includes(candidate) || candidate.includes(value)
      );
      if (met) return { verdict: "met", note: null };

      // A recognized level mismatch is a real contradiction: "high_school"
      // (or "final year of senior secondary school") positively excludes an
      // enrolled undergraduate. The canonical module fails open on any
      // vocabulary it can't map, so this never excludes on unknown wording.
      if (criterion.kind === "education_level") {
        const levelVerdict = educationLevelVerdict(profile, values);
        if (levelVerdict === "mismatch") {
          return {
            verdict: "not_met",
            note: "This is for a different education level.",
          };
        }
      }
      return { verdict: "unknown", note: null };
    }

    case "field_of_study": {
      // Inclusive by design: families widen matches (biology counts as STEM
      // and health sciences), and a miss is only ever "unknown" — majors are
      // fuzzy and the Tier-2 resolver owns genuine ambiguity. Never exclude
      // on field alone.
      if (criterion.breadth === "open" || isOpenValueList(criterion.values)) {
        return { verdict: "met", note: null };
      }
      const fields = profileFields(profile);
      if (fields.length === 0) return { verdict: "unknown", note: null };
      if (fieldSatisfies(fields, values)) return { verdict: "met", note: null };
      const met = matchAnyValue(values, fields, (value, candidate) =>
        value.includes(candidate) || candidate.includes(value)
      );
      return met ? { verdict: "met", note: null } : { verdict: "unknown", note: null };
    }

    case "age": {
      const requirement = parseAgeRequirement(values);
      if (!requirement) return { verdict: "unknown", note: null };
      const age = ageFromDateOfBirth(profile);
      if (age === null) {
        return {
          verdict: "unknown",
          note: "Has an age requirement. Add your date of birth to check it automatically.",
        };
      }
      const met =
        (requirement.min === null || age >= requirement.min) &&
        (requirement.max === null || age <= requirement.max);
      return met
        ? { verdict: "met", note: null }
        : { verdict: "not_met", note: "Your age is outside this requirement." };
    }

    case "language":
    case "language_proficiency": {
      const languages = Array.isArray(profile.languages)
        ? (profile.languages as unknown[]).map(normalizeLoose)
        : [];
      if (languages.length === 0) return { verdict: "unknown", note: null };
      const met = matchAnyValue(values, languages, (value, lang) =>
        value.includes(lang) || lang.includes(value)
      );
      // Speaking a language can be confirmed; proficiency LEVELS can't, so a
      // miss stays unknown.
      return met ? { verdict: "met", note: null } : { verdict: "unknown", note: null };
    }

    case "disability": {
      // Like demographics: optional self-identification confirms, never excludes.
      const disclosed = profile.has_disability === true;
      return disclosed
        ? { verdict: "met", note: null }
        : { verdict: "unknown", note: null };
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

    case "applicant_type":
    case "eligible_applicants": {
      // Institution-facing funding: when every stated applicant type is an
      // organization (institutions, entities, agencies) and none is a
      // student/individual, no student can ever apply. These rows should be
      // purged upstream; this rule is the belt to that suspender.
      const orgSignals = [
        "institution", "entity", "entities", "agency", "agencies",
        "organization", "organisation", "nonprofit", "school district",
        "ihe", "sea", "lea", "consortium", "state", "tribal",
      ];
      const personSignals = ["student", "individual", "applicant may be a person", "youth"];
      const allValues = values.map((value) => normalizeLoose(value));
      if (allValues.length === 0) return { verdict: "unknown", note: null };
      const everyOrg = allValues.every((value) =>
        orgSignals.some((signal) => value.includes(signal))
      );
      const anyPerson = allValues.some((value) =>
        personSignals.some((signal) => value.includes(signal))
      );
      if (everyOrg && !anyPerson) {
        return {
          verdict: "not_met",
          note: "Only organizations can apply to this program, not individual students.",
        };
      }
      return { verdict: "unknown", note: null };
    }

    default:
      // Anything we didn't anticipate: display, don't judge.
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
    // THE INFERENCE RULE: a requirement the page never stated can inform
    // but never exclude. An inferred miss downgrades to unknown and flows
    // to the AI tier, which may judge it with full context. An inferred
    // pass still counts — confirming inference is harmless.
    if (criterion.inferred === true && verdict === "not_met") {
      return {
        criterion,
        verdict: "unknown" as const,
        note: `Likely requirement (inferred, not stated): ${criterion.requirement.slice(0, 120)}`,
      };
    }
    return { criterion, verdict, note };
  });

  // Conflict resolution: pages sometimes state contradictory criteria of the
  // same kind ("open to all majors" boilerplate next to "engineering
  // students only"). A kind only ever blocks when EVERY strict criterion of
  // that kind is positively contradicted — if any alternative is met or
  // unknown, the student may qualify through it, so we never exclude.
  const strictNotMetByKind = new Map<string, EligibilityCheck[]>();
  const kindHasEscape = new Set<string>();
  for (const check of checks) {
    if (!check.criterion.strict) continue;
    if (check.verdict === "not_met") {
      const list = strictNotMetByKind.get(check.criterion.kind) || [];
      list.push(check);
      strictNotMetByKind.set(check.criterion.kind, list);
    } else {
      kindHasEscape.add(check.criterion.kind);
    }
  }

  const blockers: EligibilityCheck[] = [];
  for (const [kind, kindChecks] of strictNotMetByKind) {
    if (!kindHasEscape.has(kind)) blockers.push(...kindChecks);
  }

  if (blockers.length > 0) {
    return { status: "ineligible", checks, blockers };
  }

  // Status rolls up per KIND (an "or" within a kind, an "and" across kinds),
  // so a conflicted pair like all-majors + engineering-only counts as
  // satisfied when either alternative is met.
  const strictKinds = new Map<string, "met" | "unknown">();
  for (const check of checks) {
    if (!check.criterion.strict) continue;
    const current = strictKinds.get(check.criterion.kind);
    if (check.verdict === "met") strictKinds.set(check.criterion.kind, "met");
    else if (!current) strictKinds.set(check.criterion.kind, "unknown");
  }

  const metCount = checks.filter((check) => check.verdict === "met").length;

  if (
    strictKinds.size > 0 &&
    Array.from(strictKinds.values()).every((state) => state === "met")
  ) {
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
    class_standing: "Class standing",
    language: "Language",
    language_proficiency: "Language",
    disability: "Eligibility group",
  };
  return labels[kind] || "Requirement";
}
