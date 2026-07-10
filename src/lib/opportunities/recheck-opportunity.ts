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
import { buildOpportunityCriteriaHash as buildScoringCriteriaHash } from "@/lib/scoring/hashes";
import { scheduleScoringJobsForUsers } from "@/lib/scoring/schedule-scoring-job";
import { tableHasColumn } from "@/lib/utils/schema-features";
import { writeWithStatusFallback } from "@/lib/opportunities/status-write";

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
    .select("*")
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

  // Score rows store the SCORING criteria hash (scoring/hashes.ts), not the
  // lifecycle one — comparing against the lifecycle hash would never match
  // and reuse would silently do nothing.
  const reuseResult = await reuseScoresForRenewedOpportunity({
    supabase,
    oldOpportunityId: opportunityId,
    newOpportunityId: existingRenewed.id,
    newCriteriaHash: buildScoringCriteriaHash(existingRenewed),
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

/** When to look again at a row that isn't accepting applications: the
 * announced open date if it's ahead; a two-day retry when the announced
 * open date has already passed (the page is probably about to flip, or its
 * wording is stale); otherwise a five-week snooze. */
function computeReopenCheckAt(applicationOpensAt: unknown, cycleNotes: unknown) {
  const now = new Date();
  const opensAt = String(applicationOpensAt || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(opensAt)) {
    const opens = new Date(`${opensAt}T00:00:00Z`);
    if (!Number.isNaN(opens.getTime())) {
      if (opens > now) return opens.toISOString();
      const retry = new Date(now);
      retry.setUTCDate(retry.getUTCDate() + 2);
      return retry.toISOString();
    }
  }
  void cycleNotes; // month/season parsing lives in the ingest scheduler
  const snooze = new Date(now);
  snooze.setUTCDate(snooze.getUTCDate() + 35);
  return snooze.toISOString();
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
  // A posted next-cycle deadline is NOT a renewal while the page still says
  // closed / not yet open (Boren posts January's deadline all year).
  const mergedStatus = String(merged.application_status || "");
  if (mergedStatus === "closed" || mergedStatus === "not_yet_open") return false;

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
    attributes:
      extracted.attributes && Object.keys(extracted.attributes as object).length > 0
        ? extracted.attributes
        : existing.attributes || {},
    funding_amount: extracted.funding_amount || existing.funding_amount,
    funding_type: extracted.funding_type || existing.funding_type,
    deadline: extracted.deadline || existing.deadline,
    // Status language read from the CURRENT page always wins — a closed or
    // not-yet-open cycle must unpublish even when a (next-cycle) deadline is
    // still posted.
    application_status:
      extracted.application_status && extracted.application_status !== "unknown"
        ? extracted.application_status
        : existing.application_status,
    deadline_confidence:
      extracted.deadline_confidence || existing.deadline_confidence,
    cycle_notes: extracted.cycle_notes || existing.cycle_notes,
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

  let pageResult = await fetchAndHashOpportunityPage(url);

  // Source pages die independently of the opportunity (Boren's source was
  // an aggregator page that started returning 403 while borenawards.org
  // stayed up). Before declaring a fetch failure, try the other URLs we
  // hold — the applicant destination is usually the most durable.
  if (!pageResult.ok || !pageResult.cleanHash) {
    const alternates = Array.from(
      new Set(
        [
          opportunity.application_destination_url,
          opportunity.application_url,
          opportunity.official_source_url,
        ]
          .map((value) => String(value || "").trim())
          .filter((value) => value && value !== url)
      )
    );
    for (const alternate of alternates) {
      const alternateResult = await fetchAndHashOpportunityPage(alternate);
      if (alternateResult.ok && alternateResult.cleanHash) {
        pageResult = alternateResult;
        break;
      }
    }
  }

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

    // A dark row (closed / not yet open) whose page hasn't changed is still
    // waiting to reopen — keep checking every few days around its window
    // instead of adopting the live-row pre-deadline schedule, so it
    // republishes within days of the page announcing the opening.
    const existingStatus = String(opportunity.application_status || "");
    const isDarkWaiting =
      opportunity.is_active === false &&
      (existingStatus === "closed" || existingStatus === "not_yet_open");
    const shortSnooze = new Date();
    shortSnooze.setUTCDate(shortSnooze.getUTCDate() + 5);

    const { error: updateError } = await supabase
      .from("opportunities")
      .update({
        last_http_status: pageResult.status,
        last_raw_content_hash: pageResult.rawHash,
        last_clean_content_hash: pageResult.cleanHash,
        last_recheck_error: null,
        last_rechecked_at: new Date().toISOString(),
        last_checked_at: new Date().toISOString(),
        next_check_at: isDarkWaiting
          ? shortSnooze.toISOString()
          : lifecycleFields.next_check_at,
        check_reason: isDarkWaiting
          ? "renewal_window"
          : lifecycleFields.check_reason,
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

  if (!(await tableHasColumn(supabase, "opportunities", "eligibility_criteria"))) {
    delete (mergedOpportunity as Record<string, unknown>).eligibility_criteria;
  }
  if (!(await tableHasColumn(supabase, "opportunities", "attributes"))) {
    delete (mergedOpportunity as Record<string, unknown>).attributes;
  }

  const lifecycleFields = buildLifecycleFields(mergedOpportunity);

  if (
    shouldCreateRenewedCycle({
      existing: opportunity,
      merged: mergedOpportunity,
    })
  ) {
    const renewedLifecycleFields = buildLifecycleFields(mergedOpportunity);
    const now = new Date().toISOString();
    const renewedScoringCriteriaHash = buildScoringCriteriaHash(mergedOpportunity);

    const { data: existingRenewed } = await supabase
      .from("opportunities")
      .select("id")
      .eq("renewed_from_id", opportunityId)
      .eq("cycle_year", renewedLifecycleFields.cycle_year)
      .maybeSingle();

    if (existingRenewed?.id) {
      // The renewed row's verified destination is owned by its own
      // verification loop; content refreshes must not overwrite it.
      const { application_url: _renewedUrlUntouched, ...mergedForUpdate } =
        mergedOpportunity;
      const { error: existingUpdateError } = await supabase
        .from("opportunities")
        .update({
          ...mergedForUpdate,
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
        newCriteriaHash: renewedScoringCriteriaHash,
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

    // A renewed cycle is a fresh publish, and every publish path must pass
    // AI destination verification. Verified: the row goes live pointing at
    // the verified page. Not verified: the row is created dark, flagged for
    // review — a returning scholarship must never relaunch with last year's
    // (possibly dead) Apply link.
    const destination = await rankApplicationDestination({
      title: String(mergedOpportunity.title || ""),
      provider: mergedOpportunity.provider ? String(mergedOpportunity.provider) : null,
      type: mergedOpportunity.type ? String(mergedOpportunity.type) : null,
      sourceUrl: mergedOpportunity.source_url ? String(mergedOpportunity.source_url) : null,
      deadline: mergedOpportunity.deadline ? String(mergedOpportunity.deadline) : null,
    });
    const destinationVerified = Boolean(
      destination.destinationVerified && destination.applicationDestinationUrl
    );

    const { data: renewedOpportunity, error: renewedInsertError } =
      await supabase
        .from("opportunities")
        .insert({
          ...mergedOpportunity,
          ...renewedLifecycleFields,
          application_url: destinationVerified
            ? destination.applicationDestinationUrl
            : mergedOpportunity.application_url,
          application_destination_url: destinationVerified
            ? destination.applicationDestinationUrl
            : null,
          application_destination_type: destination.applicationDestinationType,
          destination_confidence: destination.destinationConfidence,
          destination_reasons: destination.destinationReasons,
          official_source_url: destination.officialSourceUrl,
          official_source_verified: destinationVerified,
          official_source_status: destinationVerified
            ? "verified_destination"
            : destination.officialSourceStatus,
          is_active: destinationVerified ? renewedLifecycleFields.is_active : false,
          is_approved: destinationVerified ? mergedOpportunity.is_approved : false,
          validation_decision: destinationVerified ? "approved" : "review",
          application_note: destinationVerified
            ? "Renewed cycle published with an AI-verified destination."
            : "Renewed cycle detected, but no AI-verified destination was found. Held for review.",
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
      newCriteriaHash: renewedScoringCriteriaHash,
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

  // Visibility invariant: a page that says its cycle is closed or not yet
  // open unpublishes the row NOW, whatever the posted deadline says (Boren
  // showed a Jan 2027 deadline while its page said "the 2026-2027 cycle is
  // closed"). The row stays in the catalog dark, scheduled for a recheck at
  // its announced open date, and republishes through the renewal path.
  const mergedStatus = String(mergedOpportunity.application_status || "");
  const notAccepting = mergedStatus === "closed" || mergedStatus === "not_yet_open";
  const wasActive = opportunity.is_active === true;

  if (notAccepting) {
    const attributes = (mergedOpportunity.attributes || {}) as Record<string, unknown>;
    const nextCheck = computeReopenCheckAt(
      attributes.application_opens_at,
      mergedOpportunity.cycle_notes
    );
    (mergedOpportunity as Record<string, unknown>).is_active = false;
    lifecycleFields.lifecycle_status = "expired";
    lifecycleFields.is_active = false;
    lifecycleFields.expired_at =
      (opportunity.expired_at as string | null) || new Date().toISOString();
    lifecycleFields.next_check_at = nextCheck;
    lifecycleFields.check_reason = "renewal_window";
  }

  const { error: updateError } = await writeWithStatusFallback(
    (payload) =>
      supabase
        .from("opportunities")
        .update(payload)
        .eq("id", opportunityId)
        .select("id")
        .maybeSingle(),
    {
      ...mergedOpportunity,
      ...lifecycleFields,
      last_http_status: pageResult.status,
      last_raw_content_hash: pageResult.rawHash,
      last_clean_content_hash: pageResult.cleanHash,
      last_recheck_error: null,
      last_rechecked_at: new Date().toISOString(),
      recheck_attempts: (opportunity.recheck_attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    }
  );

  if (updateError) throw new Error(updateError.message);

  if (notAccepting && wasActive) {
    // Scores on a row users can no longer apply to are stale by definition.
    const { data: staleRows } = await supabase
      .from("opportunity_competitiveness_scores")
      .update({
        score_status: "stale",
        stale_reason: "opportunity_expired",
        updated_at: new Date().toISOString(),
      })
      .eq("opportunity_id", opportunityId)
      .eq("score_status", "current")
      .select("id");

    return {
      outcome: "unpublished_not_accepting",
      usedGemini: true,
      criteriaChanged,
      contentChanged,
      scoresMarkedStale: staleRows?.length || 0,
    };
  }

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
