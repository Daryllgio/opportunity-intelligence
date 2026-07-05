/**
 * Process opportunities whose next_check_at has arrived. This is the renewal
 * engine's heartbeat: expired rows in their renewal window get re-read, and
 * when the page is back with a new deadline a renewed cycle is published
 * (destination-verified) with prior user scores reused when nothing material
 * changed. Rolling and pre-deadline checks keep live rows honest.
 *
 * The database is a durable asset: re-checking a known opportunity here costs
 * one fetch (and a model call only when the page actually changed) — far
 * cheaper than rediscovering it from scratch through search.
 */
import { recheckOpportunity } from "@/lib/opportunities/recheck-opportunity";

type SupabaseClientLike = {
  from: (table: string) => any;
};

export type DueCheckSummary = {
  processed: number;
  renewalWindow: number;
  preDeadline: number;
  rolling: number;
  usedGemini: number;
  unchanged: number;
  contentChanged: number;
  criteriaChanged: number;
  extractedNoStructuredChange: number;
  missingUrl: number;
  fetchFailed: number;
  renewedCreated: number;
  renewedUpdated: number;
  existingRenewedLinked: number;
  failed: number;
  scoresMarkedStale: number;
  scoresReused: number;
};

export async function runDueOpportunityChecks({
  supabase,
  limit = 25,
}: {
  supabase: SupabaseClientLike;
  limit?: number;
}): Promise<DueCheckSummary> {
  const summary: DueCheckSummary = {
    processed: 0,
    renewalWindow: 0,
    preDeadline: 0,
    rolling: 0,
    usedGemini: 0,
    unchanged: 0,
    contentChanged: 0,
    criteriaChanged: 0,
    extractedNoStructuredChange: 0,
    missingUrl: 0,
    fetchFailed: 0,
    renewedCreated: 0,
    renewedUpdated: 0,
    existingRenewedLinked: 0,
    failed: 0,
    scoresMarkedStale: 0,
    scoresReused: 0,
  };

  const { data: dueOpportunities, error: dueError } = await supabase
    .from("opportunities")
    .select("*")
    .neq("lifecycle_status", "archived")
    .not("next_check_at", "is", null)
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at", { ascending: true })
    .limit(limit);

  if (dueError) {
    throw new Error(dueError.message);
  }

  for (const opportunity of dueOpportunities || []) {
    summary.processed += 1;

    if (opportunity.check_reason === "renewal_window") summary.renewalWindow += 1;
    if (opportunity.check_reason === "pre_deadline_verification") {
      summary.preDeadline += 1;
    }
    if (opportunity.check_reason === "rolling_recheck") summary.rolling += 1;

    try {
      const result = await recheckOpportunity({
        supabase,
        opportunityId: opportunity.id,
      });

      if (result.usedGemini) summary.usedGemini += 1;
      if (result.outcome === "unchanged_page") summary.unchanged += 1;
      if (result.outcome === "missing_url") summary.missingUrl += 1;
      if (result.outcome === "fetch_failed") summary.fetchFailed += 1;
      if (result.outcome === "renewed_cycle_created") summary.renewedCreated += 1;
      if (result.outcome === "renewed_cycle_updated") summary.renewedUpdated += 1;
      if (result.outcome === "existing_renewed_cycle_linked") {
        summary.existingRenewedLinked += 1;
      }
      if (result.outcome === "extracted_no_structured_change") {
        summary.extractedNoStructuredChange += 1;
      }
      if (result.contentChanged) summary.contentChanged += 1;
      if (result.criteriaChanged) summary.criteriaChanged += 1;
      summary.scoresMarkedStale += result.scoresMarkedStale || 0;
      summary.scoresReused += result.reusedScores || 0;
    } catch (error) {
      summary.failed += 1;

      await supabase
        .from("opportunities")
        .update({
          last_recheck_error:
            error instanceof Error
              ? error.message
              : "Failed during due opportunity recheck.",
          last_rechecked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", opportunity.id);
    }
  }

  return summary;
}
