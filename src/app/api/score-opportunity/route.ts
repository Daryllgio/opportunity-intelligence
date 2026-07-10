import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { runScoreReport } from "@/lib/reports/run-score-report";

function createSupabaseForRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

/**
 * Thin auth wrapper around the in-process competitiveness-report core
 * (src/lib/reports/run-score-report) — the route owns identity, the lib
 * owns behavior. The user-scoped client is passed through so RLS keeps
 * governing every read and write.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseForRequest(request);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to generate a score report." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const opportunityId = body.opportunityId;

    if (!opportunityId) {
      return NextResponse.json(
        { error: "opportunityId is required." },
        { status: 400 }
      );
    }

    const result = await runScoreReport({
      supabase,
      userId: user.id,
      opportunityId: String(opportunityId),
    });

    if (!result.ok) {
      const { ok: _ok, status, ...payload } = result;
      return NextResponse.json(payload, { status });
    }

    return NextResponse.json({
      report: result.report,
      usedOverflowCredit: result.usedOverflowCredit,
      usage: result.usage,
    });
  } catch (error) {
    console.error(
      "score-opportunity error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Score report generation failed. Please try again." },
      { status: 500 }
    );
  }
}
