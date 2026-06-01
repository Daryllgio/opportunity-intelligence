// Oppscores Supabase types.
//
// Hand-authored from codebase analysis (no live DB password available for
// `supabase gen types`). Row = shape returned by SELECT; Insert = shape for
// INSERT (all optional — the DB fills id/timestamps/defaults); Update = partial.
//
// If columns are added or changed, update this file (and supabase/schema.sql).
// When DB access is available, regenerate with:
//   npx supabase gen types typescript --linked > src/lib/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type WithDefaults<Row, Required extends keyof Row = never> = Partial<Row> &
  Pick<Row, Required>;

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export type ProfileRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  is_admin: boolean | null;
  subscription_plan: string | null;
  nationality: string | null;
  country: string | null;
  country_of_study: string | null;
  student_status: string | null;
  school: string | null;
  school_other: string | null;
  education_level: string | null;
  education_entries: Json | null;
  field_of_study: string | null;
  field_of_study_other: string | null;
  gpa: number | null;
  languages: string[] | null;
  interests: string[] | null;
  goals: string | null;
  opportunity_level: string | null;
  preferred_regions: string[] | null;
  target_opportunity_types: string[] | null;
  financial_need: string | null;
  has_awards: boolean | null;
  has_leadership: boolean | null;
  has_research: boolean | null;
  has_volunteering: boolean | null;
  leadership_experiences: Json | null;
  research_experiences: Json | null;
  volunteer_experiences: Json | null;
  work_project_experiences: Json | null;
  awards: Json | null;
  created_at: string | null;
  updated_at: string | null;
};

export type OpportunityRow = {
  id: string;
  title: string | null;
  provider: string | null;
  type: string | null;
  description: string | null;
  ai_summary: string | null;
  country: string | null;
  eligible_countries: string[] | null;
  eligible_education_levels: string[] | null;
  eligible_fields: string[] | null;
  funding_amount: string | null;
  funding_type: string | null;
  deadline: string | null;
  application_status: string | null;
  deadline_confidence: string | null;
  cycle_notes: string | null;
  application_url: string | null;
  source_url: string | null;
  normalized_url: string | null;
  effort_level: string | null;
  reward_level: string | null;
  competitiveness_factors: string[] | null;
  is_active: boolean | null;
  is_approved: boolean | null;
  lifecycle_status: string | null;
  application_cycle: string | null;
  cycle_year: number | null;
  canonical_key: string | null;
  content_hash: string | null;
  criteria_hash: string | null;
  expired_at: string | null;
  last_checked_at: string | null;
  next_check_at: string | null;
  check_reason: string | null;
  last_rechecked_at: string | null;
  last_recheck_error: string | null;
  last_http_status: number | null;
  last_raw_content_hash: string | null;
  last_clean_content_hash: string | null;
  recheck_attempts: number | null;
  renewed_from_id: string | null;
  renewed_at: string | null;
  validation_score: number | null;
  validation_decision: string | null;
  validation_reasons: string[] | null;
  duplicate_risk: string | null;
  source_trust: string | null;
  auto_publish_eligible: boolean | null;
  source_category: string | null;
  application_url_quality: string | null;
  review_flags: string[] | null;
  source_quality_reasons: string[] | null;
  official_source_url: string | null;
  official_source_verified: boolean | null;
  application_note: string | null;
  application_destination_url: string | null;
  application_destination_type: string | null;
  official_source_status: string | null;
  destination_confidence: string | null;
  destination_reasons: string[] | null;
  application_document_url: string | null;
  application_document_type: string | null;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type OpportunityDraftRow = OpportunityRow & {
  source_id: string | null;
  extraction_status: string | null;
  extraction_confidence: string | null;
  review_notes: string | null;
  discovered_page_id: string | null;
  source_domain: string | null;
  expected_next_check_at: string | null;
  opportunity_family_key: string | null;
};

export type DiscoveredPageRow = {
  id: string;
  title: string | null;
  url: string;
  normalized_url: string | null;
  source_domain: string | null;
  region: string | null;
  opportunity_type: string | null;
  education_level: string | null;
  field_area: string | null;
  opportunity_family_key: string | null;
  discovery_status: string | null;
  quality_score: number | null;
  rejection_reason: string | null;
  discovery_query: string | null;
  snippet: string | null;
  text_content: string | null;
  expected_next_check_at: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DiscoveryCampaignRow = {
  id: string;
  query: string;
  opportunity_type: string | null;
  education_level: string | null;
  field_area: string | null;
  region: string | null;
  max_results: number | null;
  status: string | null;
  next_run_at: string | null;
  run_count: number | null;
  results_found: number | null;
  pages_added: number | null;
  last_error: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DiscoveryRunLogRow = {
  id: string;
  campaign_id: string | null;
  query: string | null;
  status: string | null;
  results_found: number | null;
  pages_added: number | null;
  error: string | null;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type HarvesterCandidateRow = {
  id: string;
  source_id: string | null;
  title: string | null;
  url: string;
  normalized_url: string | null;
  reason: string | null;
  score: number | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type HarvesterScanLogRow = {
  id: string;
  source_id: string | null;
  source_url: string | null;
  status: string | null;
  total_candidates: number | null;
  new_candidates: number | null;
  ignored_candidates: number | null;
  error_message: string | null;
  created_at: string | null;
};

export type OpportunitySourceRow = {
  id: string;
  name: string | null;
  url: string;
  normalized_url: string | null;
  source_type: string | null;
  country: string | null;
  categories: string[] | null;
  check_frequency: string | null;
  is_active: boolean | null;
  notes: string | null;
  last_checked_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type OpportunityCompetitivenessScoreRow = {
  id: string;
  user_id: string;
  opportunity_id: string;
  score: number | null;
  fit_label: string | null;
  model_used: string | null;
  profile_snapshot: Json | null;
  opportunity_snapshot: Json | null;
  profile_scoring_hash: string | null;
  opportunity_content_hash: string | null;
  opportunity_criteria_hash: string | null;
  score_status: string | null;
  stale_reason: string | null;
  last_scored_at: string | null;
  updated_at: string | null;
};

export type OpportunityScoreReportRow = {
  id: string;
  user_id: string;
  opportunity_id: string;
  overall_score: number | null;
  fit_label: string | null;
  eligibility_status: string | null;
  strengths: string[] | null;
  gaps: string[] | null;
  recommended_actions: string[] | null;
  ai_explanation: string | null;
  model_used: string | null;
  profile_snapshot: Json | null;
  opportunity_snapshot: Json | null;
  updated_at: string | null;
};

export type ProfileExperienceSummaryRow = {
  id: string;
  user_id: string;
  section_key: string | null;
  experience_key: string | null;
  experience_title: string | null;
  organization: string | null;
  start_date: string | null;
  end_date: string | null;
  raw_content_hash: string | null;
  raw_content_length: number | null;
  raw_content_text: string | null;
  summary: string | null;
  evidence_tags: string[] | null;
  notable_metrics: string[] | null;
  model_used: string | null;
  last_summarized_at: string | null;
  updated_at: string | null;
};

export type SavedOpportunityRow = {
  id: string;
  user_id: string;
  opportunity_id: string;
  status: string;
  created_at: string | null;
};

export type UserAiUsageRow = {
  id: string;
  user_id: string;
  usage_month: string;
  competitiveness_scores_used: number | null;
  gap_reports_used: number | null;
  updated_at: string | null;
};

export type UserScoringJobRow = {
  id: string;
  user_id: string;
  job_type: string | null;
  status: string | null;
  profile_scoring_hash: string | null;
  scheduled_for: string | null;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  scores_created: number | null;
  scores_refreshed: number | null;
  attempts: number | null;
  created_at: string | null;
  updated_at: string | null;
};

// ---------------------------------------------------------------------------
// Database interface
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: WithDefaults<ProfileRow, "id">;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      opportunities: {
        Row: OpportunityRow;
        Insert: WithDefaults<OpportunityRow>;
        Update: Partial<OpportunityRow>;
        Relationships: [];
      };
      opportunity_drafts: {
        Row: OpportunityDraftRow;
        Insert: WithDefaults<OpportunityDraftRow>;
        Update: Partial<OpportunityDraftRow>;
        Relationships: [];
      };
      discovered_pages: {
        Row: DiscoveredPageRow;
        Insert: WithDefaults<DiscoveredPageRow, "url">;
        Update: Partial<DiscoveredPageRow>;
        Relationships: [];
      };
      discovery_campaigns: {
        Row: DiscoveryCampaignRow;
        Insert: WithDefaults<DiscoveryCampaignRow, "query">;
        Update: Partial<DiscoveryCampaignRow>;
        Relationships: [];
      };
      discovery_run_logs: {
        Row: DiscoveryRunLogRow;
        Insert: WithDefaults<DiscoveryRunLogRow>;
        Update: Partial<DiscoveryRunLogRow>;
        Relationships: [];
      };
      harvester_candidates: {
        Row: HarvesterCandidateRow;
        Insert: WithDefaults<HarvesterCandidateRow, "url">;
        Update: Partial<HarvesterCandidateRow>;
        Relationships: [];
      };
      harvester_scan_logs: {
        Row: HarvesterScanLogRow;
        Insert: WithDefaults<HarvesterScanLogRow>;
        Update: Partial<HarvesterScanLogRow>;
        Relationships: [];
      };
      opportunity_sources: {
        Row: OpportunitySourceRow;
        Insert: WithDefaults<OpportunitySourceRow, "url">;
        Update: Partial<OpportunitySourceRow>;
        Relationships: [];
      };
      opportunity_competitiveness_scores: {
        Row: OpportunityCompetitivenessScoreRow;
        Insert: WithDefaults<OpportunityCompetitivenessScoreRow, "user_id" | "opportunity_id">;
        Update: Partial<OpportunityCompetitivenessScoreRow>;
        Relationships: [];
      };
      opportunity_score_reports: {
        Row: OpportunityScoreReportRow;
        Insert: WithDefaults<OpportunityScoreReportRow, "user_id" | "opportunity_id">;
        Update: Partial<OpportunityScoreReportRow>;
        Relationships: [];
      };
      profile_experience_summaries: {
        Row: ProfileExperienceSummaryRow;
        Insert: WithDefaults<ProfileExperienceSummaryRow, "user_id">;
        Update: Partial<ProfileExperienceSummaryRow>;
        Relationships: [];
      };
      saved_opportunities: {
        Row: SavedOpportunityRow;
        Insert: WithDefaults<SavedOpportunityRow, "user_id" | "opportunity_id">;
        Update: Partial<SavedOpportunityRow>;
        Relationships: [];
      };
      user_ai_usage: {
        Row: UserAiUsageRow;
        Insert: WithDefaults<UserAiUsageRow, "user_id" | "usage_month">;
        Update: Partial<UserAiUsageRow>;
        Relationships: [];
      };
      user_scoring_jobs: {
        Row: UserScoringJobRow;
        Insert: WithDefaults<UserScoringJobRow, "user_id">;
        Update: Partial<UserScoringJobRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
