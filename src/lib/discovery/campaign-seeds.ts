export type DiscoveryCampaignSeed = {
  query: string;
  opportunity_type:
    | "scholarship"
    | "fellowship"
    | "research_program"
    | "grant"
    | "competition"
    | "leadership_program"
    | "career_development_program";
  education_level:
    | "high_school"
    | "undergraduate"
    | "transfer_student"
    | "masters"
    | "phd"
    | "medical_student"
    | "law_student"
    | "mba"
    | "professional_student"
    | "recent_graduate"
    | "early_career";
  field_area: string;
  region: "united_states" | "canada";
  max_results: number;
  status: "active";
};

export const DISCOVERY_CAMPAIGN_SEEDS: DiscoveryCampaignSeed[] = [
  // Scholarships
  {
    query: "United States undergraduate scholarship students application deadline",
    opportunity_type: "scholarship",
    education_level: "undergraduate",
    field_area: "all_fields",
    region: "united_states",
    max_results: 10,
    status: "active",
  },
  {
    query: "Canada undergraduate scholarship students application deadline",
    opportunity_type: "scholarship",
    education_level: "undergraduate",
    field_area: "all_fields",
    region: "canada",
    max_results: 10,
    status: "active",
  },
  {
    query: "United States first generation undergraduate scholarship application deadline",
    opportunity_type: "scholarship",
    education_level: "undergraduate",
    field_area: "all_fields",
    region: "united_states",
    max_results: 10,
    status: "active",
  },

  // Research programs
  {
    query: "United States undergraduate summer research program STEM application deadline",
    opportunity_type: "research_program",
    education_level: "undergraduate",
    field_area: "stem",
    region: "united_states",
    max_results: 10,
    status: "active",
  },
  {
    query: "Canada undergraduate summer research program STEM application deadline",
    opportunity_type: "research_program",
    education_level: "undergraduate",
    field_area: "stem",
    region: "canada",
    max_results: 10,
    status: "active",
  },
  {
    query: "United States undergraduate biomedical research program application deadline",
    opportunity_type: "research_program",
    education_level: "undergraduate",
    field_area: "medicine_health",
    region: "united_states",
    max_results: 10,
    status: "active",
  },
  {
    query: "Canada undergraduate research opportunity health sciences application deadline",
    opportunity_type: "research_program",
    education_level: "undergraduate",
    field_area: "medicine_health",
    region: "canada",
    max_results: 10,
    status: "active",
  },

  // Fellowships
  {
    query: "United States undergraduate fellowship students application deadline",
    opportunity_type: "fellowship",
    education_level: "undergraduate",
    field_area: "all_fields",
    region: "united_states",
    max_results: 10,
    status: "active",
  },
  {
    query: "Canada undergraduate fellowship students application deadline",
    opportunity_type: "fellowship",
    education_level: "undergraduate",
    field_area: "all_fields",
    region: "canada",
    max_results: 10,
    status: "active",
  },
  {
    query: "United States public policy fellowship undergraduate students application deadline",
    opportunity_type: "fellowship",
    education_level: "undergraduate",
    field_area: "public_policy",
    region: "united_states",
    max_results: 10,
    status: "active",
  },
  {
    query: "Canada global affairs fellowship students application deadline",
    opportunity_type: "fellowship",
    education_level: "undergraduate",
    field_area: "international_relations",
    region: "canada",
    max_results: 10,
    status: "active",
  },

  // Grants
  {
    query: "United States undergraduate research travel grant application deadline",
    opportunity_type: "grant",
    education_level: "undergraduate",
    field_area: "all_fields",
    region: "united_states",
    max_results: 10,
    status: "active",
  },
  {
    query: "Canada undergraduate research travel grant application deadline",
    opportunity_type: "grant",
    education_level: "undergraduate",
    field_area: "all_fields",
    region: "canada",
    max_results: 10,
    status: "active",
  },
  {
    query: "United States student social impact grant application deadline",
    opportunity_type: "grant",
    education_level: "undergraduate",
    field_area: "social_sciences",
    region: "united_states",
    max_results: 10,
    status: "active",
  },
  {
    query: "Canada student innovation grant application deadline undergraduate",
    opportunity_type: "grant",
    education_level: "undergraduate",
    field_area: "business",
    region: "canada",
    max_results: 10,
    status: "active",
  },

  // Competitions
  {
    query: "United States undergraduate case competition application deadline students",
    opportunity_type: "competition",
    education_level: "undergraduate",
    field_area: "business",
    region: "united_states",
    max_results: 10,
    status: "active",
  },
  {
    query: "Canada undergraduate case competition application deadline students",
    opportunity_type: "competition",
    education_level: "undergraduate",
    field_area: "business",
    region: "canada",
    max_results: 10,
    status: "active",
  },
  {
    query: "United States student hackathon competition application deadline undergraduate",
    opportunity_type: "competition",
    education_level: "undergraduate",
    field_area: "computer_science",
    region: "united_states",
    max_results: 10,
    status: "active",
  },
  {
    query: "Canada student pitch competition application deadline undergraduate",
    opportunity_type: "competition",
    education_level: "undergraduate",
    field_area: "business",
    region: "canada",
    max_results: 10,
    status: "active",
  },

  // Leadership programs
  {
    query: "United States student leadership program application deadline undergraduate",
    opportunity_type: "leadership_program",
    education_level: "undergraduate",
    field_area: "all_fields",
    region: "united_states",
    max_results: 10,
    status: "active",
  },
  {
    query: "Canada student leadership program application deadline undergraduate",
    opportunity_type: "leadership_program",
    education_level: "undergraduate",
    field_area: "all_fields",
    region: "canada",
    max_results: 10,
    status: "active",
  },
  {
    query: "United States civic leadership program students application deadline",
    opportunity_type: "leadership_program",
    education_level: "undergraduate",
    field_area: "public_policy",
    region: "united_states",
    max_results: 10,
    status: "active",
  },
  {
    query: "Canada youth leadership program students application deadline",
    opportunity_type: "leadership_program",
    education_level: "undergraduate",
    field_area: "public_policy",
    region: "canada",
    max_results: 10,
    status: "active",
  },

  // Career development programs
  {
    query: "United States pre-med pipeline program undergraduate application deadline",
    opportunity_type: "career_development_program",
    education_level: "undergraduate",
    field_area: "medicine_health",
    region: "united_states",
    max_results: 10,
    status: "active",
  },
  {
    query: "Canada undergraduate career development program application deadline students",
    opportunity_type: "career_development_program",
    education_level: "undergraduate",
    field_area: "all_fields",
    region: "canada",
    max_results: 10,
    status: "active",
  },
  {
    query: "United States undergraduate finance leadership development program students application deadline",
    opportunity_type: "career_development_program",
    education_level: "undergraduate",
    field_area: "finance",
    region: "united_states",
    max_results: 10,
    status: "active",
  },
  {
    query: "Canada undergraduate technology career development program students application deadline",
    opportunity_type: "career_development_program",
    education_level: "undergraduate",
    field_area: "computer_science",
    region: "canada",
    max_results: 10,
    status: "active",
  },
];
