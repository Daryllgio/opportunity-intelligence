import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getPlanLimitsForProfile } from "@/lib/billing/subscription";
import { runAiSearch, MAX_QUERY_LENGTH } from "@/lib/search/run-ai-search";

function createSupabaseForRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Thin auth wrapper around the in-process AI search core
 * (src/lib/search/run-ai-search) — the route owns identity, the lib owns
 * behavior, so tests and internal callers never need HTTP.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseForRequest(request);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    const planLimits = getPlanLimitsForProfile(profile as Record<string, unknown> | null);

    const body = await request.json();
    const query = String(body.query || "").trim().slice(0, MAX_QUERY_LENGTH);

    const result = await runAiSearch({
      supabase: createServiceSupabase(),
      userId: user.id,
      query,
      planLimits,
    });

    if (!result.ok) {
      const { ok: _ok, status, ...payload } = result;
      return NextResponse.json(payload, { status });
    }

    return NextResponse.json({
      interpretation: result.interpretation,
      results: result.results,
      usage: {
        usedCredits: result.usage.usedCredits,
        budgetCredits: result.usage.budgetCredits,
      },
    });
  } catch (error) {
    console.error("ai-search error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
