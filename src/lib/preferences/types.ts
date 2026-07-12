/**
 * Student preferences — what the student WANTS TO SEE, distinct from the
 * profile (who the student IS). Stored as one jsonb document on profiles
 * (preferences column, apply-me-3.sql) so the shape can grow without
 * migrations.
 *
 * Design rules:
 * - Two separate category selections: SCORED (AI competitiveness scoring,
 *   bounded by plan) and ACCESS (browsable in the database, unbounded).
 * - Sub-questions exist ONLY for categories with real sub-structure, and are
 *   only ever asked for categories the student selected. A student who never
 *   picked competitions never sees a competition question.
 * - Next-level opportunities (graduate programs for an undergrad, university
 *   programs for a high schooler) are OPT-IN. Nobody sees a level above
 *   their own without asking for it.
 * - Preferences FILTER and PRIORITIZE; they never override eligibility.
 *   Unknown data always fails open within an allowed category.
 */

export type NextLevelType =
  | "undergraduate"
  | "masters"
  | "masters_other"
  | "phd"
  | "mba"
  | "jd"
  | "md"
  | "professional_other";

export type StudentPreferences = {
  version: 1;
  /** Categories the student wants AI-scored. Bounded by plan (1/2/4). */
  scored_categories: string[];
  /** Categories browsable in the database. Empty array = everything. */
  access_categories: string[];
  /** Sub-type interests per category — only for categories that branch.
   * A category key absent from this map, or mapped to [], means "all
   * sub-types" (no narrowing). */
  subtypes: Record<string, string[]>;
  /** Opportunities one level above the student's current level. */
  next_level: {
    interested: boolean;
    types: NextLevelType[];
    /** Fields at the next level — may differ from the current major. */
    fields: string[];
    country: "us" | "canada" | "either";
    /** Specific schools to prioritize (optional). */
    target_schools: string[];
  };
  /** Transfer intent — lives in preferences, not the profile. */
  transfer: {
    planning: boolean;
    country: "us" | "canada" | null;
    /** First destination school (compatibility alias for schools[0]). */
    school: string | null;
    /** Destination schools, max 3. */
    schools: string[];
  };
  /** RETIRED (2026-07-12): the browse page's location filter owns this.
   * Kept in the shape so old documents parse; never asked, never applied. */
  location: {
    countries: string[];
    regions: string[];
  };
};

export const DEFAULT_PREFERENCES: StudentPreferences = {
  version: 1,
  scored_categories: [],
  access_categories: [],
  subtypes: {},
  next_level: { interested: false, types: [], fields: [], country: "either", target_schools: [] },
  transfer: { planning: false, country: null, school: null, schools: [] },
  location: { countries: [], regions: [] },
};

// ---------------------------------------------------------------------------
// Sub-type taxonomies — full, non-trivial branches for the categories that
// genuinely have them. scholarship / grant / research_program / pipeline are
// standard categories with no sub-question.
// ---------------------------------------------------------------------------

export type SubtypeOption = { value: string; label: string; hint?: string };

export const CATEGORY_SUBTYPES: Record<string, SubtypeOption[]> = {
  competition: [
    { value: "hackathon", label: "Hackathons", hint: "build software/hardware in a sprint" },
    { value: "case_competition", label: "Case competitions", hint: "business/consulting cases" },
    { value: "essay_writing", label: "Essay & writing contests" },
    { value: "pitch_startup", label: "Pitch & startup competitions" },
    { value: "science_fair", label: "Science fairs & research competitions" },
    { value: "math_olympiad", label: "Math & science olympiads" },
    { value: "coding_contest", label: "Programming contests", hint: "ICPC-style, algorithmic" },
    { value: "data_science_ai", label: "Data science & AI challenges" },
    { value: "robotics_engineering", label: "Robotics & engineering challenges" },
    { value: "debate_moot", label: "Debate, moot court & Model UN" },
    { value: "design_arts", label: "Design, art & media competitions" },
    { value: "policy_social", label: "Policy & social-impact challenges" },
    { value: "quiz_bowl", label: "Academic quiz competitions" },
  ],
  career_development_program: [
    { value: "mentorship", label: "Mentorship programs" },
    { value: "insight_program", label: "Insight & spring programs", hint: "short employer intros" },
    { value: "pre_professional", label: "Pre-professional pipelines", hint: "MLT, SEO, diversity programs" },
    { value: "bootcamp_upskilling", label: "Bootcamps & upskilling" },
    { value: "networking_conference", label: "Career conferences & networking" },
    { value: "certification_training", label: "Certification & training programs" },
  ],
  leadership_program: [
    { value: "civic_community", label: "Civic & community leadership" },
    { value: "global_international", label: "Global & international programs" },
    { value: "governance_policy", label: "Governance & policy programs" },
    { value: "youth_leadership", label: "Youth leadership summits" },
    { value: "entrepreneurship_leadership", label: "Entrepreneurial leadership" },
    { value: "campus_leadership", label: "Campus & student-government" },
  ],
  research_program: [
    { value: "summer_research", label: "Summer research programs", hint: "REUs, summer studentships" },
    { value: "academic_year_research", label: "Academic-year research", hint: "term-time lab & project placements" },
    { value: "research_abroad", label: "Research abroad", hint: "international research placements" },
    { value: "thesis_project_funding", label: "Thesis & project funding", hint: "support for your own research" },
  ],
  fellowship: [
    { value: "research_fellowship", label: "Research fellowships" },
    { value: "teaching_fellowship", label: "Teaching fellowships" },
    { value: "policy_government", label: "Policy & government fellowships" },
    { value: "social_impact", label: "Social-impact & nonprofit fellowships" },
    { value: "industry_fellowship", label: "Industry & tech fellowships" },
    { value: "creative_media", label: "Creative, journalism & media fellowships" },
  ],
};

/** Categories that branch into sub-types (the rest are standard). */
export function categoryHasSubtypes(category: string): boolean {
  return Boolean(CATEGORY_SUBTYPES[category]?.length);
}

export const NEXT_LEVEL_TYPE_OPTIONS: { value: NextLevelType; label: string }[] = [
  { value: "undergraduate", label: "Undergraduate / college" },
  { value: "masters", label: "Master's" },
  { value: "masters_other", label: "Another master's (different field)" },
  { value: "phd", label: "PhD / doctoral" },
  { value: "mba", label: "MBA" },
  { value: "jd", label: "Law (JD)" },
  { value: "md", label: "Medicine (MD)" },
  { value: "professional_other", label: "Other professional degree" },
];

/**
 * The next-level question adapts to where the student IS. Prominent options
 * are the likely paths; "more" holds legitimate-but-rare ones so no real
 * aspiration is blocked, while nobody sees options that make no sense for
 * them (a high schooler is never asked about MBAs).
 */
export function nextLevelChoicesFor(currentLevel: string): {
  question: string;
  prominent: NextLevelType[];
  more: NextLevelType[];
} {
  const level = String(currentLevel || "").toLowerCase();
  if (level.includes("high")) {
    return {
      question: "Interested in university and college opportunities too?",
      prominent: ["undergraduate"],
      more: [],
    };
  }
  if (level.includes("master")) {
    return {
      question: "Thinking about a PhD or professional school after your master's?",
      prominent: ["phd", "mba", "jd", "md"],
      more: ["masters_other", "professional_other"],
    };
  }
  if (level.includes("phd") || level.includes("doctor")) {
    return {
      question: "Considering professional school or further study after your PhD?",
      prominent: ["mba", "jd", "md"],
      more: ["masters_other", "professional_other"],
    };
  }
  if (level.includes("mba") || level.includes("law") || level.includes("medic") || level.includes("professional")) {
    return {
      question: "Considering further study after your current program?",
      prominent: ["phd", "masters_other"],
      more: ["mba", "jd", "md", "professional_other"],
    };
  }
  // Undergraduate (the default)
  return {
    question: "Opportunities beyond your current level?",
    prominent: ["masters", "phd", "mba", "jd", "md"],
    more: ["professional_other"],
  };
}

// ---------------------------------------------------------------------------
// Normalization — preferences arrive from the client; trust nothing.
// ---------------------------------------------------------------------------

function cleanStringArray(value: unknown, max = 24): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter((item) => item.length > 0 && item.length <= 120)
    )
  ).slice(0, max);
}

export function normalizePreferences(raw: unknown): StudentPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFERENCES };
  const input = raw as Record<string, unknown>;
  const nextLevel = (input.next_level || {}) as Record<string, unknown>;
  const transfer = (input.transfer || {}) as Record<string, unknown>;
  const location = (input.location || {}) as Record<string, unknown>;

  const subtypesRaw = (input.subtypes || {}) as Record<string, unknown>;
  const subtypes: Record<string, string[]> = {};
  for (const [category, values] of Object.entries(subtypesRaw)) {
    const known = new Set((CATEGORY_SUBTYPES[category] || []).map((o) => o.value));
    const cleaned = cleanStringArray(values).filter((v) => known.has(v));
    if (cleaned.length) subtypes[category] = cleaned;
  }

  const country = String(nextLevel.country || "either").toLowerCase();
  const transferCountry = String(transfer.country || "").toLowerCase();
  const validNextTypes = new Set(NEXT_LEVEL_TYPE_OPTIONS.map((o) => o.value));

  return {
    version: 1,
    scored_categories: cleanStringArray(input.scored_categories, 8),
    access_categories: cleanStringArray(input.access_categories, 12),
    subtypes,
    next_level: {
      interested: nextLevel.interested === true,
      types: cleanStringArray(nextLevel.types, 6).filter((t): t is NextLevelType =>
        validNextTypes.has(t as NextLevelType)
      ),
      fields: cleanStringArray(nextLevel.fields, 2),
      country: country === "us" || country === "canada" ? (country as "us" | "canada") : "either",
      // Caps bound how much school-specific discovery one user can trigger:
      // 5 next-level target schools, 2 fields, 3 transfer destinations.
      target_schools: cleanStringArray(nextLevel.target_schools, 5),
    },
    transfer: (() => {
      const schools = cleanStringArray(
        Array.isArray(transfer.schools) && (transfer.schools as unknown[]).length
          ? transfer.schools
          : [transfer.school].filter(Boolean),
        3
      );
      return {
        planning: transfer.planning === true,
        country:
          transferCountry === "us" || transferCountry === "canada"
            ? (transferCountry as "us" | "canada")
            : null,
        school: schools[0] || null,
        schools,
      };
    })(),
    location: {
      countries: cleanStringArray(location.countries, 4),
      regions: cleanStringArray(location.regions, 12),
    },
  };
}

/**
 * Read preferences off a profile row, with a compatibility bridge: users
 * who predate the preferences system fall back to target_opportunity_types
 * for both scored and access categories (their current behavior, unchanged).
 */
export function preferencesFromProfile(
  profile: Record<string, unknown> | null | undefined
): StudentPreferences {
  const raw = profile?.preferences;
  if (raw && typeof raw === "object" && Object.keys(raw as object).length > 0) {
    const prefs = normalizePreferences(raw);
    if (prefs.scored_categories.length > 0 || prefs.access_categories.length > 0) {
      return prefs;
    }
  }
  const legacy = Array.isArray(profile?.target_opportunity_types)
    ? (profile!.target_opportunity_types as string[])
    : [];
  return {
    ...DEFAULT_PREFERENCES,
    scored_categories: legacy,
    access_categories: [],
    // Legacy users keep their profile-page transfer intent working.
    transfer: {
      planning: Boolean(profile?.intended_school),
      country: null,
      school: (profile?.intended_school as string) || null,
      schools: profile?.intended_school ? [String(profile.intended_school)] : [],
    },
  };
}
