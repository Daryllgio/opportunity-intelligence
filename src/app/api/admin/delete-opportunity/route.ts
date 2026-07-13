import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function createSupabaseForRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * HARD DELETE — for test entries, mistakes, and junk. Distinct from
 * archiving (the normal disposition, which preserves everything):
 * - refuses when any user has SAVED the opportunity (archive instead —
 *   deleting something users bookmarked breaks their saved list);
 * - otherwise removes dependent rows (scores, reports, eligibility cache,
 *   deadline reminders) and then the opportunity itself, permanently.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseForRequest(request);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.is_admin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const opportunityId = String(body.opportunityId || "");
    if (!opportunityId) {
      return NextResponse.json({ error: "opportunityId is required." }, { status: 400 });
    }

    const service = createServiceSupabase();

    const { data: target } = await service
      .from("opportunities")
      .select("id, title")
      .eq("id", opportunityId)
      .maybeSingle();
    if (!target) {
      return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
    }

    const { count: saves } = await service
      .from("saved_opportunities")
      .select("id", { count: "exact", head: true })
      .eq("opportunity_id", opportunityId);
    if ((saves || 0) > 0) {
      return NextResponse.json(
        {
          error: `${saves} user${saves === 1 ? " has" : "s have"} saved this opportunity — archive it instead of deleting.`,
          savedCount: saves,
        },
        { status: 409 }
      );
    }

    // Dependent rows first (tables without FK cascade), then the row.
    for (const table of [
      "opportunity_competitiveness_scores",
      "opportunity_score_reports",
      "eligibility_ai_decisions",
    ]) {
      await service.from(table).delete().eq("opportunity_id", opportunityId);
    }

    const { error: deleteError } = await service
      .from("opportunities")
      .delete()
      .eq("id", opportunityId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: `Deleted "${String(target.title).slice(0, 60)}" permanently.`,
    });
  } catch (error) {
    console.error("delete-opportunity error:", error);
    return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  }
}
