import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isPaidPlan } from "@/lib/billing/plans";
import { startTrial } from "@/lib/billing/subscription";

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

    const body = await request.json();
    const plan = body.plan;
    if (!isPaidPlan(plan)) {
      return NextResponse.json({ error: "Pick a plan to try." }, { status: 400 });
    }

    const result = await startTrial(createServiceSupabase(), user.id, plan);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({ ok: true, trialEndsAt: result.trialEndsAt });
  } catch (error) {
    console.error(
      "start-trial error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Could not start the trial." }, { status: 500 });
  }
}
