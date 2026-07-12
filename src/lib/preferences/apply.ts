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
  research_program: {
    summer_research: ["summer research", "summer student", "reu", "summer studentship", "summer fellowship", "summer program"],
    academic_year_research: ["academic year", "term-time", "during the semester", "part-time research", "research assistant position"],
    research_abroad: ["abroad", "international research", "overseas", "global research"],
    thesis_project_funding: ["thesis", "dissertation", "capstone", "your own research", "student-led research", "independent research"],
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
 * ALL sub-types a row plausibly belongs to — a data-science case competition
 * is BOTH case_competition and data_science_ai, and must reach a student who
 * picked either. Multi-tagging is what makes sub-type EXCLUSION safe: an
 * imperfect partition produces extra inclusion, never a lost opportunity.
 * Empty result = unclassifiable — callers must fail open.
 */
export function classifyOpportunitySubtypes(row: Row): string[] {
  const category = String(row.type || "");
  const known = new Set((CATEGORY_SUBTYPES[category] || []).map((o) => o.value));
  const found = new Set<string>();

  const attributes = (row.attributes || {}) as Row;
  const captured = String(attributes.subtype || "").trim();
  if (captured && known.has(captured)) found.add(captured);

  const signals = SUBTYPE_SIGNALS[category];
  if (signals) {
    const haystack = normalizeText(
      `${row.title || ""} ${row.ai_summary || ""} ${String(row.description || "").slice(0, 600)}`
    );
    for (const [subtype, keywords] of Object.entries(signals)) {
      if (keywords.some((keyword) => haystack.includes(keyword))) found.add(subtype);
    }
  }
  return Array.from(found);
}

/** First classified sub-type (display convenience). */
export function classifyOpportunitySubtype(row: Row): string | null {
  return classifyOpportunitySubtypes(row)[0] || null;
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
  undergraduate: ["undergraduate"],
  masters: ["masters", "graduate"],
  masters_other: ["masters", "graduate"],
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

// What the award FUNDS is a different question from who may apply: McCall
// MacBain is applied to by final-year undergrads but funds a master's at
// McGill; Knight-Hennessy funds Stanford graduate degrees. A junior who
// never asked for graduate-study funding shouldn't see either. These
// signals detect graduate/professional STUDY as the thing being funded.
const GRAD_STUDY_SIGNALS = [
  "graduate degree", "graduate program", "graduate studies", "graduate study",
  "graduate school", "postgraduate", "master's program", "master's degree",
  "masters program", "masters degree", "master of", "doctoral program",
  "doctoral degree", "phd program", "ph.d. program", "mba", "law school",
  "juris doctor", "medical school", "md program", "begin graduate",
  "enrolling in a graduate", "pursue a graduate", "pursue a master",
  "pursue a doctora",
];

/** Which degree types the award's own words say it funds. */
function fundedStudyTypes(row: Row): Set<NextLevelType> {
  const attributes = (row.attributes || {}) as Row;
  const criteria = Array.isArray(row.eligibility_criteria)
    ? (row.eligibility_criteria as Row[]).map((c) => String(c.requirement || "")).join(" ")
    : "";
  const haystack = normalizeText(
    `${row.title || ""} ${row.ai_summary || ""} ${criteria} ${attributes.eligibility_text || ""}`
  ).replace(/under\s?graduate\w*/g, " ");
  const found = new Set<NextLevelType>();
  if (/master'?s|master of|masters/.test(haystack)) found.add("masters");
  if (/doctoral|ph\.?d/.test(haystack)) found.add("phd");
  if (/\bmba\b|business school/.test(haystack)) found.add("mba");
  if (/law school|juris doctor|\bjd\b/.test(haystack)) found.add("jd");
  if (/medical school|\bmd program\b/.test(haystack)) found.add("md");
  if (/graduate degree|graduate program|graduate studies|graduate school|postgraduate/.test(haystack)) {
    found.add("masters");
    found.add("phd");
  }
  return found;
}

function fundsGraduateStudy(row: Row): boolean {
  const attributes = (row.attributes || {}) as Row;
  const criteria = Array.isArray(row.eligibility_criteria)
    ? (row.eligibility_criteria as Row[]).map((c) => String(c.requirement || "")).join(" ")
    : "";
  // "undergraduate studies" contains "graduate studies" — strip the word
  // before matching so a high-school-to-undergrad scholarship (Pearson)
  // never reads as graduate funding. Same crosstalk class as
  // post-secondary/secondary.
  const haystack = normalizeText(
    `${row.title || ""} ${row.ai_summary || ""} ${criteria} ${attributes.eligibility_text || ""}`
  ).replace(/under\s?graduate\w*/g, " ");
  return GRAD_STUDY_SIGNALS.some((signal) => haystack.includes(signal));
}

/**
 * True when this row belongs to a level ABOVE the student's current one —
 * either its stated applicant levels all sit higher (a PhD-only fellowship
 * for an undergrad), or the thing it FUNDS is graduate/professional study
 * and the student isn't a graduate student. Rows with no recognizable level
 * story return false (fail open — eligibility rules handle the rest).
 */
export function isNextLevelOpportunity(profile: Row, row: Row): boolean {
  const userLevels = profileCanonicalLevels(profile);
  if (userLevels.length === 0) return false;
  const userRank = Math.max(...userLevels.map((level) => LEVEL_ORDER[level] || 0));

  const levels = rowLevels(row).filter((level) => level !== "any_level");
  if (levels.length > 0 && levels.every((level) => (LEVEL_ORDER[level] || 0) > userRank)) {
    return true;
  }

  // Funded-study check: below graduate rank and the award funds grad study.
  if (userRank < 3 && userRank > 0 && fundsGraduateStudy(row)) {
    return true;
  }

  return false;
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

  // Sub-type EXCLUSION: unselected sub-types are ones the student is not
  // interested in — they don't show. Safe because classification is
  // multi-tag (any overlap keeps the row) and unclassifiable rows always
  // fail open. Leave-all-unselected still means every kind.
  const wanted = preferences.subtypes[category];
  if (wanted && wanted.length > 0) {
    const subtypes = classifyOpportunitySubtypes(row);
    if (subtypes.length > 0 && !subtypes.some((s) => wanted.includes(s))) {
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
    // Opted in with specific degree types: the row must plausibly serve one
    // — through its stated levels OR through what it funds ("master's at
    // McGill" serves a masters-wanter even though applicants are undergrads).
    if (preferences.next_level.types.length > 0) {
      const allowed = new Set(
        preferences.next_level.types.flatMap((type) => NEXT_LEVEL_MAP[type])
      );
      const levels = rowLevels(row);
      const levelServes = levels.some(
        (level) => allowed.has(level) || level === "graduate" || level === "any_level"
      );
      const funded = fundedStudyTypes(row);
      const fundedServes =
        preferences.next_level.types.some((type) => funded.has(type)) ||
        (funded.has("masters") && allowed.has("graduate" as never));
      if (!levelServes && !fundedServes && funded.size > 0) {
        return {
          excluded: true,
          reason: "Not among the next-level degree types you picked.",
        };
      }
      if (!levelServes && funded.size === 0) {
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
    ...preferences.transfer.schools,
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
    const subtypes = classifyOpportunitySubtypes(row);
    if (subtypes.some((s) => wanted.includes(s))) boost += 10;
  }

  return boost;
}
