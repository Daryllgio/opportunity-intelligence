-- SCHEMA CHANGE (2026-07): email notifications + user issue reports.
-- Why: deadline reminder emails need a per-user opt-out, a dedupe log so a
-- reminder is sent at most once per (user, opportunity, milestone), and the
-- "Report issue" button needs somewhere to store user feedback.
-- Apply in the Supabase SQL editor.

-- 1. Notification preference (default on; surfaced in /settings).
alter table profiles
add column if not exists email_deadline_reminders boolean default true;

-- 2. Log of sent notification emails (dedupe + audit). Service-role access
--    only — no user-facing policies.
create table if not exists email_notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  notification_type text not null,
  sent_at timestamptz not null default now()
);

create unique index if not exists email_notification_log_unique
on email_notification_log (user_id, opportunity_id, notification_type);

alter table email_notification_log enable row level security;

-- 3. User-submitted reports about broken/wrong opportunity links.
create table if not exists opportunity_reports (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  report_type text not null check (
    report_type in ('dead_link', 'wrong_page', 'not_relevant', 'aggregator_page', 'other')
  ),
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table opportunity_reports enable row level security;

create policy "Users can file reports"
on opportunity_reports for insert
to authenticated
with check (auth.uid() = user_id);
