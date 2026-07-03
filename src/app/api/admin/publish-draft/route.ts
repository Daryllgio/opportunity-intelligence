import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/admin";
import { rankApplicationDestination } from "@/lib/discovery/application-destination-ranker";
import { looksLikeDegreeProgramRecord } from "@/lib/discovery/opportunity-scope";
import { buildLifecycleFields } from "@/lib/opportunities/lifecycle";

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * The ONLY way a draft becomes a published opportunity. Every publish —
 * automated or human-approved — goes through destination ranking with AI
 * verification. Stored draft URLs are never trusted at publish time; that is
 * exactly how stale, wrong links reached production before.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const draftId = String(body.draftId || "").trim();
    if (!draftId) {
      return NextResponse.json({ error: "Missing draftId." }, { status: 400 });
    }

    const supabase = createServiceSupabase();

    const { data: draft, error: draftError } = await supabase
      .from("opportunity_drafts")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (draftError || !draft) {
      return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    }

    // Scope gate: degree/admissions records never publish.
    const degreeCheck = looksLikeDegreeProgramRecord({
      title: draft.title,
      text: `${draft.description || ""} ${draft.ai_summary || ""}`,
    });
    if (degreeCheck.isDegree) {
      await supabase
        .from("opportunity_drafts")
        .update({
          validation_decision: "reject",
          review_notes: degreeCheck.reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftId);
      return NextResponse.json(
        { error: `Rejected instead: ${degreeCheck.reason}` },
        { status: 422 }
      );
    }

    // Duplicate gate.
    if (draft.normalized_url) {
      const { data: dupe } = await supabase
        .from("opportunities")
        .select("id, title")
        .eq("normalized_url", draft.normalized_url)
        .maybeSingle();
      if (dupe) {
        return NextResponse.json(
          { error: `Already published: ${dupe.title}`, duplicateId: dupe.id },
          { status: 409 }
        );
      }
    }

    // Fresh destination lookup with AI verification built in.
    const destination = await rankApplicationDestination({
      title: draft.title,
      provider: draft.provider,
      type: draft.type,
      sourceUrl: draft.source_url,
      deadline: draft.deadline,
    });

    if (!destination.destinationVerified || !destination.applicationDestinationUrl) {
      await supabase
        .from("opportunity_drafts")
        .update({
          destination_reasons: destination.destinationReasons,
          official_source_status: destination.officialSourceStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftId);

      return NextResponse.json(
        {
          error:
            "No AI-verified application destination could be found. The draft stays in review.",
          reasons: destination.destinationReasons.slice(0, 6),
          verdict: destination.verificationVerdict,
        },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    const payload = {
      normalized_url: draft.normalized_url,
      title: draft.title,
      provider: draft.provider,
      type: draft.type,
      description: draft.description,
      ai_summary: draft.ai_summary,
      country: draft.country || "Global",
      eligible_countries: draft.eligible_countries || [],
      eligible_education_levels: draft.eligible_education_levels || [],
      eligible_fields: draft.eligible_fields || [],
      funding_amount: draft.funding_amount,
      funding_type: draft.funding_type,
      deadline: draft.deadline,
      application_url: destination.applicationDestinationUrl,
      application_destination_url: destination.applicationDestinationUrl,
      application_destination_type: destination.applicationDestinationType,
      destination_confidence: destination.destinationConfidence,
      destination_reasons: destination.destinationReasons,
      official_source_url: destination.officialSourceUrl,
      official_source_verified: true,
      official_source_status: "verified_destination",
      effort_level: draft.effort_level,
      reward_level: draft.reward_level,
      competitiveness_factors: draft.competitiveness_factors || [],
      source_url: draft.source_url || draft.application_url,
      source_category: draft.source_category,
      application_status: draft.application_status,
      deadline_confidence: draft.deadline_confidence,
      cycle_notes: draft.cycle_notes,
      validation_score: draft.validation_score,
      validation_decision: "approved",
      review_flags: draft.review_flags || [],
      is_active: true,
      is_approved: true,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("opportunities")
      .insert({
        ...payload,
        ...buildLifecycleFields(payload),
        updated_at: now,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("publish-draft insert failed:", insertError.message);
      return NextResponse.json(
        { error: "Could not publish the draft." },
        { status: 500 }
      );
    }

    await supabase
      .from("opportunity_drafts")
      .update({
        extraction_status: "published",
        validation_decision: "approved",
        updated_at: now,
      })
      .eq("id", draftId);

    return NextResponse.json({
      ok: true,
      opportunityId: inserted.id,
      applicationUrl: destination.applicationDestinationUrl,
      verification: destination.destinationReasons[0],
    });
  } catch (error) {
    console.error(
      "publish-draft error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Publish failed." },
      { status: 500 }
    );
  }
}
