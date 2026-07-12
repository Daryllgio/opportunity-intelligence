import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { reconcileSchoolDemand } from "@/lib/discovery/school-demand";
import { runSchoolDemandDiscovery } from "@/lib/discovery/run-school-demand";

export const maxDuration = 300;

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * DAYTIME school-specific discovery — the demand-driven stream.
 *
 * Scheduled several times a day (Vercel Pro; on Hobby only the first cron
 * fires and school results simply take up to a day — the design degrades,
 * it doesn't break). Kept deliberately separate from the NIGHTLY
 * open/national stream (/api/cron/run-discovery at 02:00): different
 * routes, different schedules, different budgets — neither can starve the
 * other by construction.
 *
 * Each run: (1) reconcile the demand queue from every profile (pure DB
 * work, self-healing, authoritative user counts), then (2) work the top
 * demand slices. A day with no new demand reconciles in milliseconds and
 * spends nothing.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceSupabase();

    let reconcile;
    try {
      reconcile = await reconcileSchoolDemand({ supabase });
    } catch (error) {
      // Table missing (apply-me-4.sql pending): report and exit cleanly.
      return NextResponse.json({
        success: false,
        error: `Demand reconciliation unavailable: ${
          error instanceof Error ? error.message.slice(0, 120) : "unknown"
        }. Apply scripts/sql/apply-me-4.sql.`,
      });
    }

    const run = await runSchoolDemandDiscovery({ supabase });

    return NextResponse.json({ success: true, reconcile, run });
  } catch (error) {
    console.error("School-demand cron error:", error);
    return NextResponse.json(
      { error: "School-demand discovery failed" },
      { status: 500 }
    );
  }
}
