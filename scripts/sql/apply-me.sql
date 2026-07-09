-- ============================================================================
-- APPLY ME — the one migration file for OppScore.
--
-- This consolidates EVERYTHING pending into a single idempotent script:
--   1. add-notifications-and-reports.sql   (never applied)
--   2. platform-perfection-2.sql           (never applied)
--   3. backend-perfection additions        (new)
--
-- Run the whole file once in the Supabase SQL editor. Safe to re-run.
-- Until it runs, the deployed code degrades gracefully — but eligibility
-- enforcement, richer profiles, AI search, email reminders, billing state,
-- and overflow credits are all DARK. This file is the single blocker.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Section 1 — Notifications & reports (from add-notifications-and-reports.sql)
-- ────────────────────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists email_deadline_reminders boolean default true;

create table if not exists email_notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid references opportunities (id) on delete cascade,
  notification_type text not null,
  sent_at timestamptz default now()
);

create unique index if not exists idx_email_notification_dedupe
  on email_notification_log (user_id, opportunity_id, notification_type);

create table if not exists opportunity_reports (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  reason text,
  details text,
  status text default 'open',
  created_at timestamptz default now()
);

-- Digest-style reminders dedupe by user + calendar day (one email per day max).
create table if not exists email_digest_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  digest_date date not null,
  deadline_count integer default 0,
  sent_at timestamptz default now(),
  unique (user_id, digest_date)
);

-- ────────────────────────────────────────────────────────────────────────────
-- Section 2 — Eligibility & verification (from platform-perfection-2.sql)
-- ────────────────────────────────────────────────────────────────────────────
alter table opportunities
  add column if not exists eligibility_criteria jsonb default '[]';

alter table opportunity_drafts
  add column if not exists eligibility_criteria jsonb default '[]';

create index if not exists idx_opportunities_eligibility_criteria
  on opportunities using gin (eligibility_criteria);

alter table profiles
  add column if not exists state_or_province text;

alter table profiles
  add column if not exists first_generation boolean;

alter table profiles
  add column if not exists demographic_tags text[] default '{}';

alter table opportunities
  add column if not exists last_verified_at timestamptz;

alter table user_ai_usage
  add column if not exists ai_search_tokens_used bigint default 0;

-- ────────────────────────────────────────────────────────────────────────────
-- Section 3 — Profile edge cases (backend-perfection)
--   class standing, GPA scale, multiple citizenships, optional DOB (age
--   matching only), double major, grad students' undergrad field, transfer
--   intended school, optional disability self-identification (confirm-only).
-- ────────────────────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists class_standing text;

alter table profiles
  add column if not exists gpa_scale text default '4.0';

alter table profiles
  add column if not exists citizenships text[] default '{}';

alter table profiles
  add column if not exists date_of_birth date;

alter table profiles
  add column if not exists field_of_study_secondary text;

alter table profiles
  add column if not exists undergraduate_field_of_study text;

alter table profiles
  add column if not exists intended_school text;

alter table profiles
  add column if not exists has_disability boolean;

-- Dormancy control: auto-refresh scoring pauses for inactive users and
-- resumes the moment they return (updated on every browse visit).
alter table profiles
  add column if not exists last_active_at timestamptz;

-- Suspicious-activity flagging (account sharing): flag, never block.
alter table profiles
  add column if not exists integrity_flag text;

alter table profiles
  add column if not exists integrity_flagged_at timestamptz;

-- ────────────────────────────────────────────────────────────────────────────
-- Section 4 — Opportunity data richness (backend-perfection)
--   Flexible attribute bag: nomination_required, team_based, renewable,
--   funding_period, currency, recommendation_letters, prerequisites,
--   additional_deadlines, language, deadline_time/timezone, exclusivity...
-- ────────────────────────────────────────────────────────────────────────────
alter table opportunities
  add column if not exists attributes jsonb default '{}';

alter table opportunity_drafts
  add column if not exists attributes jsonb default '{}';

-- ────────────────────────────────────────────────────────────────────────────
-- Section 5 — Billing state (backend-perfection; Stripe checkout comes later)
--   Trials, grace periods, scheduled downgrades, overflow credits.
-- ────────────────────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists subscription_status text default 'none';
  -- one of: none | trialing | active | grace | expired

alter table profiles
  add column if not exists trial_plan text;

alter table profiles
  add column if not exists trial_started_at timestamptz;

alter table profiles
  add column if not exists trial_ends_at timestamptz;

alter table profiles
  add column if not exists grace_ends_at timestamptz;

alter table profiles
  add column if not exists pending_plan text;

alter table profiles
  add column if not exists plan_change_effective_at timestamptz;

create table if not exists user_credit_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credit_type text not null, -- 'competitiveness_report' | 'ai_search_credit'
  balance integer not null default 0,
  updated_at timestamptz default now(),
  unique (user_id, credit_type)
);

create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credit_type text not null,
  delta integer not null,           -- +purchase / -consumption
  reason text,                      -- 'purchase' | 'overflow_use' | 'refund' | 'admin_grant'
  reference_id text,                -- opportunity id, search id, or payment ref
  created_at timestamptz default now()
);

create index if not exists idx_credit_ledger_user
  on credit_ledger (user_id, created_at desc);

-- Backfill: accounts that already had a paid plan before the state machine
-- existed become 'active' so their access is uninterrupted.
update profiles
  set subscription_status = 'active'
  where subscription_plan in ('basic', 'pro', 'premium')
    and (subscription_status is null or subscription_status = 'none');
