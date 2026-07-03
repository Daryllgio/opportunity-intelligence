export type DiscoveryCampaignSeed = {
  query: string;
  opportunity_type:
    | "scholarship"
    | "fellowship"
    | "research_program"
    | "grant"
    | "competition"
    | "leadership_program"
    | "career_development_program"
    | "pipeline_program";
  education_level:
    | "high_school"
    | "undergraduate"
    | "masters"
    | "phd"
    | "medical_student"
    | "law_student"
    | "mba";
  field_area: string;
  region: "united_states" | "canada";
  max_results: number;
  status: "active";
};

type CampaignTemplate = {
  opportunity_type: DiscoveryCampaignSeed["opportunity_type"];
  field_area: string;
  education_levels: DiscoveryCampaignSeed["education_level"][];
  phrases: string[];
};

const EDUCATION_TERMS: Record<DiscoveryCampaignSeed["education_level"], string[]> = {
  high_school: ["high school students", "secondary students"],
  undergraduate: ["undergraduate students", "college students", "university students"],
  masters: ["masters students", "graduate students"],
  phd: ["phd students", "doctoral students"],
  medical_student: ["medical students", "md students"],
  law_student: ["law students", "jd students"],
  mba: ["mba students", "business students"],
};

const REGION_CONFIG: Record<
  DiscoveryCampaignSeed["region"],
  { regionTerm: string; domainHints: string[] }
> = {
  united_states: {
    regionTerm: "United States",
    domainHints: ["site:edu", "site:gov", "site:org", "site:com"],
  },
  canada: {
    regionTerm: "Canada",
    domainHints: ["site:ca", "site:edu", "site:org", "site:com"],
  },
};

// Curated subset of the worst aggregators to exclude at query time. The full
// canonical aggregator list lives in source-quality.ts (`aggregatorDomains`);
// this is intentionally short to keep Brave search queries within length limits.
const NEGATIVE_AGGREGATORS =
  "-scholarships.com -fastweb -bold.org -unigo -niche -cappex -scholarshiproar -studentscholarships";

// Every phrase is anchored to the current application cycle. Expired
// opportunities were the biggest source of wasted pipeline work — year-anchored
// queries strongly bias Brave toward pages for cycles that are open right now.
const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    opportunity_type: "scholarship",
    field_area: "all_fields",
    education_levels: ["high_school", "undergraduate", "masters", "phd", "medical_student", "law_student", "mba"],
    phrases: [
      'scholarship application deadline 2026',
      'scholarship "now accepting applications" 2026',
      'scholarship apply 2026-2027 eligibility',
    ],
  },
  {
    opportunity_type: "research_program",
    field_area: "research",
    education_levels: ["high_school", "undergraduate", "masters", "phd", "medical_student"],
    phrases: [
      'summer research program 2026 application deadline',
      'research program "apply now" 2026 students',
      'research internship program 2026 application',
    ],
  },
  {
    opportunity_type: "fellowship",
    field_area: "all_fields",
    education_levels: ["undergraduate", "masters", "phd", "medical_student", "law_student", "mba"],
    phrases: [
      'fellowship application deadline 2026',
      'fellowship "now accepting applications" 2026',
      'graduate fellowship 2026-2027 application',
    ],
  },
  {
    opportunity_type: "grant",
    field_area: "all_fields",
    education_levels: ["undergraduate", "masters", "phd", "medical_student", "law_student", "mba"],
    phrases: [
      'student grant 2026 application eligibility',
      'research grant 2026 students application deadline',
      'travel grant 2026 students apply',
    ],
  },
  // Competitions need concrete format words — generic "student competition"
  // queries return scholarship-directory noise that the intake gate then has
  // to throw away. Named formats find real, registrable events.
  {
    opportunity_type: "competition",
    field_area: "all_fields",
    education_levels: ["high_school", "undergraduate", "masters", "mba"],
    phrases: [
      'essay contest 2026 deadline submit',
      'case competition 2026 registration',
      'innovation challenge 2026 students apply',
      'business plan competition 2026 registration',
      'hackathon 2026 students register',
      'STEM competition 2026 application deadline',
    ],
  },
  {
    opportunity_type: "leadership_program",
    field_area: "leadership",
    education_levels: ["high_school", "undergraduate", "masters", "mba"],
    phrases: [
      'youth leadership program 2026 application',
      'leadership academy 2026 apply deadline',
      'leadership institute summer 2026 application',
      'leadership development program 2026 apply students',
    ],
  },
  {
    opportunity_type: "career_development_program",
    field_area: "career_development",
    education_levels: ["high_school", "undergraduate", "masters", "medical_student", "law_student", "mba"],
    phrases: [
      'career development program 2026 students application',
      'professional development program 2026 apply',
      'early career program 2026 students application deadline',
    ],
  },
  {
    opportunity_type: "pipeline_program",
    field_area: "pipeline",
    education_levels: ["high_school", "undergraduate", "medical_student", "law_student"],
    phrases: [
      'pipeline program 2026 students application',
      'pre-med pipeline program 2026 apply',
      'pathway program 2026 students application deadline',
      'diversity pipeline program 2026 apply',
    ],
  },
];

function buildQuery({
  domainHint,
  educationTerm,
  phrase,
  regionTerm,
}: {
  domainHint: string;
  educationTerm: string;
  phrase: string;
  regionTerm: string;
}) {
  const shouldIncludeRegion =
    domainHint === "site:com" || domainHint === "site:org";

  return [
    domainHint,
    phrase,
    educationTerm,
    shouldIncludeRegion ? regionTerm : "",
    NEGATIVE_AGGREGATORS,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCampaignSeeds() {
  const seeds: DiscoveryCampaignSeed[] = [];
  const seenQueries = new Set<string>();

  for (const template of CAMPAIGN_TEMPLATES) {
    for (const region of ["united_states", "canada"] as const) {
      const regionConfig = REGION_CONFIG[region];

      for (const educationLevel of template.education_levels) {
        const educationTerms = EDUCATION_TERMS[educationLevel];

        for (const phrase of template.phrases.slice(0, 2)) {
          for (const educationTerm of educationTerms.slice(0, 1)) {
            for (const domainHint of regionConfig.domainHints) {
              const query = buildQuery({
                domainHint,
                educationTerm,
                phrase,
                regionTerm: regionConfig.regionTerm,
              });

              if (seenQueries.has(query)) continue;
              seenQueries.add(query);

              seeds.push({
                query,
                opportunity_type: template.opportunity_type,
                education_level: educationLevel,
                field_area: template.field_area,
                region,
                max_results: 8,
                status: "active",
              });
            }
          }
        }
      }
    }
  }

  return seeds;
}

export const DISCOVERY_CAMPAIGN_SEEDS: DiscoveryCampaignSeed[] = buildCampaignSeeds();
