import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { runDiscoverySearchCampaigns } from "@/lib/discovery/run-search-campaigns";

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

    const result = await runDiscoverySearchCampaigns({
      supabase,
      maxCampaigns: 5,
      maxResultsPerCampaign: 10,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Cron discovery error:", error);
    return NextResponse.json({ error: "Discovery failed" }, { status: 500 });
  }
}
