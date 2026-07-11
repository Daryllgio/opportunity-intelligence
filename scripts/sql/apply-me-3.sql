-- ============================================================================
-- APPLY ME (round 3) — preferences system + permanent-resident precision
-- Idempotent: safe to run repeatedly. Run the whole file in the Supabase SQL
-- editor. Complements apply-me.sql and apply-me-2.sql (run those first if
-- you haven't).
--
-- What this enables:
--   1. The student preferences system (scored vs access categories,
--      sub-type interests, next-level opt-in, transfer intent, location
--      preference) — one jsonb document, no future migrations needed.
--   2. Permanent-residency capture, so "citizens or permanent residents of X"
--      requirements evaluate deterministically for international students
--      (the GeniusCash bug: a Cameroonian international student is neither a
--      Canadian citizen nor a Canadian PR, and the system couldn't say so).
-- ============================================================================

-- 1. Preferences document ----------------------------------------------------
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;

-- 2. Permanent residency -----------------------------------------------------
-- The country (or countries) where the student holds permanent residency,
-- in addition to citizenships. Empty array = none / not stated.
alter table public.profiles
  add column if not exists permanent_resident_of text[] not null default '{}';
