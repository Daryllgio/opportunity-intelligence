import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/admin";
import { rankApplicationDestination } from "@/lib/discovery/application-destination-ranker";
import { buildLifecycleFields } from "@/lib/opportunities/lifecycle";
import { baselineVerifiedDestination } from "@/lib/opportunities/reverify-destinations";

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Reactivating a pulled or paused opportunity is a publish, and every publish
 * passes AI destination verification. A row the verifier pulled must not come
 * back to life on the strength of the same link that failed — this route
 * re-ranks, re-verifies, and only then flips it live (with the verified URL).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const opportunityId = String(body.opportunityId || "").trim();
    if (!opportunityId) {
      return NextResponse.json({ error: "Missing opportunityId." }, { status: 400 });
    }

    const supabase = createServiceSupabase();

    const { data: opportunity, error: fetchError } = await supabase
      .from("opportunities")
      .select("*")
      .eq("id", opportunityId)
      .maybeSingle();

    if (fetchError || !opportunity) {
      return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
    }

    const destination = await rankApplicationDestination({
      title: opportunity.title,
      provider: opportunity.provider,
      type: opportunity.type,
      sourceUrl: opportunity.source_url,
      deadline: opportunity.deadline,
    });

    if (!destination.destinationVerified || !destination.applicationDestinationUrl) {
      return NextResponse.json(
        {
          error:
            "No AI-verified application destination could be found, so the opportunity stays offline.",
          reasons: destination.destinationReasons.slice(0, 6),
          verdict: destination.verificationVerdict,
        },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    const lifecycleFields = buildLifecycleFields(
      opportunity as unknown as Record<string, unknown>
    );

    const { error: updateError } = await supabase
      .from("opportunities")
      .update({
        ...lifecycleFields,
        application_url: destination.applicationDestinationUrl,
        application_destination_url: destination.applicationDestinationUrl,
        application_destination_type: destination.applicationDestinationType,
        destination_confidence: destination.destinationConfidence,
        destination_reasons: destination.destinationReasons,
        official_source_url: destination.officialSourceUrl,
        official_source_verified: true,
        official_source_status: "verified_destination",
        is_approved: true,
        validation_decision: "approved",
        application_note: "Reactivated by admin after fresh AI verification.",
        archived_at: null,
        last_recheck_error: null,
        recheck_attempts: 0,
        updated_at: now,
      })
      .eq("id", opportunityId);

    if (updateError) {
      return NextResponse.json({ error: "Could not reactivate." }, { status: 500 });
    }

    await baselineVerifiedDestination({
      supabase,
      opportunityId,
      url: destination.applicationDestinationUrl,
    });

    return NextResponse.json({
      ok: true,
      applicationUrl: destination.applicationDestinationUrl,
      nowActive: lifecycleFields.is_active,
      note: lifecycleFields.is_active
        ? "Verified and live."
        : "Verified, but the deadline has passed — the row is tracked for its next cycle instead of shown.",
    });
  } catch (error) {
    console.error(
      "reactivate-opportunity error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Reactivation failed." }, { status: 500 });
  }
}
