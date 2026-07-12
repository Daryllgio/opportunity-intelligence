-- ============================================================================
-- APPLY ME (round 4) — demand-driven school discovery
-- Idempotent: safe to run repeatedly. Complements apply-me.sql / -2 / -3.
--
-- The school_demand table is the memory of demand-driven discovery: one row
-- per (school × level × field) slice any user has ever asked for, with the
-- categories to search, how many users want it, and how far discovery has
-- exhausted it. The second user with the same demand costs nothing — the
-- row already exists; the daytime cron works rows by user_count priority
-- and marks them exhausted when passes stop yielding new candidates.
-- ============================================================================

create table if not exists public.school_demand (
  id uuid primary key default gen_random_uuid(),
  demand_key text not null unique,      -- normalized school|level|field
  school text not null,
  country text,                          -- us | canada | null (unknown)
  level text not null,                   -- undergraduate | masters | phd | mba | jd | md | professional | high_school
  field text,                            -- null = the general/all-fields slice
  categories text[] not null default '{}',
  user_count integer not null default 1,
  status text not null default 'pending' check (status in ('pending','in_progress','exhausted','failed')),
  passes_done integer not null default 0,
  consecutive_empty_passes integer not null default 0,
  new_candidates_last_pass integer,
  last_pass_at timestamptz,
  next_pass_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_demand_queue_idx
  on public.school_demand (status, next_pass_at, user_count desc);

alter table public.school_demand enable row level security;
-- Service-role only (no policies): written and read exclusively by server code.
