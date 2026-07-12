export const OPPORTUNITY_TYPES = [
  "scholarship",
  "fellowship",
  "research_program",
  "grant",
  "competition",
  "leadership_program",
  "career_development_program",
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  scholarship: "Scholarship",
  fellowship: "Fellowship",
  research_program: "Research Program",
  grant: "Grant",
  competition: "Competition",
  leadership_program: "Leadership Program",
  career_development_program: "Career Development Program",
};

/**
 * Final user-facing copy for each category. Examples are illustrative, never
 * exhaustive — every description says so, because each category is broader
 * than any list.
 */
export const OPPORTUNITY_TYPE_DESCRIPTIONS: Record<OpportunityType, string> = {
  scholarship:
    "Money for your education: merit awards, need-based aid, essay scholarships, identity- and field-specific awards, and more.",
  fellowship:
    "Funded programs that invest in you: research fellowships, public-service and policy fellowships, graduate funding, and more.",
  research_program:
    "Hands-on research experience: summer research programs, lab placements, mentored projects, field work, and more.",
  grant:
    "Funding for something you want to do: project grants, travel and conference funding, startup and community grants, and more.",
  competition:
    "Win recognition and prizes: hackathons, case competitions, essay contests, pitch and innovation challenges, science fairs, and more.",
  leadership_program:
    "Selective programs that develop leaders: youth councils, civic and global leadership institutes, ambassador programs, and more.",
  career_development_program:
    "Cohort-based professional preparation with its own application: consulting and finance prep, pre-med/pre-law and graduate-school pathways, diversity career programs, and more.",
};

export const EDUCATION_LEVELS = [
  "high_school",
  "undergraduate",
  "transfer_student",
  "masters",
  "phd",
  "medical_student",
  "law_student",
  "mba",
  "professional_student",
  "recent_graduate",
  "early_career",
] as const;

export const REGIONS = ["united_states", "canada"] as const;

export const STUDENT_SEGMENTS = [
  "domestic_students",
  "international_students",
  "first_generation_students",
  "low_income_students",
  "underrepresented_students",
  "black_students",
  "indigenous_students",
  "latino_hispanic_students",
  "women",
  "women_in_stem",
  "students_with_disabilities",
  "immigrant_refugee_students",
  "daca_undocumented_students",
  "veterans_military_connected_students",
  "rural_students",
  "community_college_students",
] as const;

export const FIELD_AREAS = [
  "all_fields",
  "stem",
  "computer_science",
  "engineering",
  "data_science_ai",
  "cybersecurity",
  "medicine_health",
  "nursing",
  "public_health",
  "biology",
  "chemistry",
  "neuroscience",
  "business",
  "finance",
  "economics",
  "law",
  "public_policy",
  "international_relations",
  "social_sciences",
  "humanities",
  "arts",
  "education",
  "environmental_studies",
] as const;

export const GRANT_SUBTYPES = [
  "research_grants",
  "community_impact_grants",
  "startup_entrepreneurship_grants",
  "creative_grants",
  "public_service_grants",
  "social_innovation_grants",
  "academic_project_grants",
  "conference_research_presentation_grants",
] as const;

export const COMPETITION_SUBTYPES = [
  "case_competitions",
  "pitch_competitions",
  "hackathons",
  "research_poster_competitions",
  "essay_writing_competitions",
  "innovation_challenges",
  "policy_debate_moot_court_competitions",
  "stem_science_competitions",
  "arts_design_media_competitions",
  "business_plan_competitions",
] as const;

export const LEADERSHIP_SUBTYPES = [
  "civic_leadership",
  "public_service_leadership",
  "global_diplomacy_leadership",
  "social_impact_leadership",
  "youth_leadership",
  "entrepreneurship_leadership",
  "community_leadership",
  "policy_government_leadership",
  "diversity_leadership_programs",
] as const;

export const CAREER_DEVELOPMENT_SUBTYPES = [
  "pre_med_health_pipeline",
  "pre_law_pipeline",
  "business_finance_programs",
  "consulting_corporate_leadership",
  "public_policy_government_programs",
  "graduate_school_preparation",
  "diversity_career_programs",
  "technical_ai_data_programs",
  "professional_school_preparation",
] as const;

export const CATEGORY_FOLLOW_UPS = {
  grant: GRANT_SUBTYPES,
  competition: COMPETITION_SUBTYPES,
  leadership_program: LEADERSHIP_SUBTYPES,
  career_development_program: CAREER_DEVELOPMENT_SUBTYPES,
} as const;

export function isSupportedOpportunityType(value: string) {
  return OPPORTUNITY_TYPES.includes(value as OpportunityType);
}

/**
 * Canonicalize any type-ish string ("Research Opportunity", "research",
 * "leadership-program") to one of OPPORTUNITY_TYPES, or null if it cannot be
 * mapped. This is the ONLY normalizer — the DB, extraction, and UI must all
 * agree on these values (legacy rows used e.g. "research").
 */
export function normalizeOpportunityType(value: unknown): OpportunityType | null {
  const raw = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");

  if ((OPPORTUNITY_TYPES as readonly string[]).includes(raw)) {
    return raw as OpportunityType;
  }

  if (raw.includes("scholar")) return "scholarship";
  if (raw.includes("fellow")) return "fellowship";
  if (raw.includes("research")) return "research_program";
  if (raw.includes("grant")) return "grant";
  if (raw.includes("competition") || raw.includes("challenge")) {
    return "competition";
  }
  if (raw.includes("leadership")) return "leadership_program";
  // "Pipeline program" was retired as a category (2026-07-12): every pipeline
  // is really a scholarship/fellowship/research/career-development program
  // that targets specific students — the targeting lives in eligibility
  // criteria, not in a category. Legacy values fold into career development;
  // re-extraction assigns the true category per row.
  if (raw.includes("pipeline")) return "career_development_program";
  if (raw.includes("career")) return "career_development_program";

  return null;
}
