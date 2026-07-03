import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildLifecycleFields } from "@/lib/opportunities/lifecycle";
import { scheduleScoringJobsForUsers } from "@/lib/scoring/schedule-scoring-job";
import { reverifyPublishedDestinations } from "@/lib/opportunities/reverify-destinations";

function createServiceSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Called by Vercel Cron. Expires opportunities past their deadline, marks the
// affected competitiveness scores stale, and reschedules scoring jobs.
// Mirrors the admin lifecycle-maintenance route but is CRON_SECRET-gated.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceSupabase();

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
        .update({ ...lifecycleFields, updated_at: new Date().toISOString() })
        .eq("id", opportunity.id);

      if (updateError) {
        console.error("Lifecycle update failed:", opportunity.id, updateError.message);
        continue;
      }

      const { data: staleRows } = await supabase
        .from("opportunity_competitiveness_scores")
        .update({
          score_status: "stale",
          stale_reason: "opportunity_expired",
          updated_at: new Date().toISOString(),
        })
        .eq("opportunity_id", opportunity.id)
        .eq("score_status", "current")
        .select("id, user_id");

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

    // Self-healing pass: re-verify a rotating batch of live Apply links with
    // the same AI verifier used at publish time. Confirmed links stay, dead
    // cycles expire, wrong links get repaired or pulled for review.
    const reverify = await reverifyPublishedDestinations({ supabase, limit: 15 });

    return NextResponse.json({
      success: true,
      checked,
      expired,
      unchanged,
      scoresMarkedStale,
      reverify,
    });
  } catch (error) {
    console.error("Cron lifecycle error:", error);
    return NextResponse.json({ error: "Lifecycle maintenance failed" }, { status: 500 });
  }
}
