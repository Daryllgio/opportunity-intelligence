-- ============================================================================
-- APPLY ME (round 5) — Stripe billing + projects
-- Idempotent: safe to run repeatedly. Complements apply-me.sql / -2 / -3 / -4.
--
-- What this enables:
--   1. Real Stripe subscriptions: customer/subscription linkage, period
--      tracking, and cancel-at-period-end so the billing state machine can
--      reconcile with real payment events.
--   2. The Projects profile section (LinkedIn-style: name, description,
--      link, skills) — evidence for scoring beyond formal experiences.
-- ============================================================================

-- 1. Stripe linkage ----------------------------------------------------------
alter table public.profiles
  add column if not exists stripe_customer_id text;
alter table public.profiles
  add column if not exists stripe_subscription_id text;
alter table public.profiles
  add column if not exists cancel_at_period_end boolean not null default false;
alter table public.profiles
  add column if not exists current_period_end timestamptz;

create index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id);

-- 2. Projects ----------------------------------------------------------------
-- [{ name, description, link, skills: [] }]
alter table public.profiles
  add column if not exists projects jsonb not null default '[]'::jsonb;
