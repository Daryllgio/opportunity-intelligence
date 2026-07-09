/**
 * Deadline reminder emails.
 *
 * A daily cron finds saved opportunities whose deadline is exactly 7 days,
 * 3 days, or 0 days away, and emails the owner (paid plans only, opt-out via
 * profiles.email_deadline_reminders). Every send is recorded in
 * email_notification_log with a unique (user, opportunity, milestone) key so
 * a reminder can never be sent twice.
 *
 * Sending uses Resend when RESEND_API_KEY is configured. Without a key the
 * run reports what it WOULD send and records nothing, so reminders begin
 * flowing the day the key is added.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getPlanLimitsForProfile } from "@/lib/billing/subscription";

const REMINDER_MILESTONES = [
  { daysBefore: 7, type: "deadline_7d", label: "in one week" },
  { daysBefore: 3, type: "deadline_3d", label: "in 3 days" },
  { daysBefore: 0, type: "deadline_today", label: "today" },
] as const;

const FROM_ADDRESS = process.env.NOTIFICATION_FROM_EMAIL || "OppScore <notifications@oppscore.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://oppscore.app";

type ReminderCandidate = {
  userId: string;
  email: string;
  opportunityId: string;
  title: string;
  provider: string | null;
  deadline: string;
  applicationUrl: string | null;
  milestone: (typeof REMINDER_MILESTONES)[number];
};

function isoDateInDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDeadline(deadline: string) {
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return deadline;
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function buildReminderEmail(candidate: ReminderCandidate) {
  const { title, provider, deadline, opportunityId, milestone } = candidate;
  const detailUrl = `${APP_URL}/opportunities/${opportunityId}`;
  const subject =
    milestone.type === "deadline_today"
      ? `Deadline today: ${title}`
      : `Deadline ${milestone.label}: ${title}`;

  const html = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
  <p style="font-size: 14px; font-weight: 600; margin: 0 0 24px;">OppScore</p>
  <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 8px;">
    Application deadline ${milestone.label}
  </h1>
  <p style="font-size: 15px; line-height: 1.6; color: #404040; margin: 0 0 24px;">
    A saved opportunity is due ${milestone.label}, on ${formatDeadline(deadline)}.
  </p>
  <div style="border: 1px solid #e5e5e5; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="font-size: 16px; font-weight: 600; margin: 0 0 4px;">${title}</p>
    ${provider ? `<p style="font-size: 14px; color: #737373; margin: 0;">${provider}</p>` : ""}
  </div>
  <a href="${detailUrl}"
     style="display: inline-block; background: #5558cc; color: #ffffff; font-size: 14px; font-weight: 500; padding: 10px 20px; border-radius: 8px; text-decoration: none;">
    View opportunity
  </a>
  <p style="font-size: 12px; color: #a3a3a3; margin: 32px 0 0; line-height: 1.6;">
    You are receiving this because you saved this opportunity on OppScore and
    deadline reminders are enabled. Manage reminders in
    <a href="${APP_URL}/settings" style="color: #737373;">Settings</a>.
  </p>
</div>`;

  return { subject, html };
}

export async function runDeadlineReminders({
  supabase,
}: {
  supabase: SupabaseClient;
}) {
  const resendKey = process.env.RESEND_API_KEY;
  const resend = resendKey ? new Resend(resendKey) : null;

  const summary = {
    candidates: 0,
    sent: 0,
    skippedPlan: 0,
    skippedPreference: 0,
    skippedAlreadySent: 0,
    wouldSendWithoutKey: 0,
    errors: [] as string[],
    emailServiceConfigured: Boolean(resend),
  };

  for (const milestone of REMINDER_MILESTONES) {
    const targetDate = isoDateInDays(milestone.daysBefore);

    const { data: saved, error } = await supabase
      .from("saved_opportunities")
      .select(
        `user_id, opportunity_id,
         opportunities!inner (id, title, provider, deadline, application_url, is_active, lifecycle_status)`
      )
      .eq("opportunities.deadline", targetDate)
      .eq("opportunities.is_active", true)
      .eq("opportunities.lifecycle_status", "active");

    if (error) {
      summary.errors.push(`query(${milestone.type}): ${error.message}`);
      continue;
    }

    for (const row of (saved || []) as Array<Record<string, any>>) {
      const opportunity = Array.isArray(row.opportunities)
        ? row.opportunities[0]
        : row.opportunities;
      if (!opportunity) continue;

      summary.candidates++;

      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_plan, email_deadline_reminders")
        .eq("id", row.user_id)
        .maybeSingle();

      const planLimits = getPlanLimitsForProfile(profile as Record<string, unknown> | null);
      if (!planLimits.hasDeadlineReminders) {
        summary.skippedPlan++;
        continue;
      }

      // Column may not exist until the migration is applied — treat missing
      // as the default (enabled).
      if (profile && profile.email_deadline_reminders === false) {
        summary.skippedPreference++;
        continue;
      }

      const { data: userResult, error: userError } =
        await supabase.auth.admin.getUserById(row.user_id);
      const email = userResult?.user?.email;
      if (userError || !email) {
        summary.errors.push(`no email for user ${row.user_id}`);
        continue;
      }

      const candidate: ReminderCandidate = {
        userId: row.user_id,
        email,
        opportunityId: opportunity.id,
        title: opportunity.title,
        provider: opportunity.provider,
        deadline: opportunity.deadline,
        applicationUrl: opportunity.application_url,
        milestone,
      };

      if (!resend) {
        summary.wouldSendWithoutKey++;
        continue;
      }

      // Dedupe: the unique index makes this insert fail if already sent.
      const { error: logError } = await supabase
        .from("email_notification_log")
        .insert({
          user_id: row.user_id,
          opportunity_id: opportunity.id,
          notification_type: milestone.type,
        });

      if (logError) {
        if (logError.code === "23505") {
          summary.skippedAlreadySent++;
        } else {
          summary.errors.push(`log insert: ${logError.message}`);
        }
        continue;
      }

      try {
        const { subject, html } = buildReminderEmail(candidate);
        const { error: sendError } = await resend.emails.send({
          from: FROM_ADDRESS,
          to: email,
          subject,
          html,
        });

        if (sendError) {
          summary.errors.push(`send failed: ${sendError.message}`);
          // Roll the log row back so the reminder retries tomorrow.
          await supabase
            .from("email_notification_log")
            .delete()
            .eq("user_id", row.user_id)
            .eq("opportunity_id", opportunity.id)
            .eq("notification_type", milestone.type);
          continue;
        }

        summary.sent++;
      } catch (sendException) {
        summary.errors.push(
          `send exception: ${
            sendException instanceof Error ? sendException.message : "unknown"
          }`
        );
        await supabase
          .from("email_notification_log")
          .delete()
          .eq("user_id", row.user_id)
          .eq("opportunity_id", opportunity.id)
          .eq("notification_type", milestone.type);
      }
    }
  }

  return summary;
}
