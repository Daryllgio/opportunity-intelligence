import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildLifecycleFields } from "@/lib/opportunities/lifecycle";
import { scheduleScoringJobsForUsers } from "@/lib/scoring/schedule-scoring-job";

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

    const { data: opportunities, error: opportunitiesError } = await supabase
      .from("opportunities")
      .select("*")
      .neq("lifecycle_status", "archived");

    if (opportunitiesError) {
      return NextResponse.json(
        { error: opportunitiesError.message },
        { status: 500 }
      );
    }

    let checked = 0;
    let expired = 0;
    let unchanged = 0;
    let scoresMarkedStale = 0;

    for (const opportunity of opportunities || []) {
      checked += 1;

      const lifecycleFields = buildLifecycleFields(opportunity);
      const becameExpired =
        opportunity.lifecycle_status !== "expired" &&
        lifecycleFields.lifecycle_status === "expired";

      if (!becameExpired) {
        unchanged += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from("opportunities")
        .update({
          ...lifecycleFields,
          updated_at: new Date().toISOString(),
        })
        .eq("id", opportunity.id);

      if (updateError) {
        return NextResponse.json(
          {
            error: updateError.message,
            opportunity_id: opportunity.id,
            title: opportunity.title,
          },
          { status: 500 }
        );
      }

      const { data: staleRows, error: staleError } = await supabase
        .from("opportunity_competitiveness_scores")
        .update({
          score_status: "stale",
          stale_reason: "opportunity_expired",
          updated_at: new Date().toISOString(),
        })
        .eq("opportunity_id", opportunity.id)
        .eq("score_status", "current")
        .select("id, user_id");

      if (staleError) {
        return NextResponse.json(
          {
            error: staleError.message,
            opportunity_id: opportunity.id,
            title: opportunity.title,
          },
          { status: 500 }
        );
      }

      expired += 1;
      scoresMarkedStale += staleRows?.length || 0;

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

    return NextResponse.json({
      checked,
      expired,
      unchanged,
      scoresMarkedStale,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run opportunity lifecycle maintenance.",
      },
      { status: 500 }
    );
  }
}
