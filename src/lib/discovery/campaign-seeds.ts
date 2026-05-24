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

const NEGATIVE_AGGREGATORS =
  "-scholarships.com -fastweb -bold.org -unigo -niche -cappex -scholarshiproar -studentscholarships";

const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    opportunity_type: "scholarship",
    field_area: "all_fields",
    education_levels: ["high_school", "undergraduate", "masters", "phd", "medical_student", "law_student", "mba"],
    phrases: [
      'scholarship application deadline',
      'student scholarship apply eligibility',
      'financial aid scholarship application students',
    ],
  },
  {
    opportunity_type: "research_program",
    field_area: "research",
    education_levels: ["high_school", "undergraduate", "masters", "phd", "medical_student"],
    phrases: [
      'research program application deadline',
      'summer research program apply students',
      'research opportunity application students',
      'research program application students',
    ],
  },
  {
    opportunity_type: "fellowship",
    field_area: "all_fields",
    education_levels: ["undergraduate", "masters", "phd", "medical_student", "law_student", "mba"],
    phrases: [
      'fellowship application deadline',
      'student fellowship apply eligibility',
      'graduate fellowship application deadline',
    ],
  },
  {
    opportunity_type: "grant",
    field_area: "all_fields",
    education_levels: ["undergraduate", "masters", "phd", "medical_student", "law_student", "mba"],
    phrases: [
      'student grant application eligibility',
      'research grant students application',
      'travel grant students application',
      'education grant students apply',
    ],
  },
  {
    opportunity_type: "competition",
    field_area: "all_fields",
    education_levels: ["high_school", "undergraduate", "masters", "phd", "medical_student", "law_student", "mba"],
    phrases: [
      'student competition application deadline',
      'student challenge apply deadline',
      'case competition registration students',
      'pitch competition students apply',
      'essay competition students deadline',
    ],
  },
  {
    opportunity_type: "leadership_program",
    field_area: "leadership",
    education_levels: ["high_school", "undergraduate", "masters", "phd", "medical_student", "law_student", "mba"],
    phrases: [
      'student leadership program application deadline',
      'leadership program students apply',
      'civic leadership program students application',
      'global leadership program students deadline',
    ],
  },
  {
    opportunity_type: "career_development_program",
    field_area: "career_development",
    education_levels: ["high_school", "undergraduate", "masters", "phd", "medical_student", "law_student", "mba"],
    phrases: [
      'career development program students application',
      'professional development program students apply',
      'career preparation program students deadline',
      'student development program application deadline',
    ],
  },
  {
    opportunity_type: "pipeline_program",
    field_area: "pipeline",
    education_levels: ["high_school", "undergraduate", "masters", "medical_student", "law_student", "mba"],
    phrases: [
      'pipeline program students application',
      'student pipeline program apply deadline',
      'pre-med pipeline program students application',
      'pathway program students apply',
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
