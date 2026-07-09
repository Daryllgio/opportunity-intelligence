import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { runDiscoverySearchCampaigns } from "@/lib/discovery/run-search-campaigns";
import { processPendingDiscoveredPages } from "@/lib/discovery/process-discovered-page";
import {
  decelerateExhaustedCampaigns,
  generateGapCampaigns,
  isPeakSeason,
  retireJunkCampaigns,
} from "@/lib/ops/maintenance";

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

// Called by Vercel Cron. Runs a conservative batch of discovery search
// campaigns. Protected by CRON_SECRET (same pattern as run-scoring-jobs).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceSupabase();

    // The cron fires at 0/2/4/6 UTC. During peak application season
    // (Aug-Nov, Jan-Mar) every slot works — 4x nightly throughput while new
    // postings appear fastest. Off-peak, only the 2 AM slot does work.
    const hourUtc = new Date().getUTCHours();
    const peak = isPeakSeason();
    if (!peak && hourUtc !== 2) {
      return NextResponse.json({
        success: true,
        skipped: "off-peak; only the 02:00 UTC slot runs outside peak season",
      });
    }

    // Weekly self-maintenance on the Monday 2 AM slot: back off exhausted
    // campaigns, retire junk ones, and open campaigns for coverage gaps the
    // user base actually has.
    let maintenance;
    if (new Date().getUTCDay() === 1 && hourUtc === 2) {
      try {
        maintenance = {
          exhausted: await decelerateExhaustedCampaigns(supabase),
          junk: await retireJunkCampaigns(supabase),
          gaps: await generateGapCampaigns(supabase),
        };
      } catch (error) {
        maintenance = {
          error: error instanceof Error ? error.message : "maintenance failed",
        };
      }
    }

    const result = await runDiscoverySearchCampaigns({
      supabase,
      maxCampaigns: 5,
      maxResultsPerCampaign: 10,
    });

    // Second half of the pipeline: candidates found tonight (and any backlog)
    // flow through capture → extraction → verified ingest without a human.
    let processing;
    try {
      processing = await processPendingDiscoveredPages({ supabase, limit: 20 });
    } catch (error) {
      processing = {
        error: error instanceof Error ? error.message : "processing failed",
      };
    }

    return NextResponse.json({
      success: true,
      peakSeason: peak,
      ...(maintenance ? { maintenance } : {}),
      ...result,
      processing,
    });
  } catch (error) {
    console.error("Cron discovery error:", error);
    return NextResponse.json({ error: "Discovery failed" }, { status: 500 });
  }
}
