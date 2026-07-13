import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildLifecycleFields } from "@/lib/opportunities/lifecycle";
import { scheduleScoringJobsForUsers } from "@/lib/scoring/schedule-scoring-job";
import { reverifyPublishedDestinations } from "@/lib/opportunities/reverify-destinations";
import { runDueOpportunityChecks } from "@/lib/opportunities/run-due-checks";
import { recheckTrackedDrafts } from "@/lib/opportunities/recheck-tracked-drafts";
import { processDuePlanChanges } from "@/lib/billing/stripe";

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

    // Scheduled downgrades whose period has rolled: apply the Stripe
    // price swap and the profile plan change.
    let planChanges: { applied: number } = { applied: 0 };
    try {
      planChanges = await processDuePlanChanges(supabase);
    } catch (error) {
      console.error("plan-change processing failed:", error);
    }

    // Missed-cycle retirement: an expired row that has sat through two full
    // renewal windows (~26 months) without ever reopening is presumed
    // discontinued — archive it so the renewal heartbeat stops paying to
    // re-read a dead program. Saved references keep working (archived rows
    // are never deleted).
    let archivedMissedCycles = 0;
    try {
      const twoCyclesAgo = new Date();
      twoCyclesAgo.setUTCMonth(twoCyclesAgo.getUTCMonth() - 26);
      const { data: deadRows } = await supabase
        .from("opportunities")
        .update({
          lifecycle_status: "archived",
          archived_at: new Date().toISOString(),
          next_check_at: null,
          check_reason: "no_recurring_check_needed",
          cycle_notes: "Archived: no new cycle observed across two renewal windows.",
          updated_at: new Date().toISOString(),
        })
        .eq("lifecycle_status", "expired")
        .lt("expired_at", twoCyclesAgo.toISOString())
        .select("id");
      archivedMissedCycles = deadRows?.length || 0;
    } catch (error) {
      console.error("missed-cycle archive failed:", error);
    }

    // Renewal heartbeat: expired rows in their renewal window get re-read;
    // pages that came back with a new deadline republish as a verified
    // renewed cycle, reusing prior user scores when criteria are unchanged.
    let dueChecks;
    try {
      dueChecks = await runDueOpportunityChecks({ supabase, limit: 20 });
    } catch (error) {
      dueChecks = {
        error: error instanceof Error ? error.message : "due checks failed",
      };
    }

    // Tracked drafts whose next cycle should have opened: re-read the page
    // and push reopened ones back through the full verified ingest gate.
    let trackedDrafts;
    try {
      trackedDrafts = await recheckTrackedDrafts({ supabase, limit: 8 });
    } catch (error) {
      trackedDrafts = {
        error: error instanceof Error ? error.message : "tracked drafts failed",
      };
    }

    // Self-healing pass: sweep due Apply links with cheap hash probes first,
    // escalating to the AI verifier only for changed/unreachable/stale pages
    // (budgeted). Confirmed links stay, dead cycles expire, wrong links get
    // repaired or pulled for review.
    const reverify = await reverifyPublishedDestinations({
      supabase,
      aiBudget: 15,
      sweepLimit: 120,
    });

    return NextResponse.json({
      success: true,
      checked,
      expired,
      unchanged,
      scoresMarkedStale,
      archivedMissedCycles,
      planChanges,
      dueChecks,
      trackedDrafts,
      reverify,
    });
  } catch (error) {
    console.error("Cron lifecycle error:", error);
    return NextResponse.json({ error: "Lifecycle maintenance failed" }, { status: 500 });
  }
}
