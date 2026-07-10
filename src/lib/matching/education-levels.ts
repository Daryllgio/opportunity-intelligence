/**
 * One canonical education-level vocabulary for the whole platform.
 *
 * Extraction (Gemini Pro) is instructed to emit these exact tokens, but the
 * catalog still holds free-text from earlier extractions and pages say things
 * like "senior secondary school" (= high school) or "post-secondary"
 * (= undergraduate). Naive substring matching gets these WRONG in both
 * directions: "post secondary" contains "secondary" (high school), "senior
 * secondary" contains "senior" (undergrad class standing). This module does
 * ordered, phrase-aware detection so each free-text level maps to the
 * canonical levels it actually means.
 *
 * Fail-open contract: text that maps to NO canonical level is unrecognized —
 * callers must treat it as "cannot exclude", never as a mismatch.
 */

export const CANONICAL_EDUCATION_LEVELS = [
  "high_school",
  "undergraduate",
  "masters",
  "phd",
  "graduate", // page says "graduate students" without masters/PhD split
  "medical_student",
  "law_student",
  "mba",
  "professional_student",
  "postdoc",
  "recent_graduate",
  "early_career",
  "any_level",
] as const;

export type CanonicalEducationLevel = (typeof CANONICAL_EDUCATION_LEVELS)[number];

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const OPEN_LEVEL_VALUES = new Set([
  "any", "all", "any level", "all levels", "open", "not specified",
  "all students", "students", "any student",
]);

type LevelRule = { pattern: RegExp; levels: CanonicalEducationLevel[] };

/**
 * Ordered rules — the FIRST match wins for the text it consumes, and matched
 * text is removed before later rules run, so "post-secondary" never leaks a
 * "secondary" match and "senior secondary school" never leaks a class-standing
 * "senior" match.
 */
const LEVEL_RULES: LevelRule[] = [
  // Most specific phrases first. These CONSUME their text.
  { pattern: /post[\s-]?secondary/g, levels: ["undergraduate"] },
  {
    pattern:
      /(?:senior|upper|junior)?\s*secondary(?:\s*school)?(?:\s*(?:student|graduate|senior)s?)?/g,
    levels: ["high_school"],
  },
  {
    pattern:
      /high[\s-]?school(?:\s*(?:student|senior|junior|graduate)s?)?|highschool|grade\s*(?:9|10|11|12)\b|grades\s*(?:9|10|11|12)/g,
    levels: ["high_school"],
  },
  // "graduating senior" without "high school" context is genuinely ambiguous
  // (HS senior for entry scholarships, college senior for grad awards) —
  // match BOTH so neither audience is wrongly excluded.
  { pattern: /graduating\s+seniors?/g, levels: ["high_school", "undergraduate"] },
  { pattern: /recent(?:ly)?[\s-]?graduat\w*|alumni|alumnae?\b/g, levels: ["recent_graduate"] },
  { pattern: /post[\s-]?doc\w*/g, levels: ["postdoc"] },
  { pattern: /juris\s+doctor|law\s+students?|\bjd\b|\bllb\b|\bllm\b|master\s+of\s+laws/g, levels: ["law_student"] },
  { pattern: /medical\s+students?|\bmd\s+students?|medical\s+school/g, levels: ["medical_student"] },
  { pattern: /\bmba\b|business\s+school\s+students?/g, levels: ["mba"] },
  { pattern: /professional\s+(?:students?|degree)/g, levels: ["professional_student"] },
  { pattern: /master'?s?\b|\bmsc\b|\bmasters\b/g, levels: ["masters"] },
  { pattern: /ph\.?d\b|doctoral|doctorate/g, levels: ["phd"] },
  // Generic "graduate" AFTER the specific graduate flavors above.
  { pattern: /\bgrad(?:uate)?(?:\s*(?:students?|level|studies))?\b/g, levels: ["graduate"] },
  // Bare "university"/"college" deliberately do NOT match — institution
  // names ("University of Saskatchewan ... for PhD Students") would read as
  // undergraduate. Only student-phrases count.
  {
    pattern:
      /under[\s-]?grad\w*|bachelor'?s?\b|baccalaureate|associate'?s?(?:\s*degree)?|college\s+students?|university\s+students?|college\/university/g,
    levels: ["undergraduate"],
  },
  // Bare class standings imply an enrolled undergraduate.
  { pattern: /\b(?:freshman|freshmen|sophomores?|juniors?|seniors?)\b/g, levels: ["undergraduate"] },
  { pattern: /early[\s-]?career|young\s+professionals?/g, levels: ["early_career"] },
];

/**
 * Map one free-text level statement to the canonical levels it denotes.
 * Returns [] when the text is unrecognized (callers must fail open).
 */
export function levelsFromText(raw: unknown): CanonicalEducationLevel[] {
  let text = normalizeText(raw);
  if (!text) return [];
  if (OPEN_LEVEL_VALUES.has(text)) return ["any_level"];

  const found = new Set<CanonicalEducationLevel>();
  for (const rule of LEVEL_RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) {
      for (const level of rule.levels) found.add(level);
      // Consume so broader rules can't re-match the same words.
      text = text.replace(rule.pattern, " ");
    }
  }
  return Array.from(found);
}

/** "graduate" covers masters and PhD; every set covers itself. */
function levelSatisfies(
  required: CanonicalEducationLevel,
  userLevel: CanonicalEducationLevel
): boolean {
  if (required === "any_level") return true;
  if (required === userLevel) return true;
  if (required === "graduate" && (userLevel === "masters" || userLevel === "phd")) {
    return true;
  }
  if ((required === "masters" || required === "phd") && userLevel === "graduate") {
    return true;
  }
  return false;
}

/** The user's canonical level(s), from profile education_level / student_status. */
export function profileCanonicalLevels(profile: Record<string, unknown>): CanonicalEducationLevel[] {
  const fromLevel = levelsFromText(profile.education_level);
  if (fromLevel.length > 0) return fromLevel;
  return levelsFromText(profile.student_status);
}

export type EducationLevelVerdict = "match" | "mismatch" | "unrecognized" | "open";

/**
 * Compare a row's eligible_education_levels against a profile.
 *
 * - "open": the row states no levels (or an open value) — everyone passes.
 * - "match": at least one stated level covers the user.
 * - "mismatch": EVERY stated level is recognized vocabulary and none covers
 *   the user — safe to exclude.
 * - "unrecognized": some stated level maps to nothing we know — fail open.
 */
export function educationLevelVerdict(
  profile: Record<string, unknown>,
  eligibleLevels: unknown
): EducationLevelVerdict {
  const stated = Array.isArray(eligibleLevels)
    ? eligibleLevels.map(normalizeText).filter(Boolean)
    : [];
  if (stated.length === 0) return "open";

  const userLevels = profileCanonicalLevels(profile);
  if (userLevels.length === 0) return "open"; // no profile level — never exclude

  let sawUnrecognized = false;
  for (const item of stated) {
    const levels = levelsFromText(item);
    if (levels.length === 0) {
      if (OPEN_LEVEL_VALUES.has(item)) return "open";
      sawUnrecognized = true;
      continue;
    }
    if (levels.includes("any_level")) return "open";
    for (const required of levels) {
      for (const user of userLevels) {
        if (levelSatisfies(required, user)) return "match";
      }
    }
  }

  return sawUnrecognized ? "unrecognized" : "mismatch";
}
