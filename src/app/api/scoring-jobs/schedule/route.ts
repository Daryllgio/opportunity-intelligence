import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getPlanLimits } from "@/lib/billing/plans";
import { buildProfileScoringHash } from "@/lib/scoring/hashes";

type ExperienceSummaryRow = {
  section_key: string;
  experience_key: string;
  raw_content_hash: string | null;
  summary: string | null;
  evidence_tags: string[] | null;
  notable_metrics: string[] | null;
};

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

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
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
        { error: "You must be logged in to schedule scoring." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Complete your profile before scheduling scoring." },
        { status: 400 }
      );
    }

    const plan = profile.subscription_plan || "free";
    const planLimits = getPlanLimits(plan);

    if (!planLimits.hasCompetitivenessRanking) {
      return NextResponse.json({
        scheduled: false,
        message: "This plan does not include competitiveness ranking.",
      });
    }

    const { data: experienceSummaries, error: summaryError } = await supabase
      .from("profile_experience_summaries")
      .select(
        "section_key, experience_key, raw_content_hash, summary, evidence_tags, notable_metrics"
      )
      .eq("user_id", user.id);

    if (summaryError) {
      return NextResponse.json({ error: summaryError.message }, { status: 500 });
    }

    const currentProfileScoringHash = buildProfileScoringHash({
      profile: profile as Record<string, unknown>,
      experienceSummaries: (experienceSummaries || []) as ExperienceSummaryRow[],
    });

    const { data: existingScores } = await supabase
      .from("opportunity_competitiveness_scores")
      .select("id, profile_scoring_hash, last_scored_at")
      .eq("user_id", user.id)
      .order("last_scored_at", { ascending: false, nullsFirst: false })
      .limit(1);

    const latestScore = existingScores?.[0] || null;
    const hasExistingScores = Boolean(latestScore);

    const now = new Date();
    const jobType = hasExistingScores ? "profile_refresh" : "initial_scoring";

    const scheduledFor = !hasExistingScores
      ? now
      : planLimits.rankingRefreshLevel === "priority"
        ? addMinutes(now, 15)
        : addMinutes(now, 60);

    const { data: existingPendingJob } = await supabase
      .from("user_scoring_jobs")
      .select("id, profile_scoring_hash")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .in("job_type", ["initial_scoring", "profile_refresh"])
      .maybeSingle();

    if (
      !existingPendingJob &&
      latestScore?.profile_scoring_hash &&
      latestScore.profile_scoring_hash === currentProfileScoringHash
    ) {
      return NextResponse.json({
        scheduled: false,
        mode: "profile_hash_unchanged",
        message: "Profile scoring version has not changed. No scoring job scheduled.",
      });
    }

    if (
      existingPendingJob?.id &&
      existingPendingJob.profile_scoring_hash === currentProfileScoringHash
    ) {
      return NextResponse.json({
        scheduled: true,
        mode: "existing_pending_job_already_current",
        job: existingPendingJob,
      });
    }

    if (existingPendingJob?.id) {
      const { data: updatedJob, error: updateError } = await supabase
        .from("user_scoring_jobs")
        .update({
          job_type: jobType,
          profile_scoring_hash: currentProfileScoringHash,
          scheduled_for: scheduledFor.toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPendingJob.id)
        .select("*")
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({
        scheduled: true,
        mode: "updated_existing_pending_job",
        job: updatedJob,
      });
    }

    const { data: createdJob, error: insertError } = await supabase
      .from("user_scoring_jobs")
      .insert({
        user_id: user.id,
        job_type: jobType,
        status: "pending",
        profile_scoring_hash: currentProfileScoringHash,
        scheduled_for: scheduledFor.toISOString(),
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      scheduled: true,
      mode: "created_new_job",
      job: createdJob,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to schedule scoring job.",
      },
      { status: 500 }
    );
  }
}
