-- ============================================================================
-- Platform Perfection round 2 — consolidated migration.
-- Apply in the Supabase SQL editor. Idempotent; safe to re-run.
--
-- Code deployed from the platform-perfection-2 branch probes for these
-- columns and degrades gracefully until this file is applied, but eligibility
-- capture, richer profiles, and premium AI search only activate once it runs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Structured eligibility criteria on opportunities + drafts.
--    Array of { kind, requirement, values, strict } objects; `kind` is an
--    open vocabulary (citizenship, residency, location, specific_school,
--    education_level, field_of_study, gpa_minimum, age, demographic,
--    financial_need, enrollment_status, grade_level, ...).
-- ---------------------------------------------------------------------------
alter table opportunities
  add column if not exists eligibility_criteria jsonb default '[]';

alter table opportunity_drafts
  add column if not exists eligibility_criteria jsonb default '[]';

create index if not exists idx_opportunities_eligibility_criteria
  on opportunities using gin (eligibility_criteria);

-- ---------------------------------------------------------------------------
-- 2. Profile fields that make eligibility enforcement possible.
--    state_or_province: matches location/residency criteria.
--    first_generation + demographic_tags: optional self-identification —
--    only ever used to CONFIRM eligibility, never to exclude.
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists state_or_province text;

alter table profiles
  add column if not exists first_generation boolean;

alter table profiles
  add column if not exists demographic_tags text[] default '{}';

-- ---------------------------------------------------------------------------
-- 3. Re-verification bookkeeping.
--    last_verified_at: when the AI verifier last read the destination page.
--    Lets the nightly loop cheap-confirm unchanged pages by content hash and
--    force a full AI read only when the verification is older than 30 days.
--    Also powers "Verified N days ago" freshness labels in the UI.
-- ---------------------------------------------------------------------------
alter table opportunities
  add column if not exists last_verified_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4. Premium AI search metering.
--    Natural-language search is budgeted by actual model tokens per month
--    (see plans.ts: aiSearchMonthlyTokens). The route fails closed — no
--    searches run until this column exists.
-- ---------------------------------------------------------------------------
alter table user_ai_usage
  add column if not exists ai_search_tokens_used bigint default 0;
