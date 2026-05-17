import { normalizeUrl } from "@/lib/utils/url-normalizer";
import { buildLifecycleFields } from "@/lib/opportunities/lifecycle";
import { validateExtractedOpportunity } from "@/lib/discovery/validation";
import { assessDuplicateRisk } from "@/lib/discovery/duplicate-risk";

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

export async function ingestExtractedOpportunity({
  supabase,
  discoveredPage,
  extracted,
  sourceTrust = "standard",
}: {
  supabase: SupabaseClientLike;
  discoveredPage: Record<string, unknown>;
  extracted: Record<string, unknown>;
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

  const opportunityPayload = {
    normalized_url: normalizedUrl || null,
    title: stringOrNull(extracted.title),
    provider: stringOrNull(extracted.provider),
    type: stringOrNull(extracted.type),
    description: stringOrNull(extracted.description),
    ai_summary: stringOrNull(extracted.ai_summary),
    country: stringOrNull(extracted.country) || "United States/Canada",
    eligible_countries: arrayOrEmpty(extracted.eligible_countries),
    eligible_education_levels: arrayOrEmpty(extracted.eligible_education_levels),
    eligible_fields: arrayOrEmpty(extracted.eligible_fields),
    funding_amount: stringOrNull(extracted.funding_amount),
    funding_type: stringOrNull(extracted.funding_type),
    deadline: stringOrNull(extracted.deadline),
    application_url:
      stringOrNull(extracted.application_url) || stringOrNull(extracted.source_url),
    source_url: stringOrNull(extracted.source_url) || stringOrNull(discoveredPage.url),
    effort_level: stringOrNull(extracted.effort_level),
    reward_level: stringOrNull(extracted.reward_level),
    competitiveness_factors: arrayOrEmpty(extracted.competitiveness_factors),
  };

  const duplicate = await assessDuplicateRisk({
    supabase,
    opportunity: opportunityPayload,
  });

  const validation = validateExtractedOpportunity({
    opportunity: opportunityPayload,
    sourceTrust,
    duplicateRisk: duplicate.duplicateRisk,
  });

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

  if (validation.decision === "auto_publish") {
    const lifecycleFields = buildLifecycleFields(opportunityPayload);

    const { data: insertedOpportunity, error: insertError } = await supabase
      .from("opportunities")
      .insert({
        ...opportunityPayload,
        ...lifecycleFields,
        is_active: true,
        is_approved: true,
        updated_at: now,
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error(insertError.message);
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

  const { data: draft, error: draftError } = await supabase
    .from("opportunity_drafts")
    .insert({
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
      application_url: opportunityPayload.application_url,
      source_url: opportunityPayload.source_url,
      source_domain: getSourceDomain(String(opportunityPayload.source_url || "")),
      effort_level: opportunityPayload.effort_level,
      reward_level: opportunityPayload.reward_level,
      competitiveness_factors: opportunityPayload.competitiveness_factors,
      extraction_status: "pending_review",
      validation_score: validation.score,
      validation_decision: validation.decision,
      validation_reasons: validation.reasons,
      duplicate_risk: duplicate.duplicateRisk,
      source_trust: sourceTrust,
      auto_publish_eligible: validation.autoPublishEligible,
      discovered_page_id: discoveredPage.id,
      updated_at: now,
    })
    .select("id")
    .single();

  if (draftError) {
    throw new Error(draftError.message);
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
