/**
 * Applying preferences to the catalog — filtering and prioritization.
 *
 * Preferences narrow WITHIN what the student may see; they never override
 * eligibility, and unknown opportunity data always fails open inside an
 * allowed category (a competition we can't sub-classify still shows to a
 * competitions-selected student).
 *
 * The one hard preference gate is level direction: opportunities whose
 * stated levels are ALL above the student's current level are hidden unless
 * the student opted into next-level opportunities — an undergrad who never
 * asked for graduate programs never sees one (the Knight-Hennessy-to-a-
 * junior problem).
 */
import {
  levelsFromText,
  profileCanonicalLevels,
  type CanonicalEducationLevel,
} from "@/lib/matching/education-levels";
import {
  CATEGORY_SUBTYPES,
  type NextLevelType,
  type StudentPreferences,
} from "@/lib/preferences/types";

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Deterministic sub-type classification (for rows extracted before subtype
// capture existed). Keyword-based, conservative, fail-open (null = unknown).
// ---------------------------------------------------------------------------

const SUBTYPE_SIGNALS: Record<string, Record<string, string[]>> = {
  competition: {
    hackathon: ["hackathon", "hack day", "codefest", "buildathon"],
    case_competition: ["case competition", "case challenge", "consulting competition"],
    essay_writing: ["essay", "writing contest", "poetry", "short story"],
    pitch_startup: ["pitch", "startup competition", "venture", "business plan"],
    science_fair: ["science fair", "science talent", "research competition", "isef"],
    math_olympiad: ["olympiad", "putnam", "math competition", "mathematics competition"],
    coding_contest: ["programming contest", "coding competition", "icpc", "competitive programming"],
    data_science_ai: ["data science", "machine learning challenge", "ai challenge", "kaggle", "datathon"],
    robotics_engineering: ["robotics", "engineering challenge", "design-build", "cansat", "rocketry"],
    debate_moot: ["debate", "moot court", "model un", "model united nations", "mock trial"],
    design_arts: ["design competition", "art competition", "film competition", "photography", "animation"],
    policy_social: ["policy challenge", "social impact challenge", "civic tech", "sustainability challenge"],
    quiz_bowl: ["quiz bowl", "academic bowl", "brain bowl", "trivia championship"],
  },
  career_development_program: {
    mentorship: ["mentorship", "mentoring", "mentor program"],
    insight_program: ["insight program", "spring week", "spring insight", "discovery day", "early insight"],
    pre_professional: ["career prep", "pipeline program", "diversity program", "fellowship program for underrepresented"],
    bootcamp_upskilling: ["bootcamp", "boot camp", "upskilling", "intensive training"],
    networking_conference: ["conference", "summit", "networking"],
    certification_training: ["certification", "certificate program", "training program"],
  },
  leadership_program: {
    civic_community: ["civic", "community leadership", "public service"],
    global_international: ["global leader", "international leadership", "exchange"],
    governance_policy: ["governance", "policy", "parliament", "congress", "legislature"],
    youth_leadership: ["youth leadership", "young leaders", "teen leadership"],
    entrepreneurship_leadership: ["entrepreneur", "founder", "venture"],
    campus_leadership: ["student government", "campus leader", "resident advisor"],
  },
  fellowship: {
    research_fellowship: ["research fellowship", "research fellow", "lab", "科研"],
    teaching_fellowship: ["teaching fellow", "teach", "education fellowship"],
    policy_government: ["policy fellow", "government fellow", "public service fellowship", "congressional"],
    social_impact: ["social impact", "nonprofit fellowship", "community fellowship", "public interest"],
    industry_fellowship: ["industry fellowship", "tech fellowship", "engineering fellowship"],
    creative_media: ["journalism", "media fellowship", "writing fellowship", "arts fellowship", "film fellowship"],
  },
};

function normalizeText(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ");
}

/**
 * Best-effort sub-type for a row. Checks the extracted attribute first
 * (attributes.subtype, captured going forward), then keyword signals.
 * Returns null when unknown — callers must fail open.
 */
export function classifyOpportunitySubtype(row: Row): string | null {
  const category = String(row.type || "");
  const attributes = (row.attributes || {}) as Row;
  const captured = String(attributes.subtype || "").trim();
  if (captured && (CATEGORY_SUBTYPES[category] || []).some((o) => o.value === captured)) {
    return captured;
  }

  const signals = SUBTYPE_SIGNALS[category];
  if (!signals) return null;

  const haystack = normalizeText(
    `${row.title || ""} ${row.ai_summary || ""} ${String(row.description || "").slice(0, 600)}`
  );
  for (const [subtype, keywords] of Object.entries(signals)) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return subtype;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Level direction: is this row exclusively ABOVE the student's level?
// ---------------------------------------------------------------------------

const LEVEL_ORDER: Record<CanonicalEducationLevel, number> = {
  high_school: 1,
  undergraduate: 2,
  recent_graduate: 2,
  early_career: 2,
  any_level: 0,
  graduate: 3,
  masters: 3,
  mba: 3,
  law_student: 3,
  medical_student: 3,
  professional_student: 3,
  phd: 4,
  postdoc: 5,
};

const NEXT_LEVEL_MAP: Record<NextLevelType, CanonicalEducationLevel[]> = {
  masters: ["masters", "graduate"],
  phd: ["phd", "graduate"],
  mba: ["mba"],
  jd: ["law_student"],
  md: ["medical_student"],
  professional_other: ["professional_student"],
};

/** Canonical levels a row states, from its levels array (title as backstop). */
function rowLevels(row: Row): CanonicalEducationLevel[] {
  const stated = Array.isArray(row.eligible_education_levels)
    ? (row.eligible_education_levels as unknown[])
    : [];
  const found = new Set<CanonicalEducationLevel>();
  for (const item of stated) {
    for (const level of levelsFromText(item)) found.add(level);
  }
  if (found.size === 0) {
    for (const level of levelsFromText(String(row.title || ""))) found.add(level);
  }
  return Array.from(found);
}

/**
 * True when every stated level of the row sits strictly ABOVE the student's
 * current level — a graduate-only fellowship for an undergraduate. Rows with
 * no recognizable level, or any level at/below the student's, return false
 * (fail open — eligibility rules handle the rest).
 */
export function isNextLevelOpportunity(profile: Row, row: Row): boolean {
  const userLevels = profileCanonicalLevels(profile);
  if (userLevels.length === 0) return false;
  const userRank = Math.max(...userLevels.map((level) => LEVEL_ORDER[level] || 0));

  const levels = rowLevels(row).filter((level) => level !== "any_level");
  if (levels.length === 0) return false;

  return levels.every((level) => (LEVEL_ORDER[level] || 0) > userRank);
}

// ---------------------------------------------------------------------------
// The preference gate for browse/search/scoring candidacy.
// ---------------------------------------------------------------------------

export type PreferenceDecision = {
  excluded: boolean;
  reason: string | null;
};

export function preferenceExcludes(
  profile: Row,
  preferences: StudentPreferences,
  row: Row
): PreferenceDecision {
  const category = String(row.type || "");

  // Access categories: empty = everything.
  if (
    preferences.access_categories.length > 0 &&
    category &&
    !preferences.access_categories.includes(category) &&
    !preferences.scored_categories.includes(category)
  ) {
    return { excluded: true, reason: "Outside your selected categories." };
  }

  // Sub-type narrowing, only when the student narrowed this category and we
  // can classify the row. Unknown sub-type fails open.
  const wanted = preferences.subtypes[category];
  if (wanted && wanted.length > 0) {
    const subtype = classifyOpportunitySubtype(row);
    if (subtype && !wanted.includes(subtype)) {
      return { excluded: true, reason: "Outside the sub-types you picked." };
    }
  }

  // Level direction: next-level rows are opt-in.
  if (isNextLevelOpportunity(profile, row)) {
    if (!preferences.next_level.interested) {
      return {
        excluded: true,
        reason: "A level above yours. Turn on next-level opportunities in preferences to see it.",
      };
    }
    // Opted in with specific degree types: the row must plausibly serve one.
    if (preferences.next_level.types.length > 0) {
      const allowed = new Set(
        preferences.next_level.types.flatMap((type) => NEXT_LEVEL_MAP[type])
      );
      const levels = rowLevels(row);
      const serves = levels.some(
        (level) => allowed.has(level) || level === "graduate" || level === "any_level"
      );
      if (!serves) {
        return {
          excluded: true,
          reason: "Not among the next-level degree types you picked.",
        };
      }
    }
  }

  return { excluded: false, reason: null };
}

/**
 * Priority boost from preferences for the scoring pre-filter: target and
 * transfer schools float to the top, preferred sub-types rank higher.
 */
export function preferencePriorityBoost(
  preferences: StudentPreferences,
  row: Row
): number {
  let boost = 0;

  const schoolTargets = [
    ...preferences.next_level.target_schools,
    preferences.transfer.school || "",
  ]
    .map((school) => normalizeText(school))
    .filter(Boolean);

  if (schoolTargets.length > 0) {
    const haystack = normalizeText(`${row.title || ""} ${row.provider || ""}`);
    if (schoolTargets.some((school) => school && haystack.includes(school))) {
      boost += 18; // an opportunity at a school the student is aiming for
    }
  }

  const category = String(row.type || "");
  const wanted = preferences.subtypes[category];
  if (wanted && wanted.length > 0) {
    const subtype = classifyOpportunitySubtype(row);
    if (subtype && wanted.includes(subtype)) boost += 10;
  }

  if (preferences.location.countries.length > 0) {
    const rowCountry = normalizeText(row.country);
    if (
      rowCountry &&
      preferences.location.countries.some((country) =>
        rowCountry.includes(normalizeText(country))
      )
    ) {
      boost += 6;
    }
  }

  return boost;
}
