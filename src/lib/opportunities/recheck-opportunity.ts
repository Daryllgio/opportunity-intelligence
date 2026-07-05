import {
  buildLifecycleFields,
  buildOpportunityCanonicalKey,
  buildOpportunityContentHash,
  buildOpportunityCriteriaHash,
  inferCycleYear,
  isOpportunityExpired,
} from "@/lib/opportunities/lifecycle";
import {
  fetchAndHashOpportunityPage,
  pickRecheckUrl,
} from "@/lib/opportunities/page-recheck";
import { rankApplicationDestination } from "@/lib/discovery/application-destination-ranker";
import { reextractOpportunityFromPage } from "@/lib/opportunities/reextract-opportunity";
import { reuseScoresForRenewedOpportunity } from "@/lib/opportunities/reuse-renewed-scores";
import { scheduleScoringJobsForUsers } from "@/lib/scoring/schedule-scoring-job";
import { tableHasColumn } from "@/lib/utils/schema-features";

type SupabaseClientLike = {
  from: (table: string) => any;
};



async function linkExistingRenewedCycleIfPresent({
  supabase,
  opportunity,
  opportunityId,
}: {
  supabase: SupabaseClientLike;
  opportunity: Record<string, unknown>;
  opportunityId: string;
}) {
  if (!isOpportunityExpired(opportunity)) {
    return null;
  }

  const canonicalKey =
    String(opportunity.canonical_key || "") ||
    buildOpportunityCanonicalKey(opportunity);

  const cycleYear = Number(opportunity.cycle_year || inferCycleYear(opportunity));

  if (!canonicalKey || !cycleYear) {
    return null;
  }

  const { data: existingRenewed, error } = await supabase
    .from("opportunities")
    .select("id, cycle_year, criteria_hash")
    .eq("canonical_key", canonicalKey)
    .eq("lifecycle_status", "active")
    .gt("cycle_year", cycleYear)
    .order("cycle_year", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!existingRenewed?.id) {
    return null;
  }

  const now = new Date().toISOString();

  const { error: renewedUpdateError } = await supabase
    .from("opportunities")
    .update({
      renewed_from_id: opportunityId,
      renewed_at: now,
      updated_at: now,
    })
    .eq("id", existingRenewed.id);

  if (renewedUpdateError) {
    throw new Error(renewedUpdateError.message);
  }

  const { error: oldUpdateError } = await supabase
    .from("opportunities")
    .update({
      next_check_at: null,
      check_reason: "no_recurring_check_needed",
      last_checked_at: now,
      updated_at: now,
    })
    .eq("id", opportunityId);

  if (oldUpdateError) {
    throw new Error(oldUpdateError.message);
  }

  const reuseResult = await reuseScoresForRenewedOpportunity({
    supabase,
    oldOpportunityId: opportunityId,
    newOpportunityId: existingRenewed.id,
    newCriteriaHash: existingRenewed.criteria_hash || null,
  });

  return {
    renewedOpportunityId: existingRenewed.id,
    renewedCycleYear: existingRenewed.cycle_year,
    reusedScores: reuseResult.reused,
  };
}


function parseDate(value: unknown) {
  if (!value) return null;

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function hasFutureDeadline(opportunity: Record<string, unknown>) {
  const deadline = parseDate(opportunity.deadline);

  if (!deadline) return false;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const deadlineDay = new Date(deadline);
  deadlineDay.setUTCHours(0, 0, 0, 0);

  return deadlineDay >= today;
}

function shouldCreateRenewedCycle({
  existing,
  merged,
}: {
  existing: Record<string, unknown>;
  merged: Record<string, unknown>;
}) {
  if (!isOpportunityExpired(existing)) return false;
  if (!hasFutureDeadline(merged)) return false;

  const existingCycleYear = Number(existing.cycle_year || inferCycleYear(existing));
  const newCycleYear = Number(inferCycleYear(merged));

  if (newCycleYear <= existingCycleYear) return false;

  const existingCanonicalKey =
    String(existing.canonical_key || "") || buildOpportunityCanonicalKey(existing);
  const newCanonicalKey = buildOpportunityCanonicalKey(merged);

  return Boolean(existingCanonicalKey && existingCanonicalKey === newCanonicalKey);
}

function mergeExtractedOpportunity({
  existing,
  extracted,
}: {
  existing: Record<string, unknown>;
  extracted: Record<string, unknown>;
}) {
  const extractedEligibility = Array.isArray(extracted.eligibility_criteria)
    ? extracted.eligibility_criteria
    : [];

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
    eligibility_criteria:
      extractedEligibility.length > 0
        ? extractedEligibility
        : existing.eligibility_criteria || [],
    funding_amount: extracted.funding_amount || existing.funding_amount,
    funding_type: extracted.funding_type || existing.funding_type,
    deadline: extracted.deadline || existing.deadline,
    // The verified destination is owned by the AI verification loop; a
    // re-extraction never overwrites it. Renewal inserts get a freshly
    // ranked + verified destination instead.
    application_url: existing.application_url,
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

  const existingRenewalLink = await linkExistingRenewedCycleIfPresent({
    supabase,
    opportunity,
    opportunityId,
  });

  if (existingRenewalLink) {
    return {
      outcome: "existing_renewed_cycle_linked",
      usedGemini: false,
      criteriaChanged: false,
      contentChanged: false,
      scoresMarkedStale: 0,
      reusedScores: existingRenewalLink.reusedScores || 0,
      renewedOpportunityId: existingRenewalLink.renewedOpportunityId,
    };
  }

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

  if (
    shouldCreateRenewedCycle({
      existing: opportunity,
      merged: mergedOpportunity,
    })
  ) {
    const renewedLifecycleFields = buildLifecycleFields(mergedOpportunity);
    const now = new Date().toISOString();

    const { data: existingRenewed } = await supabase
      .from("opportunities")
      .select("id")
      .eq("renewed_from_id", opportunityId)
      .eq("cycle_year", renewedLifecycleFields.cycle_year)
      .maybeSingle();

    if (existingRenewed?.id) {
      const { error: existingUpdateError } = await supabase
        .from("opportunities")
        .update({
          ...mergedOpportunity,
          ...renewedLifecycleFields,
          renewed_from_id: opportunityId,
          renewed_at: now,
          last_http_status: pageResult.status,
          last_raw_content_hash: pageResult.rawHash,
          last_clean_content_hash: pageResult.cleanHash,
          last_recheck_error: null,
          last_rechecked_at: now,
          updated_at: now,
        })
        .eq("id", existingRenewed.id);

      if (existingUpdateError) throw new Error(existingUpdateError.message);

      const reuseResult = await reuseScoresForRenewedOpportunity({
        supabase,
        oldOpportunityId: opportunityId,
        newOpportunityId: existingRenewed.id,
        newCriteriaHash: renewedLifecycleFields.criteria_hash || null,
      });

      return {
        outcome: "renewed_cycle_updated",
        usedGemini: true,
        criteriaChanged: false,
        contentChanged: true,
        scoresMarkedStale: 0,
        reusedScores: reuseResult.reused,
        renewedOpportunityId: existingRenewed.id,
      };
    }

    const { data: renewedOpportunity, error: renewedInsertError } =
      await supabase
        .from("opportunities")
        .insert({
          ...mergedOpportunity,
          ...renewedLifecycleFields,
          renewed_from_id: opportunityId,
          renewed_at: now,
          last_http_status: pageResult.status,
          last_raw_content_hash: pageResult.rawHash,
          last_clean_content_hash: pageResult.cleanHash,
          last_recheck_error: null,
          last_rechecked_at: now,
          recheck_attempts: 1,
          updated_at: now,
        })
        .select("id")
        .single();

    if (renewedInsertError) throw new Error(renewedInsertError.message);

    await supabase
      .from("opportunities")
      .update({
        last_http_status: pageResult.status,
        last_raw_content_hash: pageResult.rawHash,
        last_clean_content_hash: pageResult.cleanHash,
        last_recheck_error: null,
        last_rechecked_at: now,
        next_check_at: null,
        check_reason: "no_recurring_check_needed",
        updated_at: now,
      })
      .eq("id", opportunityId);

    const reuseResult = await reuseScoresForRenewedOpportunity({
      supabase,
      oldOpportunityId: opportunityId,
      newOpportunityId: renewedOpportunity.id,
      newCriteriaHash: renewedLifecycleFields.criteria_hash || null,
    });

    return {
      outcome: "renewed_cycle_created",
      usedGemini: true,
      criteriaChanged: false,
      contentChanged: true,
      scoresMarkedStale: 0,
      reusedScores: reuseResult.reused,
      renewedOpportunityId: renewedOpportunity.id,
    };
  }

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
      .select("id, user_id");

    if (staleError) throw new Error(staleError.message);

    scoresMarkedStale = staleRows?.length || 0;

    const affectedUserIds = (staleRows || []).map(
      (row: { user_id: string }) => row.user_id
    );

    if (affectedUserIds.length > 0) {
      await scheduleScoringJobsForUsers({
        supabase,
        userIds: affectedUserIds,
        force: true,
      });
    }
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
