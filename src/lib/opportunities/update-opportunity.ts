import { buildLifecycleFields } from "@/lib/opportunities/lifecycle";

type SupabaseClientLike = {
  from: (table: string) => any;
};

export async function updateOpportunityWithLifecycle({
  supabase,
  opportunityId,
  updates,
}: {
  supabase: SupabaseClientLike;
  opportunityId: string;
  updates: Record<string, unknown>;
}) {
  const { data: existingOpportunity, error: fetchError } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", opportunityId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (!existingOpportunity) {
    throw new Error("Opportunity not found.");
  }

  const mergedOpportunity = {
    ...existingOpportunity,
    ...updates,
  };

  const lifecycleFields = buildLifecycleFields(mergedOpportunity);
  const oldCriteriaHash = existingOpportunity.criteria_hash || null;
  const newCriteriaHash = lifecycleFields.criteria_hash;

  const { data: updatedOpportunity, error: updateError } = await supabase
    .from("opportunities")
    .update({
      ...updates,
      ...lifecycleFields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId)
    .select("*")
    .single();

  if (updateError) {
    throw new Error(updateError.message);
  }

  const criteriaChanged =
    Boolean(oldCriteriaHash) && oldCriteriaHash !== newCriteriaHash;

  if (criteriaChanged) {
    const { error: staleError } = await supabase
      .from("opportunity_competitiveness_scores")
      .update({
        score_status: "stale",
        stale_reason: "stale_opportunity_changed",
        updated_at: new Date().toISOString(),
      })
      .eq("opportunity_id", opportunityId)
      .eq("score_status", "current");

    if (staleError) {
      throw new Error(staleError.message);
    }
  }

  return {
    opportunity: updatedOpportunity,
    criteriaChanged,
    oldCriteriaHash,
    newCriteriaHash,
  };
}
