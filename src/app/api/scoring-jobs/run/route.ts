import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function createSupabaseForRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    }
  );
}

function getBaseUrl(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) return origin;

  const host = request.headers.get("host");
  const protocol = host?.includes("localhost") ? "http" : "https";

  return `${protocol}://${host}`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseForRequest(request);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to run scoring jobs." },
        { status: 401 }
      );
    }

    const now = new Date().toISOString();

    const { data: job, error: jobError } = await supabase
      .from("user_scoring_jobs")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 });
    }

    if (!job) {
      return NextResponse.json({
        ran: false,
        message: "No due scoring jobs found.",
      });
    }

    const { error: startError } = await supabase
      .from("user_scoring_jobs")
      .update({
        status: "running",
        started_at: now,
        attempts: (job.attempts || 0) + 1,
        updated_at: now,
      })
      .eq("id", job.id);

    if (startError) {
      return NextResponse.json({ error: startError.message }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization") || "";
    const response = await fetch(`${getBaseUrl(request)}/api/score-opportunities-batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        scoreAllEligible: true,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      const errorMessage = result.error || "Scoring job failed.";

      await supabase
        .from("user_scoring_jobs")
        .update({
          status: "failed",
          last_error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      return NextResponse.json(
        {
          error: errorMessage,
          job,
        },
        { status: response.status }
      );
    }

    const scoresCreated = result.counts?.created || 0;
    const scoresRefreshed = result.counts?.refreshed || 0;
    const scoresTotal = result.counts?.total || result.scores?.length || 0;

    const { data: completedJob, error: completeError } = await supabase
      .from("user_scoring_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        scores_created: scoresCreated,
        scores_refreshed: scoresRefreshed,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .select("*")
      .single();

    if (completeError) {
      return NextResponse.json({ error: completeError.message }, { status: 500 });
    }

    return NextResponse.json({
      ran: true,
      job: completedJob,
      scoring: {
        ...result,
        counts: {
          total: scoresTotal,
          created: scoresCreated,
          refreshed: scoresRefreshed,
        },
      },
    });
  } catch (error) {
    console.error("scoring-jobs/run error:", error);
    return NextResponse.json(
      { error: "Failed to run scoring job." },
      { status: 500 }
    );
  }
}
