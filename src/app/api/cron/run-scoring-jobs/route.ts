import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

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
        message: "No due scoring jobs found.",
      });
    }

    const results = [];

    for (const job of jobs) {
      const startedAt = new Date().toISOString();

      await supabase
        .from("user_scoring_jobs")
        .update({
          status: "running",
          started_at: startedAt,
          attempts: (job.attempts || 0) + 1,
          updated_at: startedAt,
        })
        .eq("id", job.id);

      try {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", job.user_id)
          .maybeSingle();

        if (profileError || !profile) {
          throw new Error("Profile not found for scoring job.");
        }

        const scoreResponse = await fetch(
          `${request.nextUrl.origin}/api/score-opportunities-batch`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: request.headers.get("authorization") || "",
            },
            body: JSON.stringify({
              scoreAllEligible: true,
              cronUserId: job.user_id,
              cronSecret: process.env.CRON_SECRET,
            }),
          }
        );

        const scoreResult = await scoreResponse.json();

        if (!scoreResponse.ok) {
          throw new Error(scoreResult.error || "Scoring route failed.");
        }

        const created = scoreResult.counts?.created || 0;
        const refreshed = scoreResult.counts?.refreshed || 0;

        const { data: completedJob } = await supabase
          .from("user_scoring_jobs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            scores_created: created,
            scores_refreshed: refreshed,
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .select("*")
          .single();

        results.push({
          job_id: job.id,
          user_id: job.user_id,
          status: "completed",
          created,
          refreshed,
          completedJob,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown scoring job error.";

        await supabase
          .from("user_scoring_jobs")
          .update({
            status: "failed",
            last_error: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        results.push({
          job_id: job.id,
          user_id: job.user_id,
          status: "failed",
          error: message,
        });
      }
    }

    return NextResponse.json({
      ran: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run scoring cron.",
      },
      { status: 500 }
    );
  }
}
