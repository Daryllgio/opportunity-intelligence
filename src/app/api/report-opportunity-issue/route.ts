import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const VALID_REPORT_TYPES = [
  "dead_link",
  "wrong_page",
  "not_relevant",
  "aggregator_page",
  "other",
];

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
        { error: "You must be logged in to report an issue." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const opportunityId = String(body.opportunityId || "").trim();
    const reportType = String(body.reportType || "").trim();

    if (!opportunityId || !VALID_REPORT_TYPES.includes(reportType)) {
      return NextResponse.json({ error: "Invalid report." }, { status: 400 });
    }

    const { error: insertError } = await supabase
      .from("opportunity_reports")
      .insert({
        opportunity_id: opportunityId,
        user_id: user.id,
        report_type: reportType,
        details: body.details ? String(body.details).slice(0, 1000) : null,
      });

    if (insertError) {
      console.error("report insert error:", insertError.message);
      return NextResponse.json(
        { error: "Could not submit the report right now." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "report-opportunity-issue error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Could not submit the report." },
      { status: 500 }
    );
  }
}
