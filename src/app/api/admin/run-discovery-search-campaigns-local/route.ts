import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { runDiscoverySearchCampaigns } from "@/lib/discovery/run-search-campaigns";

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Local test route disabled in production." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const maxCampaigns = Math.min(Number(body.maxCampaigns || 3), 10);

    const supabase = createServiceSupabase();

    const result = await runDiscoverySearchCampaigns({
      supabase,
      maxCampaigns,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("run-discovery-search-campaigns-local error:", error);
    return NextResponse.json(
      { error: "Failed to run discovery search campaigns." },
      { status: 500 }
    );
  }
}
