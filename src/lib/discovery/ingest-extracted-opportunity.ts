import { normalizeUrl } from "@/lib/utils/url-normalizer";
import { tableHasColumn } from "@/lib/utils/schema-features";
import { normalizeEligibilityCriteria } from "@/lib/matching/eligibility";
import { normalizeOpportunityAttributes } from "@/lib/discovery/opportunity-attributes";
import { buildLifecycleFields } from "@/lib/opportunities/lifecycle";
import { baselineVerifiedDestination } from "@/lib/opportunities/reverify-destinations";
import { validateExtractedOpportunity } from "@/lib/discovery/validation";
import { assessDuplicateRisk } from "@/lib/discovery/duplicate-risk";
import { shouldRejectExtractedOpportunity } from "@/lib/discovery/opportunity-scope";
import { rankApplicationDestination } from "@/lib/discovery/application-destination-ranker";
import { normalizeOpportunityType } from "@/lib/discovery/extract-discovered-opportunity";
import { writeWithStatusFallback } from "@/lib/opportunities/status-write";

type SupabaseClientLike = {
  from: (table: string) => any;
};

function getSourceDomain(url: string | null | undefined) {
  if (!url) return null;

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function stringOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function arrayOrEmpty(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// Season -> first month of the season (UTC month index). "Fall 2026" means
// check on Sep 1, 2026 — early enough to catch the opening, late enough to
// skip months of pointless rechecks.
const SEASON_MONTHS: Record<string, number> = {
  spring: 2, // March
  summer: 5, // June
  fall: 8, // September
  autumn: 8,
  winter: 11, // December
};

/**
 * When the next cycle should be re-checked.
 *
 * Priority order:
 *  1. An explicit application open date from extraction — check THAT day, so
 *     the opportunity republishes the day applications open.
 *  2. A month named in the cycle notes ("applications open in August").
 *  3. A season in the cycle notes ("the 2027-28 cycle will open fall 2026").
 *  4. A flat three-month snooze.
 */
function computeExpectedNextCheckAt(
  cycleNotes?: unknown,
  applicationOpensAt?: unknown
) {
  const now = new Date();

  const opensAt = String(applicationOpensAt || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(opensAt)) {
    const opens = new Date(`${opensAt}T00:00:00Z`);
    if (!Number.isNaN(opens.getTime()) && opens > now) {
      return opens.toISOString();
    }
    // Open date already passed: the page may simply be stale — check soon.
    if (!Number.isNaN(opens.getTime())) {
      const soon = new Date(now);
      soon.setUTCDate(soon.getUTCDate() + 2);
      return soon.toISOString();
    }
  }

  const notes = String(cycleNotes || "").toLowerCase();

  const reopeningPhrase = notes.match(
    /(?:open|reopen|begin|start|resume|available|launch)[a-z]*(?:\s+\w+){0,4}?\s+(?:in|on|by)?\s*(january|february|march|april|may|june|july|august|september|october|november|december)/
  );
  if (reopeningPhrase) {
    const monthIndex = MONTH_NAMES.indexOf(reopeningPhrase[1]);
    if (monthIndex >= 0) {
      const target = new Date(Date.UTC(now.getUTCFullYear(), monthIndex, 1));
      if (target <= now) target.setUTCFullYear(target.getUTCFullYear() + 1);
      return target.toISOString();
    }
  }

  const seasonPhrase = notes.match(
    /(spring|summer|fall|autumn|winter)\s*(?:of\s*)?((?:20)\d{2})?/
  );
  if (seasonPhrase && seasonPhrase[1]) {
    const monthIndex = SEASON_MONTHS[seasonPhrase[1]];
    const year = seasonPhrase[2]
      ? Number(seasonPhrase[2])
      : now.getUTCFullYear();
    const target = new Date(Date.UTC(year, monthIndex, 1));
    if (target > now) return target.toISOString();
    if (!seasonPhrase[2]) {
      target.setUTCFullYear(target.getUTCFullYear() + 1);
      return target.toISOString();
    }
  }

  const next = new Date(now);
  next.setMonth(next.getMonth() + 3);
  return next.toISOString();
}


function normalizeOpportunityStatusByDeadline<T extends Record<string, any>>(payload: T): T {
  const deadline = stringOrNull(payload.deadline);

  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return payload;
  }

  const [year, month, day] = deadline.split("-").map(Number);
  const deadlineUtc = Date.UTC(year, month - 1, day, 23, 59, 59);
  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0
  );

  if (deadlineUtc < todayUtc) {
    const existingNotes = stringOrNull(payload.cycle_notes);
    const passedNote = "Deadline has passed; track this opportunity for the next cycle.";

    return {
      ...payload,
      application_status: "closed",
      cycle_notes: existingNotes
        ? `${existingNotes} ${passedNote}`
        : passedNote,
    };
  }

  return payload;
}

export async function ingestExtractedOpportunity({
  supabase,
  discoveredPage,
  extracted,
  opportunityFamilyKey = null,
  sourceTrust = "standard",
}: {
  supabase: SupabaseClientLike;
  discoveredPage: Record<string, unknown>;
  extracted: Record<string, unknown>;
  opportunityFamilyKey?: string | null;
  sourceTrust?: "trusted" | "standard" | "experimental" | "blocked";
}) {
  const normalizedUrl = normalizeUrl(
    String(
      extracted.source_url ||
        extracted.application_url ||
        discoveredPage.normalized_url ||
        discoveredPage.url ||
        ""
    )
  );

  let opportunityPayload = {
    normalized_url: normalizedUrl || null,
    title: stringOrNull(extracted.title),
    provider: stringOrNull(extracted.provider),
    type: normalizeOpportunityType(extracted.type),
    description: stringOrNull(extracted.description),
    ai_summary: stringOrNull(extracted.ai_summary),
    country: stringOrNull(extracted.country),
    eligible_countries: arrayOrEmpty(extracted.eligible_countries),
    eligible_education_levels: arrayOrEmpty(extracted.eligible_education_levels),
    eligible_fields: arrayOrEmpty(extracted.eligible_fields),
    funding_amount: stringOrNull(extracted.funding_amount),
    funding_type: stringOrNull(extracted.funding_type),
    deadline: stringOrNull(extracted.deadline),
    application_status: stringOrNull(extracted.application_status) || "unknown",
    deadline_confidence: stringOrNull(extracted.deadline_confidence) || "unknown",
    cycle_notes: stringOrNull(extracted.cycle_notes),
    application_url:
      stringOrNull(extracted.application_url) || stringOrNull(extracted.source_url),
    source_url: stringOrNull(extracted.source_url) || stringOrNull(discoveredPage.url),
    effort_level: stringOrNull(extracted.effort_level),
    reward_level: stringOrNull(extracted.reward_level),
    competitiveness_factors: arrayOrEmpty(extracted.competitiveness_factors),
  };

  opportunityPayload = normalizeOpportunityStatusByDeadline(opportunityPayload);

  // eligibility_criteria and attributes ride along on every write, but only
  // once the migration adding the columns has been applied.
  const eligibilityCriteria = normalizeEligibilityCriteria(
    extracted.eligibility_criteria
  );
  const opportunityAttributes = normalizeOpportunityAttributes(
    extracted.attributes
  );
  const eligibilityFields = {
    ...((await tableHasColumn(supabase, "opportunity_drafts", "eligibility_criteria"))
      ? { eligibility_criteria: eligibilityCriteria }
      : {}),
    ...((await tableHasColumn(supabase, "opportunity_drafts", "attributes"))
      ? { attributes: opportunityAttributes }
      : {}),
  };

  const scopeCheck = shouldRejectExtractedOpportunity({
    type: opportunityPayload.type,
    title: opportunityPayload.title,
    url: opportunityPayload.source_url || opportunityPayload.application_url,
    description: opportunityPayload.description,
    ai_summary: opportunityPayload.ai_summary,
  });

  if (scopeCheck.reject) {
    const now = new Date().toISOString();

    await supabase
      .from("discovered_pages")
      .update({
        discovery_status: "rejected",
        quality_score: 0,
        rejection_reason: scopeCheck.reason || "Opportunity is outside target scope.",
        updated_at: now,
      })
      .eq("id", discoveredPage.id);

    return {
      decision: "reject",
      validation: {
        decision: "reject",
        score: 0,
        autoPublishEligible: false,
        duplicateRisk: "low",
        sourceTrust,
        reasons: [scopeCheck.reason || "Opportunity is outside target scope."],
      },
      duplicate: {
        duplicateRisk: "low",
        reasons: [],
        matches: [],
      },
      publishedOpportunityId: null,
      draftId: null,
    };
  }

  const duplicate = await assessDuplicateRisk({
    supabase,
    opportunity: opportunityPayload,
  });

  const validation = validateExtractedOpportunity({
    opportunity: opportunityPayload,
    sourceTrust,
    duplicateRisk: duplicate.duplicateRisk,
  });

  let trustMetadata = {
    validation_score: validation.score,
    validation_decision: validation.decision,
    validation_reasons: validation.reasons,
    duplicate_risk: duplicate.duplicateRisk,
    source_trust: validation.sourceTrust,
    source_category: validation.sourceCategory,
    application_url_quality: validation.applicationUrlQuality,
    review_flags: validation.reviewFlags,
    source_quality_reasons: validation.sourceQualityReasons,
    auto_publish_eligible: validation.autoPublishEligible,
    official_source_url: null as string | null,
    official_source_verified: false,
    application_note: null as string | null,
    application_destination_url: null as string | null,
    application_destination_type: null as string | null,
    official_source_status: null as string | null,
    destination_confidence: null as string | null,
    destination_reasons: [] as string[],
    application_document_url: null as string | null,
    application_document_type: null as string | null,
  };

  // Always rank the applicant destination, regardless of source quality. The
  // ranker has a fast sourceUrl self-check path for trusted/official pages
  // (no web search), so good sources are populated cheaply while aggregator/
  // unknown sources fall back to the full web-search ranker.
  try {
    const destinationResult = await rankApplicationDestination({
      title: opportunityPayload.title,
      provider: opportunityPayload.provider,
      type: opportunityPayload.type,
      sourceUrl: opportunityPayload.source_url,
      deadline: opportunityPayload.deadline,
    });

    trustMetadata = {
      ...trustMetadata,
      official_source_url: destinationResult.officialSourceUrl,
      official_source_verified: destinationResult.destinationVerified,
      application_destination_url: destinationResult.applicationDestinationUrl,
      application_destination_type: destinationResult.applicationDestinationType,
      official_source_status: destinationResult.officialSourceStatus,
      destination_confidence: destinationResult.destinationConfidence,
      destination_reasons: destinationResult.destinationReasons,
      application_document_url: destinationResult.applicationDocumentUrl,
      application_document_type: destinationResult.applicationDocumentType,
      application_note: destinationResult.destinationVerified
        ? "Destination confirmed by AI page verification."
        : destinationResult.destinationConfidence !== "none"
          ? "Heuristic destination only — AI verification did not confirm it. Review before publishing."
          : "No verified applicant-facing destination was found. Review manually.",
      source_quality_reasons: [
        ...trustMetadata.source_quality_reasons,
        ...destinationResult.destinationReasons,
      ],
    };

    // Verifier verdicts about the OPPORTUNITY itself, not just the link:
    // a degree/admissions page means the whole record is out of scope; a
    // confirmed-closed page means it belongs in next-cycle tracking.
    if (
      destinationResult.verificationVerdict === "degree_or_admissions" &&
      validation.decision !== "reject"
    ) {
      validation.decision = "reject";
      validation.autoPublishEligible = false;
      validation.reasons = [
        ...validation.reasons,
        "AI verification identified this as a degree/admissions page — not an opportunity we list.",
      ];
    } else if (
      destinationResult.verificationVerdict === "expired_or_closed" &&
      validation.decision === "auto_publish"
    ) {
      validation.decision = "track_for_next_cycle";
      validation.autoPublishEligible = false;
      validation.reasons = [
        ...validation.reasons,
        "AI verification found applications closed on the destination page — tracking for next cycle.",
      ];
    }
  } catch (error) {
    trustMetadata = {
      ...trustMetadata,
      official_source_status: "failed_lookup",
      destination_confidence: "none",
      application_note: `Application destination ranking failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }

  // ---------------------------------------------------------------------
  // Destination gate for auto-publish.
  //
  // Validation runs before the destination ranker, so it cannot know whether
  // an applicant destination was actually verified. Nothing may go live
  // automatically unless the ranker found a high/medium-confidence,
  // non-aggregator destination — otherwise it drops to human review.
  // ---------------------------------------------------------------------
  const destinationOkForAutoPublish =
    Boolean(trustMetadata.application_destination_url) &&
    trustMetadata.official_source_verified === true &&
    trustMetadata.application_destination_type !== "aggregator_or_database" &&
    trustMetadata.application_destination_type !== "not_found";

  if (validation.decision === "auto_publish" && !destinationOkForAutoPublish) {
    validation.decision = "review";
    validation.autoPublishEligible = false;
    validation.reasons = [
      ...validation.reasons,
      "Auto-publish blocked: the destination did not pass AI page verification.",
    ];

    trustMetadata = {
      ...trustMetadata,
      validation_decision: "review",
      validation_reasons: validation.reasons,
      auto_publish_eligible: false,
      review_flags: Array.from(
        new Set([...trustMetadata.review_flags, "needs_official_source"])
      ),
    };
  }

  // ---------------------------------------------------------------------
  // Aggregator hard line. Aggregator pages are discovery fuel only: if the
  // ranker could not locate a verified official destination for an
  // aggregator-sourced extraction, the opportunity is junk to us — reject it
  // outright instead of parking it in review where it will never be usable.
  // ---------------------------------------------------------------------
  if (
    validation.sourceCategory === "aggregator" &&
    !destinationOkForAutoPublish &&
    validation.decision !== "track_for_next_cycle"
  ) {
    validation.decision = "reject";
    validation.autoPublishEligible = false;
    validation.reasons = [
      ...validation.reasons,
      "Aggregator-sourced with no verified official destination. Aggregators are discovery fuel only — rejected.",
    ];

    trustMetadata = {
      ...trustMetadata,
      validation_decision: "reject",
      validation_reasons: validation.reasons,
      auto_publish_eligible: false,
    };
  }

  const now = new Date().toISOString();

  if (validation.decision === "reject") {
    const missingDeadlineOnly =
      validation.reasons.length === 1 &&
      validation.reasons[0]
        .toLowerCase()
        .includes("missing deadline");

    const extractionTextLength = [
      opportunityPayload.description,
      opportunityPayload.ai_summary,
    ]
      .filter(Boolean)
      .join(" ")
      .length;

    const promisingButIncomplete =
      missingDeadlineOnly &&
      Boolean(opportunityPayload.title) &&
      Boolean(opportunityPayload.provider) &&
      Boolean(opportunityPayload.type) &&
      extractionTextLength >= 350 &&
      opportunityPayload.competitiveness_factors.length > 0;

    if (promisingButIncomplete) {
      await supabase
        .from("discovered_pages")
        .update({
          discovery_status: "needs_more_pages",
          quality_score: validation.score,
          rejection_reason: validation.reasons.join("; "),
          updated_at: now,
        })
        .eq("id", discoveredPage.id);

      return {
        decision: "needs_more_pages",
        validation,
        duplicate,
        publishedOpportunityId: null,
        draftId: null,
      };
    }

    await supabase
      .from("discovered_pages")
      .update({
        discovery_status: "rejected",
        quality_score: validation.score,
        rejection_reason: validation.reasons.join("; "),
        updated_at: now,
      })
      .eq("id", discoveredPage.id);

    return {
      decision: "reject",
      validation,
      duplicate,
      publishedOpportunityId: null,
      draftId: null,
    };
  }

  if (validation.decision === "track_for_next_cycle") {
    const expectedNextCheckAt = computeExpectedNextCheckAt(
      opportunityPayload.cycle_notes,
      opportunityAttributes.application_opens_at
    );

    const draftPayload = {
      normalized_url: normalizedUrl || null,
      title: opportunityPayload.title,
      provider: opportunityPayload.provider,
      type: opportunityPayload.type,
      description: opportunityPayload.description,
      ai_summary: opportunityPayload.ai_summary,
      country: opportunityPayload.country,
      eligible_countries: opportunityPayload.eligible_countries,
      eligible_education_levels: opportunityPayload.eligible_education_levels,
      eligible_fields: opportunityPayload.eligible_fields,
      funding_amount: opportunityPayload.funding_amount,
      funding_type: opportunityPayload.funding_type,
      deadline: opportunityPayload.deadline,
      application_status: opportunityPayload.application_status,
      deadline_confidence: opportunityPayload.deadline_confidence,
      cycle_notes: opportunityPayload.cycle_notes,
      expected_next_check_at: expectedNextCheckAt,
      application_url: opportunityPayload.application_url,
      source_url: opportunityPayload.source_url,
      source_domain: getSourceDomain(String(opportunityPayload.source_url || "")),
      effort_level: opportunityPayload.effort_level,
      reward_level: opportunityPayload.reward_level,
      competitiveness_factors: opportunityPayload.competitiveness_factors,
      extraction_status: "closed_cycle",
      ...trustMetadata,
      ...eligibilityFields,
      auto_publish_eligible: false,
      discovered_page_id: discoveredPage.id,
      updated_at: now,
    };

    let draft;

    if (normalizedUrl || opportunityFamilyKey) {
      const { data: existingDraftByUrl } = normalizedUrl
        ? await supabase
            .from("opportunity_drafts")
            .select("id")
            .eq("normalized_url", normalizedUrl)
            .maybeSingle()
        : { data: null };

      const { data: existingDraftByFamily } = opportunityFamilyKey
        ? await supabase
            .from("opportunity_drafts")
            .select("id")
            .eq("opportunity_family_key", opportunityFamilyKey)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null };

      const existingDraft = existingDraftByUrl || existingDraftByFamily;

      if (existingDraft?.id) {
        const { data: updatedDraft, error: updateDraftError } =
          await writeWithStatusFallback<{ id: string }>(
            (payload) =>
              supabase
                .from("opportunity_drafts")
                .update(payload)
                .eq("id", existingDraft.id)
                .select("id")
                .single(),
            draftPayload
          );

        if (updateDraftError) throw new Error(updateDraftError.message);
        draft = updatedDraft;
      }
    }

    if (!draft) {
      const { data: insertedDraft, error: draftError } =
        await writeWithStatusFallback<{ id: string }>(
          (payload) =>
            supabase
              .from("opportunity_drafts")
              .insert(payload)
              .select("id")
              .single(),
          draftPayload
        );

      if (draftError) throw new Error(draftError.message);
      draft = insertedDraft;
    }

    await supabase
      .from("discovered_pages")
      .update({
        discovery_status: "future_tracking",
        quality_score: validation.score,
        rejection_reason: validation.reasons.join("; "),
        expected_next_check_at: expectedNextCheckAt,
        updated_at: now,
      })
      .eq("id", discoveredPage.id);

    return {
      decision: "track_for_next_cycle",
      validation,
      duplicate,
      publishedOpportunityId: null,
      draftId: draft.id,
    };
  }

  // Structural visibility gate: whatever upstream logic decided, a row
  // whose applications are not open (or rolling) can never go live. This is
  // the invariant that keeps Bob Horner (opens Sept 9) off the browse page
  // even if a validation branch is wrong.
  if (
    validation.decision === "auto_publish" &&
    opportunityPayload.application_status !== "open" &&
    opportunityPayload.application_status !== "rolling"
  ) {
    validation.decision = "review";
    validation.autoPublishEligible = false;
    validation.reasons = [
      ...validation.reasons,
      `Auto-publish blocked: application status is "${opportunityPayload.application_status}", not open/rolling.`,
    ];
  }

  if (validation.decision === "auto_publish") {
    // Destination identity gate: if a live row already sends applicants to
    // this exact destination, this is the same opportunity found via a
    // different page — never publish a twin.
    if (trustMetadata.application_destination_url) {
      const { findLiveRowByDestination } = await import(
        "@/lib/discovery/pre-ai-dedup"
      );
      const twin = await findLiveRowByDestination({
        supabase,
        destinationUrl: trustMetadata.application_destination_url,
      });
      if (twin) {
        validation.decision = "reject";
        validation.reasons = [
          ...validation.reasons,
          `Duplicate: live opportunity "${twin.title}" already uses this application destination.`,
        ];
        await supabase
          .from("discovered_pages")
          .update({
            discovery_status: "rejected",
            rejection_reason: `Duplicate destination of "${twin.title}".`,
            updated_at: now,
          })
          .eq("id", discoveredPage.id);
        return {
          decision: "reject",
          validation,
          duplicate,
          publishedOpportunityId: null,
          draftId: null,
        };
      }
    }

    // Users must land on the verified destination, not whatever URL the
    // extractor happened to find on the source page.
    const publishPayload = {
      ...opportunityPayload,
      application_url:
        trustMetadata.application_destination_url ||
        opportunityPayload.application_url,
    };

    const lifecycleFields = buildLifecycleFields(publishPayload);

    const { data: insertedOpportunity, error: insertError } = await supabase
      .from("opportunities")
      .insert({
        ...publishPayload,
        ...lifecycleFields,
        ...trustMetadata,
        ...((await tableHasColumn(supabase, "opportunities", "eligibility_criteria"))
          ? { eligibility_criteria: eligibilityCriteria }
          : {}),
        ...((await tableHasColumn(supabase, "opportunities", "attributes"))
          ? { attributes: opportunityAttributes }
          : {}),
        is_active: true,
        is_approved: true,
        updated_at: now,
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    // Hash-baseline the verified destination so the nightly re-verification
    // can confirm it without an AI call.
    if (publishPayload.application_url) {
      await baselineVerifiedDestination({
        supabase,
        opportunityId: insertedOpportunity.id,
        url: publishPayload.application_url,
      });
    }

    await supabase
      .from("discovered_pages")
      .update({
        discovery_status: "published",
        quality_score: validation.score,
        rejection_reason: null,
        updated_at: now,
      })
      .eq("id", discoveredPage.id);

    return {
      decision: "auto_publish",
      validation,
      duplicate,
      publishedOpportunityId: insertedOpportunity.id,
      draftId: null,
    };
  }

  const draftPayload = {
    normalized_url: normalizedUrl || null,
    title: opportunityPayload.title,
    provider: opportunityPayload.provider,
    type: opportunityPayload.type,
    description: opportunityPayload.description,
    ai_summary: opportunityPayload.ai_summary,
    country: opportunityPayload.country,
    eligible_countries: opportunityPayload.eligible_countries,
    eligible_education_levels: opportunityPayload.eligible_education_levels,
    eligible_fields: opportunityPayload.eligible_fields,
    funding_amount: opportunityPayload.funding_amount,
    funding_type: opportunityPayload.funding_type,
    deadline: opportunityPayload.deadline,
    application_status: opportunityPayload.application_status,
    deadline_confidence: opportunityPayload.deadline_confidence,
    cycle_notes: opportunityPayload.cycle_notes,
    application_url: opportunityPayload.application_url,
    source_url: opportunityPayload.source_url,
    source_domain: getSourceDomain(String(opportunityPayload.source_url || "")),
    effort_level: opportunityPayload.effort_level,
    reward_level: opportunityPayload.reward_level,
    competitiveness_factors: opportunityPayload.competitiveness_factors,
    extraction_status: "pending_review",
    ...trustMetadata,
    ...eligibilityFields,
    discovered_page_id: discoveredPage.id,
    updated_at: now,
  };

  let draft;

  if (normalizedUrl) {
    const { data: existingDraft } = await supabase
      .from("opportunity_drafts")
      .select("id")
      .eq("normalized_url", normalizedUrl)
      .maybeSingle();

    if (existingDraft?.id) {
      const { data: updatedDraft, error: updateDraftError } =
        await writeWithStatusFallback<{ id: string }>(
          (payload) =>
            supabase
              .from("opportunity_drafts")
              .update(payload)
              .eq("id", existingDraft.id)
              .select("id")
              .single(),
          draftPayload
        );

      if (updateDraftError) {
        throw new Error(updateDraftError.message);
      }

      draft = updatedDraft;
    }
  }

  if (!draft) {
    const { data: insertedDraft, error: draftError } =
      await writeWithStatusFallback<{ id: string }>(
        (payload) =>
          supabase
            .from("opportunity_drafts")
            .insert(payload)
            .select("id")
            .single(),
        draftPayload
      );

    if (draftError) {
      throw new Error(draftError.message);
    }

    draft = insertedDraft;
  }

  await supabase
    .from("discovered_pages")
    .update({
      discovery_status: "review",
      quality_score: validation.score,
      rejection_reason: null,
      updated_at: now,
    })
    .eq("id", discoveredPage.id);

  return {
    decision: "review",
    validation,
    duplicate,
    publishedOpportunityId: null,
    draftId: draft.id,
  };
}
