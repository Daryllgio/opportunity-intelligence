-- ============================================================================
-- APPLY ME (round 2) — eligibility & extraction accuracy migration
-- Idempotent: safe to run repeatedly. Run the whole file in the Supabase SQL
-- editor. Complements scripts/sql/apply-me.sql (already applied).
--
-- What this enables:
--   1. Tier-2 AI eligibility decision cache (two-tier eligibility system).
--   2. "not_yet_open" application status (Bob Horner opens Sept 9 — until
--      then it must not be visible). Code writes "closed" as a fallback
--      until this is applied, so nothing breaks either way.
--   3. application_opens_at column for scheduled publishing (code also
--      mirrors the date into attributes, and backfills the column below).
-- ============================================================================

-- 1. Tier-2 eligibility decision cache -------------------------------------
-- One row per (opportunity, eligibility-relevant-profile-fingerprint).
-- Shared across users with the same relevant attributes; invalidated by
-- material_hash when re-extraction changes the eligibility content.
create table if not exists public.eligibility_ai_decisions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  profile_key text not null,
  material_hash text not null,
  decision text not null check (decision in ('eligible', 'ineligible', 'uncertain')),
  reason text,
  model text,
  created_at timestamptz not null default now(),
  unique (opportunity_id, profile_key)
);

create index if not exists eligibility_ai_decisions_profile_idx
  on public.eligibility_ai_decisions (profile_key);

alter table public.eligibility_ai_decisions enable row level security;
-- Service-role access only (no policies): the cache is written and read
-- exclusively by server code.

-- 2. not_yet_open application status ----------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'opportunities_application_status_check'
      and table_name = 'opportunities'
  ) then
    alter table public.opportunities drop constraint opportunities_application_status_check;
  end if;
  alter table public.opportunities add constraint opportunities_application_status_check
    check (application_status in ('open', 'closed', 'not_yet_open', 'rolling', 'unknown'));
exception when duplicate_object then null;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'opportunity_drafts_application_status_check'
      and table_name = 'opportunity_drafts'
  ) then
    alter table public.opportunity_drafts drop constraint opportunity_drafts_application_status_check;
  end if;
  alter table public.opportunity_drafts add constraint opportunity_drafts_application_status_check
    check (application_status in ('open', 'closed', 'not_yet_open', 'rolling', 'unknown'));
exception when duplicate_object then null;
end $$;

-- 3. "processing" claim status for discovered pages ---------------------------
-- The concurrency claim writes discovery_status='processing'; the original
-- CHECK constraint predates it and silently rejected every claim, which
-- halted the entire discovery pipeline (code now has an updated_at-CAS
-- fallback, but the honest status is better).
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'discovered_pages_discovery_status_check'
      and table_name = 'discovered_pages'
  ) then
    alter table public.discovered_pages drop constraint discovered_pages_discovery_status_check;
  end if;
  alter table public.discovered_pages add constraint discovered_pages_discovery_status_check
    check (discovery_status in (
      'pending', 'candidate', 'processing', 'bundled', 'needs_more_pages',
      'review', 'published', 'rejected', 'future_tracking',
      'deferred_aggregator', 'already_known', 'failed'
    ));
exception when duplicate_object then null;
end $$;

-- 4. Application open date ---------------------------------------------------
alter table public.opportunities
  add column if not exists application_opens_at date;
alter table public.opportunity_drafts
  add column if not exists application_opens_at date;

-- Backfill from the attributes jsonb where extraction already captured it.
update public.opportunities
set application_opens_at = (attributes ->> 'application_opens_at')::date
where application_opens_at is null
  and attributes ? 'application_opens_at'
  and (attributes ->> 'application_opens_at') ~ '^\d{4}-\d{2}-\d{2}$';

update public.opportunity_drafts
set application_opens_at = (attributes ->> 'application_opens_at')::date
where application_opens_at is null
  and attributes ? 'application_opens_at'
  and (attributes ->> 'application_opens_at') ~ '^\d{4}-\d{2}-\d{2}$';
