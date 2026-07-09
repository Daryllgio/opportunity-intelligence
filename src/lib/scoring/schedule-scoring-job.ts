import { getPlanLimits } from "@/lib/billing/plans";
import { buildProfileScoringHash } from "@/lib/scoring/hashes";
import { profileScoringGate } from "@/lib/scoring/profile-gate";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type ExperienceSummaryRow = {
  section_key: string;
  experience_key: string;
  raw_content_hash: string | null;
  summary: string | null;
  evidence_tags: string[] | null;
  notable_metrics: string[] | null;
};

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function laterDate(left: Date, right: Date) {
  return left.getTime() > right.getTime() ? left : right;
}

export async function scheduleScoringJobForUser({
  supabase,
  userId,
  force = false,
}: {
  supabase: SupabaseClientLike;
  userId: string;
  force?: boolean;
}) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile) {
    return {
      scheduled: false,
      mode: "profile_missing",
      message: "Profile not found.",
    };
  }

  const plan = profile.subscription_plan || "free";
  const planLimits = getPlanLimits(plan);

  if (!planLimits.hasCompetitivenessRanking) {
    return {
      scheduled: false,
      mode: "plan_without_ranking",
      message: "This plan does not include competitiveness ranking.",
    };
  }

  const gate = profileScoringGate(profile as Record<string, unknown>);
  if (!gate.complete) {
    return {
      scheduled: false,
      mode: "profile_incomplete",
      message: `Scoring unlocks when the profile is complete. Missing: ${gate.missing.join(", ")}.`,
      missingFields: gate.missing,
    };
  }

  const { data: experienceSummaries, error: summaryError } = await supabase
    .from("profile_experience_summaries")
    .select(
      "section_key, experience_key, raw_content_hash, summary, evidence_tags, notable_metrics"
    )
    .eq("user_id", userId);

  if (summaryError) {
    throw new Error(summaryError.message);
  }

  const currentProfileScoringHash = buildProfileScoringHash({
    profile: profile as Record<string, unknown>,
    experienceSummaries: (experienceSummaries || []) as ExperienceSummaryRow[],
  });

  const { data: existingScores } = await supabase
    .from("opportunity_competitiveness_scores")
    .select("id, profile_scoring_hash, last_scored_at")
    .eq("user_id", userId)
    .order("last_scored_at", { ascending: false, nullsFirst: false })
    .limit(1);

  const { data: latestCompletedJob } = await supabase
    .from("user_scoring_jobs")
    .select("id, completed_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .in("job_type", ["initial_scoring", "profile_refresh"])
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const latestScore = existingScores?.[0] || null;
  const hasExistingScores = Boolean(latestScore);

  const now = new Date();
  const jobType = hasExistingScores ? "profile_refresh" : "initial_scoring";

  const baseScheduledFor = !hasExistingScores ? now : addMinutes(now, 10);

  const minimumNextRefreshAt = latestCompletedJob?.completed_at
    ? addMinutes(new Date(latestCompletedJob.completed_at), 30)
    : baseScheduledFor;

  const scheduledFor = hasExistingScores
    ? laterDate(baseScheduledFor, minimumNextRefreshAt)
    : baseScheduledFor;

  const { data: existingPendingJob } = await supabase
    .from("user_scoring_jobs")
    .select("id, profile_scoring_hash")
    .eq("user_id", userId)
    .eq("status", "pending")
    .in("job_type", ["initial_scoring", "profile_refresh"])
    .maybeSingle();

  if (
    !force &&
    !existingPendingJob &&
    latestScore?.profile_scoring_hash &&
    latestScore.profile_scoring_hash === currentProfileScoringHash
  ) {
    return {
      scheduled: false,
      mode: "profile_hash_unchanged",
      message: "Profile scoring version has not changed. No scoring job scheduled.",
    };
  }

  if (
    existingPendingJob?.id &&
    existingPendingJob.profile_scoring_hash === currentProfileScoringHash
  ) {
    return {
      scheduled: true,
      mode: "existing_pending_job_already_current",
      message: "A scoring job is already pending for this profile version.",
      job: existingPendingJob,
    };
  }

  if (existingPendingJob?.id) {
    const { data: updatedJob, error: updateError } = await supabase
      .from("user_scoring_jobs")
      .update({
        job_type: jobType,
        profile_scoring_hash: currentProfileScoringHash,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingPendingJob.id)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return {
      scheduled: true,
      mode: "updated_existing_pending_job",
      job: updatedJob,
    };
  }

  const { data: createdJob, error: insertError } = await supabase
    .from("user_scoring_jobs")
    .insert({
      user_id: userId,
      job_type: jobType,
      status: "pending",
      profile_scoring_hash: currentProfileScoringHash,
      scheduled_for: scheduledFor.toISOString(),
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    scheduled: true,
    mode: "created_new_job",
    job: createdJob,
  };
}

export async function scheduleScoringJobsForUsers({
  supabase,
  userIds,
  force = false,
}: {
  supabase: SupabaseClientLike;
  userIds: string[];
  force?: boolean;
}) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  const results = [];

  for (const userId of uniqueUserIds) {
    try {
      const result = await scheduleScoringJobForUser({
        supabase,
        userId,
        force,
      });

      results.push({
        userId,
        ...result,
      });
    } catch (error) {
      results.push({
        userId,
        scheduled: false,
        mode: "error",
        error: error instanceof Error ? error.message : "Failed to schedule job.",
      });
    }
  }

  return {
    requested: userIds.length,
    processed: uniqueUserIds.length,
    scheduled: results.filter((item) => item.scheduled).length,
    results,
  };
}
