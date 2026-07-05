import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { processDiscoveredPage } from "@/lib/discovery/process-discovered-page";

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

    const body = await request.json();
    const discoveredPageId = String(body.discoveredPageId || "").trim();

    if (!discoveredPageId) {
      return NextResponse.json(
        { error: "Missing discoveredPageId." },
        { status: 400 }
      );
    }

    const supabase = createServiceSupabase();

    const { data: discoveredPage, error: pageError } = await supabase
      .from("discovered_pages")
      .select("*")
      .eq("id", discoveredPageId)
      .maybeSingle();

    if (pageError) {
      return NextResponse.json({ error: pageError.message }, { status: 500 });
    }

    if (!discoveredPage) {
      return NextResponse.json(
        { error: "Discovered page not found." },
        { status: 404 }
      );
    }

    const outcome = await processDiscoveredPage({
      supabase,
      discoveredPage,
      sourceTrust: String(body.sourceTrust || "standard") as
        | "trusted"
        | "standard"
        | "experimental"
        | "blocked",
    });

    return NextResponse.json(outcome);
  } catch (error) {
    console.error("process-discovered-page-local error:", error);
    return NextResponse.json(
      { error: "Failed to process discovered page." },
      { status: 500 }
    );
  }
}
