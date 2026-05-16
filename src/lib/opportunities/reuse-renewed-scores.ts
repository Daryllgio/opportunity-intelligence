type SupabaseClientLike = {
  from: (table: string) => any;
};

export async function reuseScoresForRenewedOpportunity({
  supabase,
  oldOpportunityId,
  newOpportunityId,
  newCriteriaHash,
}: {
  supabase: SupabaseClientLike;
  oldOpportunityId: string;
  newOpportunityId: string;
  newCriteriaHash: string | null;
}) {
  if (!newCriteriaHash) {
    return {
      reused: 0,
      skipped: 0,
      reason: "missing_new_criteria_hash",
    };
  }

  const { data: previousScores, error: previousScoresError } = await supabase
    .from("opportunity_competitiveness_scores")
    .select(
      "user_id, score, fit_label, model_used, profile_snapshot, opportunity_snapshot, profile_scoring_hash, opportunity_content_hash, opportunity_criteria_hash"
    )
    .eq("opportunity_id", oldOpportunityId)
    .eq("opportunity_criteria_hash", newCriteriaHash)
    .not("profile_scoring_hash", "is", null);

  if (previousScoresError) {
    throw new Error(previousScoresError.message);
  }

  if (!previousScores || previousScores.length === 0) {
    return {
      reused: 0,
      skipped: 0,
      reason: "no_reusable_scores",
    };
  }

  const userIds = previousScores.map((score: Record<string, unknown>) =>
    String(score.user_id)
  );

  const { data: existingNewScores, error: existingNewScoresError } =
    await supabase
      .from("opportunity_competitiveness_scores")
      .select("user_id")
      .eq("opportunity_id", newOpportunityId)
      .eq("score_status", "current")
      .in("user_id", userIds);

  if (existingNewScoresError) {
    throw new Error(existingNewScoresError.message);
  }

  const usersWithCurrentNewScores = new Set(
    (existingNewScores || []).map((score: Record<string, unknown>) =>
      String(score.user_id)
    )
  );

  const now = new Date().toISOString();

  const reusableRows = previousScores
    .filter(
      (score: Record<string, unknown>) =>
        !usersWithCurrentNewScores.has(String(score.user_id))
    )
    .map((score: Record<string, unknown>) => ({
      user_id: score.user_id,
      opportunity_id: newOpportunityId,
      score: score.score,
      fit_label: score.fit_label,
      model_used: "reused_from_previous_cycle",
      profile_snapshot: score.profile_snapshot,
      opportunity_snapshot: score.opportunity_snapshot,
      profile_scoring_hash: score.profile_scoring_hash,
      opportunity_content_hash: score.opportunity_content_hash,
      opportunity_criteria_hash: newCriteriaHash,
      score_status: "current",
      stale_reason: null,
      last_scored_at: now,
      updated_at: now,
    }));

  if (reusableRows.length === 0) {
    return {
      reused: 0,
      skipped: previousScores.length,
      reason: "new_opportunity_already_scored",
    };
  }

  const { error: upsertError } = await supabase
    .from("opportunity_competitiveness_scores")
    .upsert(reusableRows, {
      onConflict: "user_id,opportunity_id",
    });

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  return {
    reused: reusableRows.length,
    skipped: previousScores.length - reusableRows.length,
    reason: "reused",
  };
}
