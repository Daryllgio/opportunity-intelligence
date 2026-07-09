/**
 * Execute one pending scoring job: mark running, run the batch scorer for
 * that user (best-first allocation, hash-gated, coverage-based quota), and
 * record the outcome. Shared by the daily cron and the on-browse runner so
 * a profile edit is reflected the next time the user looks at their matches
 * instead of waiting for tomorrow's cron.
 */
type SupabaseClientLike = {
  from: (table: string) => any;
};

export type ScoringJobRow = {
  id: string;
  user_id: string;
  attempts: number | null;
};

export async function processScoringJob({
  supabase,
  job,
  origin,
}: {
  supabase: SupabaseClientLike;
  job: ScoringJobRow;
  origin: string;
}): Promise<{
  status: "completed" | "failed";
  created: number;
  refreshed: number;
  error?: string;
}> {
  const startedAt = new Date().toISOString();

  // Claim: the daily cron and the on-browse runner can race for the same
  // pending job — compare-and-swap on status means exactly one wins, so a
  // job can never be double-processed (and its AI spend never doubled).
  const { data: claimed } = await supabase
    .from("user_scoring_jobs")
    .update({
      status: "running",
      started_at: startedAt,
      attempts: (job.attempts || 0) + 1,
      updated_at: startedAt,
    })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("id");

  if (!claimed || claimed.length === 0) {
    return {
      status: "failed",
      created: 0,
      refreshed: 0,
      error: "Job already claimed by another runner.",
    };
  }

  try {
    const scoreResponse = await fetch(`${origin}/api/score-opportunities-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scoreAllEligible: true,
        cronUserId: job.user_id,
        cronSecret: process.env.CRON_SECRET,
      }),
    });

    const scoreResult = await scoreResponse.json();

    if (!scoreResponse.ok) {
      throw new Error(scoreResult.error || "Scoring route failed.");
    }

    const created = scoreResult.counts?.created || 0;
    const refreshed = scoreResult.counts?.refreshed || 0;

    await supabase
      .from("user_scoring_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        scores_created: created,
        scores_refreshed: refreshed,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return { status: "completed", created, refreshed };
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

    return { status: "failed", created: 0, refreshed: 0, error: message };
  }
}
