/**
 * Deterministic scoring pre-filter.
 *
 * The user's plan buys a fixed number of Gemini-scored opportunities per
 * month. This module decides WHICH opportunities deserve those slots: every
 * eligible opportunity is ranked by predicted match quality, and only the
 * top N (per plan, with per-category caps) are sent to the model. A user
 * must see their best available matches — not the first N rows that happened
 * to pass a boolean filter.
 */
import { normalizeOpportunityType } from "@/lib/discovery/taxonomy";
import { evaluateEligibility } from "@/lib/matching/eligibility";
import type { PlanLimits } from "@/lib/billing/plans";

type Row = Record<string, unknown>;

export type ExperienceSummaryLike = {
  section_key: string;
  experience_title?: string | null;
  organization?: string | null;
  summary?: string | null;
  evidence_tags?: string[] | null;
  notable_metrics?: string[] | null;
};

function normalizeText(value: unknown) {
  return String(value || "").toLowerCase().trim();
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

const OPEN_VALUES = ["any", "all", "global", "open", "not specified", "all fields", "international"];

function isOpenList(items: unknown) {
  const values = normalizeList(items);
  if (values.length === 0) return true;
  return values.some((item) => OPEN_VALUES.includes(item));
}

// ---------------------------------------------------------------------------
// Type matching
// ---------------------------------------------------------------------------

export function getRankedCategories(profile: Row, planLimits: PlanLimits): string[] {
  const selected = normalizeList(profile.target_opportunity_types)
    .map((value) => normalizeOpportunityType(value))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  const unique = Array.from(new Set(selected));

  if (planLimits.rankedCategoryLimit === "all") return unique;
  if (typeof planLimits.rankedCategoryLimit === "number") {
    return unique.slice(0, planLimits.rankedCategoryLimit);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Eligibility checks (hard gates — an ineligible opportunity never spends quota)
// ---------------------------------------------------------------------------

const EDUCATION_ALIASES: Record<string, string[]> = {
  high_school: ["high school", "high_school", "secondary"],
  undergraduate: ["undergraduate", "undergrad", "college", "university student", "bachelor"],
  transfer_student: ["transfer"],
  masters: ["masters", "master's", "master", "graduate"],
  phd: ["phd", "doctoral", "doctorate", "graduate"],
  medical_student: ["medical", "md", "medical student"],
  law_student: ["law", "jd", "law student"],
  mba: ["mba", "business school"],
  professional_student: ["professional"],
  recent_graduate: ["recent graduate", "alumni", "early career"],
  early_career: ["early career", "young professional"],
};

function normalizeEducationLevel(value: unknown) {
  return normalizeText(value).replace(/[\s-]+/g, "_").replace(/[^a-z_]/g, "");
}

export function educationMatches(profile: Row, opportunity: Row) {
  const eligible = normalizeList(opportunity.eligible_education_levels);
  if (eligible.length === 0 || isOpenList(eligible)) return true;

  const level = normalizeEducationLevel(
    profile.education_level || profile.student_status
  );
  if (!level) return true;

  const aliases = EDUCATION_ALIASES[level] || [level.replace(/_/g, " ")];
  return eligible.some((item) =>
    aliases.some((alias) => item.includes(alias) || alias.includes(item))
  );
}

export function educationMatchStrength(profile: Row, opportunity: Row): number {
  const eligible = normalizeList(opportunity.eligible_education_levels);
  if (eligible.length === 0 || isOpenList(eligible)) return 6; // open to everyone
  return educationMatches(profile, opportunity) ? 14 : 0; // direct listing
}

export function regionMatches(profile: Row, opportunity: Row) {
  const opportunityCountry = normalizeText(opportunity.country);
  const eligibleCountries = normalizeList(opportunity.eligible_countries);
  const regions = [opportunityCountry, ...eligibleCountries].filter(Boolean);

  if (regions.length === 0) return true;
  if (regions.some((region) => OPEN_VALUES.includes(region))) return true;

  const userPlaces = [
    normalizeText(profile.country_of_study),
    normalizeText(profile.nationality),
    ...normalizeList(profile.preferred_regions),
  ].filter(Boolean);

  if (userPlaces.length === 0) return true;

  return userPlaces.some((place) =>
    regions.some((region) => region.includes(place) || place.includes(region))
  );
}

export function regionMatchStrength(profile: Row, opportunity: Row): number {
  const opportunityCountry = normalizeText(opportunity.country);
  const eligibleCountries = normalizeList(opportunity.eligible_countries);
  const regions = [opportunityCountry, ...eligibleCountries].filter(Boolean);

  if (regions.length === 0 || regions.some((r) => OPEN_VALUES.includes(r))) {
    return 6;
  }

  const study = normalizeText(profile.country_of_study);
  const nationality = normalizeText(profile.nationality);

  if (study && regions.some((r) => r.includes(study) || study.includes(r))) {
    return 12; // opportunity is in/for the user's country of study
  }
  if (
    nationality &&
    regions.some((r) => r.includes(nationality) || nationality.includes(r))
  ) {
    return 10;
  }
  return 0;
}

const FIELD_FAMILIES: Record<string, string[]> = {
  stem: [
    "computer science", "software engineering", "computer engineering", "data science",
    "cybersecurity", "information systems", "engineering", "electrical engineering",
    "mechanical engineering", "civil engineering", "chemical engineering",
    "biomedical engineering", "mathematics", "statistics", "physics", "chemistry",
    "biology", "biochemistry", "biomedical sciences", "neuroscience", "health sciences",
    "medicine", "nursing", "public health", "kinesiology", "environmental science",
    "stem",
  ],
  "social sciences": [
    "economics", "political science", "psychology", "sociology", "anthropology",
    "international relations", "international development", "public policy",
    "public administration", "criminology", "social work",
  ],
  "health sciences": [
    "biology", "biochemistry", "biomedical sciences", "health sciences", "medicine",
    "nursing", "public health", "pharmacy", "dentistry", "neuroscience", "kinesiology",
  ],
};

function getFieldFamilies(field: unknown): string[] {
  const normalized = normalizeText(field);
  if (!normalized) return [];
  const families = [normalized];
  for (const [family, members] of Object.entries(FIELD_FAMILIES)) {
    if (members.includes(normalized)) families.push(family);
  }
  return families;
}

export function fieldMatches(profile: Row, opportunity: Row) {
  if (isOpenList(opportunity.eligible_fields)) return true;
  const eligibleFields = normalizeList(opportunity.eligible_fields);
  const profileFields = getFieldFamilies(
    profile.field_of_study || profile.field_of_study_other
  );
  if (profileFields.length === 0 || eligibleFields.length === 0) return true;
  return profileFields.some((pf) =>
    eligibleFields.some((ef) => pf === ef || pf.includes(ef) || ef.includes(pf))
  );
}

export function fieldMatchStrength(profile: Row, opportunity: Row): number {
  const eligibleFields = normalizeList(opportunity.eligible_fields);
  if (eligibleFields.length === 0 || isOpenList(opportunity.eligible_fields)) {
    return 6;
  }
  const direct = normalizeText(profile.field_of_study || profile.field_of_study_other);
  if (
    direct &&
    eligibleFields.some((ef) => ef === direct || ef.includes(direct) || direct.includes(ef))
  ) {
    return 24; // exact field alignment is the strongest match signal we have
  }
  const families = getFieldFamilies(direct).slice(1); // family names only
  if (families.some((family) => eligibleFields.some((ef) => ef.includes(family)))) {
    return 14;
  }
  return 0;
}

export function deadlineIsActive(opportunity: Row) {
  const deadline = normalizeText(opportunity.deadline);
  if (!deadline) {
    // No deadline: only rolling opportunities remain actionable.
    return normalizeText(opportunity.application_status) === "rolling";
  }
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed >= today;
}

/** Deadline actionability: enough runway to apply well, not so far it stalls. */
function deadlineActionability(opportunity: Row): number {
  const deadline = normalizeText(opportunity.deadline);
  if (!deadline) return 0;
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return 0;
  const days = Math.ceil((parsed.getTime() - Date.now()) / 86400000);
  if (days < 0) return -20;
  if (days < 7) return -6; // usually too late to submit strong materials
  if (days <= 120) return 8; // the sweet spot
  if (days <= 240) return 4;
  return 0;
}

// ---------------------------------------------------------------------------
// Experience-evidence alignment
// ---------------------------------------------------------------------------

function getOpportunityCriteriaText(opportunity: Row) {
  const factors = Array.isArray(opportunity.competitiveness_factors)
    ? (opportunity.competitiveness_factors as unknown[]).join(" ")
    : "";
  return normalizeText(
    [factors, opportunity.title, opportunity.ai_summary, opportunity.description].join(" ")
  );
}

const STOP_TOKENS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "were", "will",
  "have", "has", "had", "not", "you", "your", "their", "they", "them", "who", "which",
  "students", "student", "program", "programs", "opportunity", "opportunities",
  "application", "applications", "apply", "deadline", "must", "should", "can",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length >= 4 && !STOP_TOKENS.has(t))
  );
}

export function buildExperienceTokens(summaries: ExperienceSummaryLike[]): Set<string> {
  const text = summaries
    .map((s) =>
      [
        s.experience_title,
        s.organization,
        s.summary,
        ...(s.evidence_tags || []),
        ...(s.notable_metrics || []),
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join(" ");
  return tokenize(text);
}

function experienceKeywordOverlap(
  experienceTokens: Set<string>,
  opportunity: Row
): number {
  if (!experienceTokens.size) return 0;
  const criteriaTokens = tokenize(getOpportunityCriteriaText(opportunity));
  if (!criteriaTokens.size) return 0;
  let shared = 0;
  for (const token of criteriaTokens) {
    if (experienceTokens.has(token)) shared++;
  }
  // 10+ shared meaningful tokens = full credit.
  return Math.min(20, Math.round((shared / 10) * 20));
}

const EVIDENCE_CRITERIA = [
  {
    type: "leadership",
    keywords: ["leadership", "leader", "initiative", "student leader", "community leader"],
    weight: 10,
  },
  {
    type: "research",
    keywords: ["research", "lab", "publication", "poster", "faculty mentor"],
    weight: 10,
  },
  {
    type: "volunteering",
    keywords: ["volunteer", "service", "community service", "community impact"],
    weight: 8,
  },
  {
    type: "awards",
    keywords: ["award", "honor", "honour", "recognition", "achievement"],
    weight: 6,
  },
  {
    type: "financial_need",
    keywords: ["financial need", "need-based", "low income", "demonstrated need"],
    weight: 8,
  },
  {
    type: "projects",
    keywords: ["project", "portfolio", "startup", "prototype", "software", "technical"],
    weight: 6,
  },
];

function profileHasEvidence(profile: Row, evidenceType: string) {
  const listLength = (value: unknown) => (Array.isArray(value) ? value.length : 0);
  switch (evidenceType) {
    case "leadership":
      return Boolean(profile.has_leadership) || listLength(profile.leadership_experiences) > 0;
    case "research":
      return Boolean(profile.has_research) || listLength(profile.research_experiences) > 0;
    case "volunteering":
      return Boolean(profile.has_volunteering) || listLength(profile.volunteer_experiences) > 0;
    case "awards":
      return Boolean(profile.has_awards) || listLength(profile.awards) > 0;
    case "financial_need":
      return Boolean(profile.financial_need);
    case "projects":
      return listLength(profile.work_project_experiences) > 0;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Hard eligibility: is this opportunity worth ANY quota for this user? */
export function shouldScoreOpportunity(
  profile: Row,
  opportunity: Row,
  rankedCategories: string[]
) {
  const type = normalizeOpportunityType(opportunity.type);
  if (!type) return false;
  if (rankedCategories.length > 0 && !rankedCategories.includes(type)) return false;

  // Positively contradicted structured criteria (wrong citizenship, wrong
  // school, GPA below a stated floor) never spend a scoring slot. Unknowns
  // pass — missing profile data is not ineligibility.
  const eligibility = evaluateEligibility({
    profile,
    criteria: opportunity.eligibility_criteria,
  });
  if (eligibility.status === "ineligible") return false;

  return (
    deadlineIsActive(opportunity) &&
    regionMatches(profile, opportunity) &&
    educationMatches(profile, opportunity) &&
    fieldMatches(profile, opportunity)
  );
}

/**
 * Predicted match quality. Higher = more deserving of a Gemini scoring slot.
 * Components: field/education/region alignment, experience-criteria keyword
 * overlap, evidence coverage, GPA vs merit language, deadline actionability,
 * and the user's own category preference order.
 */
export function criteriaPriorityScore({
  profile,
  opportunity,
  rankedCategories,
  experienceTokens,
}: {
  profile: Row;
  opportunity: Row;
  rankedCategories: string[];
  experienceTokens: Set<string>;
}) {
  let priority = 0;

  priority += fieldMatchStrength(profile, opportunity);
  priority += educationMatchStrength(profile, opportunity);
  priority += regionMatchStrength(profile, opportunity);
  priority += deadlineActionability(opportunity);
  priority += experienceKeywordOverlap(experienceTokens, opportunity);

  // User's own preference order among their ranked categories.
  const type = normalizeOpportunityType(opportunity.type);
  const typeIndex = type ? rankedCategories.indexOf(type) : -1;
  if (typeIndex === 0) priority += 6;
  else if (typeIndex === 1) priority += 4;
  else if (typeIndex >= 2) priority += 2;

  // Evidence the opportunity asks for vs. evidence the profile has.
  const criteriaText = getOpportunityCriteriaText(opportunity);
  for (const criterion of EVIDENCE_CRITERIA) {
    const mentioned = criterion.keywords.some((k) => criteriaText.includes(k));
    if (!mentioned) continue;
    if (profileHasEvidence(profile, criterion.type)) priority += criterion.weight;
    else priority -= Math.round(criterion.weight / 2);
  }

  // GPA vs merit language.
  const gpa = Number(profile.gpa);
  const mentionsMerit =
    criteriaText.includes("gpa") ||
    criteriaText.includes("academic excellence") ||
    criteriaText.includes("academic merit") ||
    criteriaText.includes("high academic");
  if (mentionsMerit && !Number.isNaN(gpa) && gpa > 0) {
    if (gpa >= 3.7) priority += 12;
    else if (gpa >= 3.3) priority += 6;
    else priority -= 8;
  }

  // Small nudges: high reward and low effort are better uses of a slot.
  if (normalizeText(opportunity.reward_level) === "high") priority += 3;
  if (normalizeText(opportunity.effort_level) === "low") priority += 2;

  // Confirmed structured eligibility is a strong signal the slot pays off —
  // a scholarship whose citizenship, school, and GPA checks all pass is a
  // far better bet than one we merely can't rule out.
  const eligibility = evaluateEligibility({
    profile,
    criteria: opportunity.eligibility_criteria,
  });
  if (eligibility.status === "eligible") priority += 10;
  else if (eligibility.status === "likely_eligible") priority += 5;

  return priority;
}

/**
 * Allocate the month's remaining scoring slots to the most promising
 * opportunities, respecting per-category caps. Returns rows in priority order.
 */
export function allocateScoringSlots<T extends Row>({
  candidates,
  totalRemaining,
  perCategoryRemaining,
}: {
  candidates: Array<{ opportunity: T; priority: number }>;
  totalRemaining: number;
  perCategoryRemaining: Record<string, number>;
}): T[] {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  const chosen: T[] = [];
  const categoryUsed: Record<string, number> = {};

  for (const { opportunity } of sorted) {
    if (chosen.length >= totalRemaining) break;
    const type = normalizeOpportunityType(opportunity.type) || "unknown";
    const capForType = perCategoryRemaining[type];
    if (capForType !== undefined) {
      const used = categoryUsed[type] || 0;
      if (used >= capForType) continue;
      categoryUsed[type] = used + 1;
    }
    chosen.push(opportunity);
  }

  return chosen;
}
