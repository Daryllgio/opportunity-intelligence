-- Oppscores Database Schema
-- Extracted from codebase analysis + live database
-- Last updated: 2026-05-31
--
-- This is the reference schema. If columns are added or changed,
-- update this file and regenerate types with:
--   npx supabase gen types typescript --linked > src/lib/database.types.ts
--
-- Types are inferred from how columns are used in code. Where the live database
-- differs, treat the live database as authoritative and update this file.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  is_admin boolean default false,
  subscription_plan text default 'free',
  nationality text,
  country_of_study text,
  student_status text,
  school text,
  school_other text,
  education_level text,
  field_of_study text,
  field_of_study_other text,
  state_or_province text,
  first_generation boolean,
  demographic_tags text[] default '{}',
  gpa numeric,
  languages text[] default '{}',
  target_opportunity_types text[] default '{}',
  profile_completion integer,
  leadership_experiences jsonb default '[]',
  research_experiences jsonb default '[]',
  volunteer_experiences jsonb default '[]',
  work_project_experiences jsonb default '[]',
  awards jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- opportunities (user-facing published opportunities)
-- ---------------------------------------------------------------------------
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  title text,
  provider text,
  type text,
  description text,
  ai_summary text,
  country text,
  eligible_countries text[] default '{}',
  eligible_education_levels text[] default '{}',
  eligible_fields text[] default '{}',
  eligibility_criteria jsonb default '[]',
  funding_amount text,
  funding_type text,
  deadline text,
  application_status text,
  deadline_confidence text,
  cycle_notes text,
  application_url text,
  source_url text,
  normalized_url text,
  effort_level text,
  reward_level text,
  competitiveness_factors text[] default '{}',
  is_active boolean default true,
  is_approved boolean default false,
  lifecycle_status text,
  application_cycle text,
  cycle_year integer,
  canonical_key text,
  content_hash text,
  criteria_hash text,
  expired_at timestamptz,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  check_reason text,
  last_rechecked_at timestamptz,
  last_recheck_error text,
  last_verified_at timestamptz,
  last_http_status integer,
  last_raw_content_hash text,
  last_clean_content_hash text,
  recheck_attempts integer default 0,
  renewed_from_id uuid,
  renewed_at timestamptz,
  archived_at timestamptz,
  validation_score integer,
  validation_decision text,
  validation_reasons text[] default '{}',
  duplicate_risk text,
  source_trust text,
  auto_publish_eligible boolean default false,
  source_category text,
  application_url_quality text,
  review_flags text[] default '{}',
  source_quality_reasons text[] default '{}',
  official_source_url text,
  official_source_verified boolean default false,
  application_note text,
  application_destination_url text,
  application_destination_type text,
  official_source_status text,
  destination_confidence text,
  destination_reasons text[] default '{}',
  application_document_url text,
  application_document_type text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- opportunity_drafts (staging table — superset of opportunities)
-- ---------------------------------------------------------------------------
create table if not exists opportunity_drafts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid,
  discovered_page_id uuid,
  title text,
  provider text,
  type text,
  description text,
  ai_summary text,
  country text,
  eligible_countries text[] default '{}',
  eligible_education_levels text[] default '{}',
  eligible_fields text[] default '{}',
  eligibility_criteria jsonb default '[]',
  funding_amount text,
  funding_type text,
  deadline text,
  application_status text,
  deadline_confidence text,
  cycle_notes text,
  application_url text,
  source_url text,
  source_domain text,
  normalized_url text,
  effort_level text,
  reward_level text,
  competitiveness_factors text[] default '{}',
  extraction_status text,
  extraction_confidence text,
  review_notes text,
  expected_next_check_at timestamptz,
  opportunity_family_key text,
  validation_score integer,
  validation_decision text,
  validation_reasons text[] default '{}',
  duplicate_risk text,
  source_trust text,
  auto_publish_eligible boolean default false,
  source_category text,
  application_url_quality text,
  review_flags text[] default '{}',
  source_quality_reasons text[] default '{}',
  official_source_url text,
  official_source_verified boolean default false,
  application_note text,
  application_destination_url text,
  application_destination_type text,
  official_source_status text,
  destination_confidence text,
  destination_reasons text[] default '{}',
  application_document_url text,
  application_document_type text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- discovered_pages (raw pages from search)
-- ---------------------------------------------------------------------------
create table if not exists discovered_pages (
  id uuid primary key default gen_random_uuid(),
  title text,
  url text not null,
  normalized_url text,
  source_domain text,
  region text,
  opportunity_type text,
  education_level text,
  field_area text,
  opportunity_family_key text,
  discovery_status text default 'candidate',
  quality_score numeric,
  rejection_reason text,
  discovery_query text,
  snippet text,
  text_content text,
  expected_next_check_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- discovery_campaigns
-- ---------------------------------------------------------------------------
create table if not exists discovery_campaigns (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  opportunity_type text,
  education_level text,
  field_area text,
  region text,
  max_results integer,
  status text default 'active',
  next_run_at timestamptz,
  run_count integer default 0,
  results_found integer default 0,
  pages_added integer default 0,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- discovery_run_logs
-- ---------------------------------------------------------------------------
create table if not exists discovery_run_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid,
  query text,
  status text,
  results_found integer,
  pages_added integer,
  error text,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- harvester_candidates
-- ---------------------------------------------------------------------------
create table if not exists harvester_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid,
  title text,
  url text not null,
  normalized_url text,
  reason text,
  score numeric,
  status text default 'new',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (url)
);

-- ---------------------------------------------------------------------------
-- harvester_scan_logs
-- ---------------------------------------------------------------------------
create table if not exists harvester_scan_logs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid,
  source_url text,
  status text,
  total_candidates integer,
  new_candidates integer,
  ignored_candidates integer,
  error_message text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- opportunity_sources
-- ---------------------------------------------------------------------------
create table if not exists opportunity_sources (
  id uuid primary key default gen_random_uuid(),
  name text,
  url text not null,
  normalized_url text,
  source_type text,
  country text,
  categories text[] default '{}',
  check_frequency text,
  is_active boolean default true,
  notes text,
  last_checked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- opportunity_competitiveness_scores
-- ---------------------------------------------------------------------------
create table if not exists opportunity_competitiveness_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  score numeric,
  fit_label text,
  model_used text,
  profile_snapshot jsonb,
  opportunity_snapshot jsonb,
  profile_scoring_hash text,
  opportunity_content_hash text,
  opportunity_criteria_hash text,
  score_status text default 'current',
  stale_reason text,
  last_scored_at timestamptz,
  updated_at timestamptz default now(),
  unique (user_id, opportunity_id)
);

-- ---------------------------------------------------------------------------
-- opportunity_score_reports (detailed gap reports)
-- ---------------------------------------------------------------------------
create table if not exists opportunity_score_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  overall_score numeric,
  fit_label text,
  eligibility_status text,
  strengths text[] default '{}',
  gaps text[] default '{}',
  recommended_actions text[] default '{}',
  ai_explanation text,
  model_used text,
  profile_snapshot jsonb,
  opportunity_snapshot jsonb,
  updated_at timestamptz default now(),
  unique (user_id, opportunity_id)
);

-- ---------------------------------------------------------------------------
-- profile_experience_summaries
-- ---------------------------------------------------------------------------
create table if not exists profile_experience_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  section_key text,
  experience_key text,
  experience_title text,
  organization text,
  start_date text,
  end_date text,
  raw_content_hash text,
  raw_content_length integer,
  raw_content_text text,
  summary text,
  evidence_tags text[] default '{}',
  notable_metrics text[] default '{}',
  model_used text,
  last_summarized_at timestamptz,
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- saved_opportunities
-- ---------------------------------------------------------------------------
create table if not exists saved_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, opportunity_id)
);

-- ---------------------------------------------------------------------------
-- user_ai_usage (monthly quota tracking)
-- ---------------------------------------------------------------------------
create table if not exists user_ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_month text not null,
  competitiveness_scores_used integer default 0,
  gap_reports_used integer default 0,
  updated_at timestamptz default now(),
  unique (user_id, usage_month)
);

-- ---------------------------------------------------------------------------
-- user_scoring_jobs (scheduled scoring work)
-- ---------------------------------------------------------------------------
create table if not exists user_scoring_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_type text,
  status text default 'pending',
  profile_scoring_hash text,
  scheduled_for timestamptz,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  scores_created integer default 0,
  scores_refreshed integer default 0,
  attempts integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
