export type ExperienceEntry = {
  title?: string;
  organization?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  impact?: string;
  link?: string;
};

export type AwardEntry = {
  name?: string;
  organization?: string;
  year?: string;
  description?: string;
};

export type StudentProfileForScoring = {
  nationality?: string | null;
  country_of_study?: string | null;
  student_status?: string | null;
  school?: string | null;
  school_other?: string | null;
  education_level?: string | null;
  field_of_study?: string | null;
  field_of_study_other?: string | null;
  gpa?: number | null;
  languages?: string[] | null;
  target_opportunity_types?: string[] | null;
  leadership_experiences?: ExperienceEntry[] | null;
  research_experiences?: ExperienceEntry[] | null;
  volunteer_experiences?: ExperienceEntry[] | null;
  work_project_experiences?: ExperienceEntry[] | null;
  awards?: AwardEntry[] | null;
};

export type OpportunityForScoring = {
  id: string;
  title: string;
  provider?: string | null;
  type: string;
  description?: string | null;
  country?: string | null;
  eligible_countries?: string[] | null;
  eligible_education_levels?: string[] | null;
  eligible_fields?: string[] | null;
  funding_amount?: string | null;
  funding_type?: string | null;
  deadline?: string | null;
  effort_level?: string | null;
  reward_level?: string | null;
  competitiveness_factors?: string[] | null;
};

export type ProfileStrengthAnalysis = {
  academic_strength: number;
  research_strength: number;
  leadership_strength: number;
  community_impact_strength: number;
  work_project_strength: number;
  awards_strength: number;
  institution_signal: number;
  profile_completeness: number;
  evidence_quality: number;
};

export type OpportunityPriorityAnalysis = {
  academic_weight: number;
  research_weight: number;
  leadership_weight: number;
  community_impact_weight: number;
  work_project_weight: number;
  awards_weight: number;
  field_alignment_weight: number;
  institution_signal_weight: number;
  primary_priorities: string[];
  hidden_priorities: string[];
};

export type MatchEvaluation = {
  score: number;
  recommendation: "apply_now" | "save_for_later" | "improve_first";
  label: "Strong match" | "Good match" | "Developing match";
  reasons: string[];
  gaps: string[];
  confidence: "low" | "medium" | "high";
};
