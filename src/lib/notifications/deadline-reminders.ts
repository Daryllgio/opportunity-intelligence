/**
 * Deadline reminder DIGESTS.
 *
 * Never one email per opportunity. A user gets at most ONE email per day,
 * and only on days when something newly matters — when a saved opportunity
 * crosses the 7-day, 3-day, or day-of milestone. The email then shows their
 * WHOLE week ahead grouped by urgency ("Due today", "Next 3 days", "This
 * week"), so one message carries full context instead of a drip of pings.
 *
 * Dedupe is structural: email_digest_log has a unique (user, date) key, so
 * a re-run or a second cron invocation can never double-send. Paid plans
 * only; per-user opt-out via profiles.email_deadline_reminders.
 *
 * Sending uses Resend when RESEND_API_KEY is configured. Without a key the
 * run reports what it WOULD send and records nothing, so digests begin
 * flowing the day the key is added.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getPlanLimitsForProfile } from "@/lib/billing/subscription";

const FROM_ADDRESS =
  process.env.NOTIFICATION_FROM_EMAIL || "OppScore <notifications@oppscore.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://oppscore.app";

const MILESTONE_DAYS = new Set([0, 3, 7]);
const WINDOW_DAYS = 7;

type DigestItem = {
  opportunityId: string;
  title: string;
  provider: string | null;
  deadline: string;
  daysLeft: number;
};

function daysUntilUtc(deadline: string, todayUtc: string): number {
  const due = Date.parse(`${deadline}T00:00:00Z`);
  const today = Date.parse(`${todayUtc}T00:00:00Z`);
  return Math.round((due - today) / 86400000);
}

function formatDeadline(deadline: string) {
  const parsed = new Date(`${deadline}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return deadline;
  return parsed.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function renderGroup(label: string, items: DigestItem[]): string {
  if (items.length === 0) return "";
  const rows = items
    .map(
      (item) => `
      <div style="border: 1px solid #e5e5e5; border-radius: 8px; padding: 14px 16px; margin-bottom: 8px;">
        <a href="${APP_URL}/opportunities/${item.opportunityId}"
           style="font-size: 15px; font-weight: 600; color: #1a1a1a; text-decoration: none;">
          ${item.title}
        </a>
        <p style="font-size: 13px; color: #525252; margin: 4px 0 0;">
          ${item.provider ? `${item.provider} · ` : ""}${formatDeadline(item.deadline)}
        </p>
      </div>`
    )
    .join("");
  return `
    <p style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #737373; margin: 24px 0 10px;">
      ${label}
    </p>
    ${rows}`;
}

export function buildDigestEmail(items: DigestItem[]) {
  const today = items.filter((item) => item.daysLeft <= 0);
  const soon = items.filter((item) => item.daysLeft > 0 && item.daysLeft <= 3);
  const thisWeek = items.filter((item) => item.daysLeft > 3);

  const subject =
    today.length > 0
      ? `Deadline today: ${today[0].title}${items.length > 1 ? ` and ${items.length - 1} more this week` : ""}`
      : `You have ${items.length} deadline${items.length === 1 ? "" : "s"} in the next 7 days`;

  const html = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
  <p style="font-size: 14px; font-weight: 600; margin: 0 0 24px;">OppScore</p>
  <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 8px;">
    Your week of deadlines
  </h1>
  <p style="font-size: 15px; line-height: 1.6; color: #404040; margin: 0;">
    ${items.length} saved opportunit${items.length === 1 ? "y closes" : "ies close"} in the next ${WINDOW_DAYS} days.
  </p>
  ${renderGroup("Due today", today)}
  ${renderGroup("Next 3 days", soon)}
  ${renderGroup("This week", thisWeek)}
  <a href="${APP_URL}/saved"
     style="display: inline-block; background: #5558cc; color: #ffffff; font-size: 14px; font-weight: 500; padding: 10px 20px; border-radius: 8px; text-decoration: none; margin-top: 24px;">
    Open your saved list
  </a>
  <p style="font-size: 12px; color: #a3a3a3; margin: 32px 0 0; line-height: 1.6;">
    You receive at most one of these a day, only when a saved deadline gets
    close. Manage reminders in
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
    usersConsidered: 0,
    digestsSent: 0,
    skippedPlan: 0,
    skippedPreference: 0,
    skippedAlreadySent: 0,
    skippedNoMilestone: 0,
    wouldSendWithoutKey: 0,
    errors: [] as string[],
    emailServiceConfigured: Boolean(resend),
  };

  const todayUtc = new Date().toISOString().slice(0, 10);
  const windowEnd = new Date(Date.now() + WINDOW_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);

  // Everything saved with a deadline inside the window, in one query.
  const { data: saved, error } = await supabase
    .from("saved_opportunities")
    .select(
      `user_id,
       opportunities!inner (id, title, provider, deadline, is_active, lifecycle_status)`
    )
    .gte("opportunities.deadline", todayUtc)
    .lte("opportunities.deadline", windowEnd)
    .eq("opportunities.is_active", true)
    .eq("opportunities.lifecycle_status", "active");

  if (error) {
    summary.errors.push(`query: ${error.message}`);
    return summary;
  }

  // Group per user.
  const byUser = new Map<string, DigestItem[]>();
  for (const row of (saved || []) as Array<Record<string, any>>) {
    const opportunity = Array.isArray(row.opportunities)
      ? row.opportunities[0]
      : row.opportunities;
    if (!opportunity?.deadline) continue;
    const items = byUser.get(row.user_id) || [];
    items.push({
      opportunityId: opportunity.id,
      title: opportunity.title,
      provider: opportunity.provider,
      deadline: opportunity.deadline,
      daysLeft: daysUntilUtc(opportunity.deadline, todayUtc),
    });
    byUser.set(row.user_id, items);
  }

  for (const [userId, items] of byUser) {
    summary.usersConsidered++;

    // Send only on milestone days — otherwise a static list would repeat
    // daily, which is exactly the annoyance digests exist to prevent.
    const hasMilestone = items.some((item) => MILESTONE_DAYS.has(item.daysLeft));
    if (!hasMilestone) {
      summary.skippedNoMilestone++;
      continue;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    const planLimits = getPlanLimitsForProfile(
      profile as Record<string, unknown> | null
    );
    if (!planLimits.hasDeadlineReminders) {
      summary.skippedPlan++;
      continue;
    }
    if (
      profile &&
      (profile as Record<string, unknown>).email_deadline_reminders === false
    ) {
      summary.skippedPreference++;
      continue;
    }

    const { data: userResult, error: userError } =
      await supabase.auth.admin.getUserById(userId);
    const email = userResult?.user?.email;
    if (userError || !email) {
      summary.errors.push(`no email for user ${userId}`);
      continue;
    }

    if (!resend) {
      summary.wouldSendWithoutKey++;
      continue;
    }

    // Structural dedupe: unique (user, date) — insert first, send second.
    const { error: logError } = await supabase.from("email_digest_log").insert({
      user_id: userId,
      digest_date: todayUtc,
      deadline_count: items.length,
    });
    if (logError) {
      if (logError.code === "23505") summary.skippedAlreadySent++;
      else summary.errors.push(`digest log: ${logError.message}`);
      continue;
    }

    try {
      items.sort((a, b) => a.daysLeft - b.daysLeft);
      const { subject, html } = buildDigestEmail(items);
      const { error: sendError } = await resend.emails.send({
        from: FROM_ADDRESS,
        to: email,
        subject,
        html,
      });

      if (sendError) {
        summary.errors.push(`send failed: ${sendError.message}`);
        // Roll the log back so tomorrow's run retries.
        await supabase
          .from("email_digest_log")
          .delete()
          .eq("user_id", userId)
          .eq("digest_date", todayUtc);
        continue;
      }
      summary.digestsSent++;
    } catch (sendException) {
      summary.errors.push(
        `send exception: ${sendException instanceof Error ? sendException.message : "unknown"}`
      );
      await supabase
        .from("email_digest_log")
        .delete()
        .eq("user_id", userId)
        .eq("digest_date", todayUtc);
    }
  }

  return summary;
}
