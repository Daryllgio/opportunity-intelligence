import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getPlanLimitsForProfile } from "@/lib/billing/subscription";
import { processScoringJob } from "@/lib/scoring/process-scoring-job";
import { scheduleScoringJobForUser } from "@/lib/scoring/schedule-scoring-job";

function createServiceSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const supabase = createServiceSupabase();

    const now = new Date().toISOString();

    // Fresh-content pass: when opportunities have been published since a
    // user's last scoring run, schedule a refresh so new matches appear
    // without the user doing anything. Profile-change refreshes are handled
    // separately (the profile save flow schedules its own job).
    const freshContentJobs = await scheduleFreshContentJobs(supabase);

    const { data: jobs, error: jobsError } = await supabase
      .from("user_scoring_jobs")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(5);

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({
        ran: false,
        processed: 0,
        freshContentJobs,
        message: "No due scoring jobs found.",
      });
    }

    const results = [];

    for (const job of jobs) {
      const result = await processScoringJob({
        supabase,
        job,
        origin: request.nextUrl.origin,
      });

      results.push({
        job_id: job.id,
        user_id: job.user_id,
        ...result,
      });
    }

    return NextResponse.json({
      ran: true,
      processed: results.length,
      freshContentJobs,
      results,
    });
  } catch (error) {
    console.error(
      "run-scoring-jobs error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Failed to run scoring cron." },
      { status: 500 }
    );
  }
}

/**
 * Schedule refresh jobs for users on ranking plans when opportunities newer
 * than their latest score exist. Returns how many jobs were scheduled.
 */
async function scheduleFreshContentJobs(supabase: SupabaseClient) {
  const { data: newestOpportunity } = await supabase
    .from("opportunities")
    .select("created_at")
    .eq("is_active", true)
    .eq("is_approved", true)
    .eq("lifecycle_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!newestOpportunity?.created_at) return 0;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .neq("subscription_plan", "free");

  // Dormancy: auto-refresh is paid platform work, so it pauses for users who
  // haven't shown up in 21 days. The browse page's presence beacon flips
  // last_active_at the moment they return, and the on-arrival run-due call
  // gives them fresh scores immediately — pausing costs them nothing.
  const DORMANT_AFTER_DAYS = 21;
  const dormancyCutoff = Date.now() - DORMANT_AFTER_DAYS * 86400000;

  let scheduled = 0;

  for (const profile of profiles || []) {
    const planLimits = getPlanLimitsForProfile(profile as Record<string, unknown>);
    if (!planLimits.hasCompetitivenessRanking) continue;

    const lastActive = (profile as Record<string, unknown>).last_active_at;
    if (
      typeof lastActive === "string" &&
      new Date(lastActive).getTime() < dormancyCutoff
    ) {
      continue;
    }

    const { data: latestScore } = await supabase
      .from("opportunity_competitiveness_scores")
      .select("last_scored_at")
      .eq("user_id", profile.id)
      .order("last_scored_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    // Never scored: the initial-scoring path handles them on profile save.
    // Scored before the newest publish: schedule a refresh.
    if (
      latestScore?.last_scored_at &&
      latestScore.last_scored_at < newestOpportunity.created_at
    ) {
      try {
        const result = await scheduleScoringJobForUser({
          supabase,
          userId: profile.id,
          force: true,
        });
        if (result.scheduled) scheduled++;
      } catch (error) {
        console.error(
          "fresh-content scheduling failed:",
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  return scheduled;
}

// Vercel cron invokes routes with GET.
export async function GET(request: NextRequest) {
  return POST(request);
}
