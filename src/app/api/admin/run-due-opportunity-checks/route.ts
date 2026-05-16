import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { recheckOpportunity } from "@/lib/opportunities/recheck-opportunity";

function createSupabaseForRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseForRequest(request);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.is_admin) {
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 }
      );
    }

    const now = new Date();

    const { data: dueOpportunities, error: dueError } = await supabase
      .from("opportunities")
      .select("*")
      .neq("lifecycle_status", "archived")
      .not("next_check_at", "is", null)
      .lte("next_check_at", now.toISOString())
      .order("next_check_at", { ascending: true })
      .limit(25);

    if (dueError) {
      return NextResponse.json({ error: dueError.message }, { status: 500 });
    }

    let processed = 0;
    let renewalWindow = 0;
    let preDeadline = 0;
    let rolling = 0;
    let usedGemini = 0;
    let unchanged = 0;
    let contentChanged = 0;
    let criteriaChanged = 0;
    let extractedNoStructuredChange = 0;
    let missingUrl = 0;
    let fetchFailed = 0;
    let renewedCreated = 0;
    let renewedUpdated = 0;
    let existingRenewedLinked = 0;
    let failed = 0;
    let scoresMarkedStale = 0;
    let scoresReused = 0;

    for (const opportunity of dueOpportunities || []) {
      processed += 1;

      if (opportunity.check_reason === "renewal_window") renewalWindow += 1;
      if (opportunity.check_reason === "pre_deadline_verification") {
        preDeadline += 1;
      }
      if (opportunity.check_reason === "rolling_recheck") rolling += 1;

      try {
        const result = await recheckOpportunity({
          supabase,
          opportunityId: opportunity.id,
        });

        if (result.usedGemini) usedGemini += 1;
        if (result.outcome === "unchanged_page") unchanged += 1;
        if (result.outcome === "missing_url") missingUrl += 1;
        if (result.outcome === "fetch_failed") fetchFailed += 1;
        if (result.outcome === "renewed_cycle_created") renewedCreated += 1;
        if (result.outcome === "renewed_cycle_updated") renewedUpdated += 1;
        if (result.outcome === "existing_renewed_cycle_linked") {
          existingRenewedLinked += 1;
        }
        if (result.outcome === "extracted_no_structured_change") {
          extractedNoStructuredChange += 1;
        }
        if (result.contentChanged) contentChanged += 1;
        if (result.criteriaChanged) criteriaChanged += 1;
        scoresMarkedStale += result.scoresMarkedStale || 0;
        scoresReused += result.reusedScores || 0;
      } catch (error) {
        failed += 1;

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

    return NextResponse.json({
      processed,
      renewalWindow,
      preDeadline,
      rolling,
      usedGemini,
      unchanged,
      contentChanged,
      criteriaChanged,
      extractedNoStructuredChange,
      missingUrl,
      fetchFailed,
      renewedCreated,
      renewedUpdated,
      existingRenewedLinked,
      failed,
      scoresMarkedStale,
      scoresReused,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run due opportunity checks.",
      },
      { status: 500 }
    );
  }
}
