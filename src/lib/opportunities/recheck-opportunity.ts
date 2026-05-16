import {
  buildLifecycleFields,
  buildOpportunityContentHash,
  buildOpportunityCriteriaHash,
} from "@/lib/opportunities/lifecycle";
import {
  fetchAndHashOpportunityPage,
  pickRecheckUrl,
} from "@/lib/opportunities/page-recheck";
import { reextractOpportunityFromPage } from "@/lib/opportunities/reextract-opportunity";

type SupabaseClientLike = {
  from: (table: string) => any;
};

function mergeExtractedOpportunity({
  existing,
  extracted,
}: {
  existing: Record<string, unknown>;
  extracted: Record<string, unknown>;
}) {
  return {
    title: extracted.title || existing.title,
    provider: extracted.provider || existing.provider,
    type: extracted.type || existing.type,
    description: extracted.description || existing.description,
    ai_summary: extracted.ai_summary || existing.ai_summary,
    country: extracted.country || existing.country || "Global",
    eligible_countries:
      extracted.eligible_countries || existing.eligible_countries || [],
    eligible_education_levels:
      extracted.eligible_education_levels ||
      existing.eligible_education_levels ||
      [],
    eligible_fields: extracted.eligible_fields || existing.eligible_fields || [],
    funding_amount: extracted.funding_amount || existing.funding_amount,
    funding_type: extracted.funding_type || existing.funding_type,
    deadline: extracted.deadline || existing.deadline,
    application_url: extracted.application_url || existing.application_url,
    effort_level: extracted.effort_level || existing.effort_level,
    reward_level: extracted.reward_level || existing.reward_level,
    competitiveness_factors:
      extracted.competitiveness_factors ||
      existing.competitiveness_factors ||
      [],
    source_url: existing.source_url || existing.application_url,
    normalized_url: existing.normalized_url,
    is_approved: existing.is_approved,
    is_active: existing.is_active,
  };
}

export async function recheckOpportunity({
  supabase,
  opportunityId,
  force = false,
}: {
  supabase: SupabaseClientLike;
  opportunityId: string;
  force?: boolean;
}) {
  const { data: opportunity, error: fetchError } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", opportunityId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!opportunity) throw new Error("Opportunity not found.");

  const url = pickRecheckUrl(opportunity);

  if (!url) {
    const { error: updateError } = await supabase
      .from("opportunities")
      .update({
        last_recheck_error: "No source_url or application_url available.",
        last_rechecked_at: new Date().toISOString(),
        check_reason: "no_recurring_check_needed",
        next_check_at: null,
        recheck_attempts: (opportunity.recheck_attempts || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opportunityId);

    if (updateError) throw new Error(updateError.message);

    return {
      outcome: "missing_url",
      usedGemini: false,
      criteriaChanged: false,
      contentChanged: false,
    };
  }

  const pageResult = await fetchAndHashOpportunityPage(url);

  if (!pageResult.ok || !pageResult.cleanHash) {
    const { error: updateError } = await supabase
      .from("opportunities")
      .update({
        last_http_status: pageResult.status,
        last_raw_content_hash: pageResult.rawHash,
        last_clean_content_hash: pageResult.cleanHash,
        last_recheck_error: pageResult.error || "Unable to fetch readable page.",
        last_rechecked_at: new Date().toISOString(),
        recheck_attempts: (opportunity.recheck_attempts || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opportunityId);

    if (updateError) throw new Error(updateError.message);

    return {
      outcome: "fetch_failed",
      usedGemini: false,
      criteriaChanged: false,
      contentChanged: false,
      error: pageResult.error,
    };
  }

  const cleanHashChanged =
    force ||
    !opportunity.last_clean_content_hash ||
    opportunity.last_clean_content_hash !== pageResult.cleanHash;

  if (!cleanHashChanged) {
    const lifecycleFields = buildLifecycleFields(opportunity);

    const { error: updateError } = await supabase
      .from("opportunities")
      .update({
        last_http_status: pageResult.status,
        last_raw_content_hash: pageResult.rawHash,
        last_clean_content_hash: pageResult.cleanHash,
        last_recheck_error: null,
        last_rechecked_at: new Date().toISOString(),
        last_checked_at: new Date().toISOString(),
        next_check_at: lifecycleFields.next_check_at,
        check_reason: lifecycleFields.check_reason,
        recheck_attempts: (opportunity.recheck_attempts || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opportunityId);

    if (updateError) throw new Error(updateError.message);

    return {
      outcome: "unchanged_page",
      usedGemini: false,
      criteriaChanged: false,
      contentChanged: false,
    };
  }

  const extracted = await reextractOpportunityFromPage({
    pageText: pageResult.cleanText,
    existingOpportunity: opportunity,
  });

  const mergedOpportunity = mergeExtractedOpportunity({
    existing: opportunity,
    extracted: extracted as Record<string, unknown>,
  });

  const lifecycleFields = buildLifecycleFields(mergedOpportunity);

  const oldContentHash = opportunity.content_hash || null;
  const oldCriteriaHash = opportunity.criteria_hash || null;
  const newContentHash = buildOpportunityContentHash(mergedOpportunity);
  const newCriteriaHash = buildOpportunityCriteriaHash(mergedOpportunity);

  const contentChanged = Boolean(oldContentHash) && oldContentHash !== newContentHash;
  const criteriaChanged =
    Boolean(oldCriteriaHash) && oldCriteriaHash !== newCriteriaHash;

  const { error: updateError } = await supabase
    .from("opportunities")
    .update({
      ...mergedOpportunity,
      ...lifecycleFields,
      last_http_status: pageResult.status,
      last_raw_content_hash: pageResult.rawHash,
      last_clean_content_hash: pageResult.cleanHash,
      last_recheck_error: null,
      last_rechecked_at: new Date().toISOString(),
      recheck_attempts: (opportunity.recheck_attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId);

  if (updateError) throw new Error(updateError.message);

  let scoresMarkedStale = 0;

  if (criteriaChanged) {
    const { data: staleRows, error: staleError } = await supabase
      .from("opportunity_competitiveness_scores")
      .update({
        score_status: "stale",
        stale_reason: "stale_opportunity_changed",
        updated_at: new Date().toISOString(),
      })
      .eq("opportunity_id", opportunityId)
      .eq("score_status", "current")
      .select("id");

    if (staleError) throw new Error(staleError.message);

    scoresMarkedStale = staleRows?.length || 0;
  }

  return {
    outcome: criteriaChanged
      ? "criteria_changed"
      : contentChanged
        ? "content_changed"
        : "extracted_no_structured_change",
    usedGemini: true,
    criteriaChanged,
    contentChanged,
    scoresMarkedStale,
  };
}
