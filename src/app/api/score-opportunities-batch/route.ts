import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { runBatchScoringForUser } from "@/lib/scoring/run-batch-scoring";

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

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Thin auth wrapper: identify the caller (bearer user or cron secret), then
 * run the in-process batch scoring core (src/lib/scoring/run-batch-scoring).
 * Internal callers (the job runner) call the lib directly and never touch
 * this route — HTTP self-fetching is what silently broke nightly scoring
 * behind Vercel deployment protection.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const isCronRequest =
      body.cronUserId &&
      body.cronSecret &&
      process.env.CRON_SECRET &&
      body.cronSecret === process.env.CRON_SECRET;

    let userId = "";

    if (isCronRequest) {
      userId = String(body.cronUserId);
    } else {
      const supabase = createSupabaseForRequest(request);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return NextResponse.json(
          { error: "You must be logged in to score opportunities." },
          { status: 401 }
        );
      }
      userId = user.id;
    }

    const result = await runBatchScoringForUser({
      supabase: createServiceSupabase(),
      userId,
      scoreAllEligible: Boolean(body.scoreAllEligible),
      requestedLimit: Number(body.limit || 10),
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, missingFields: result.missingFields },
        { status: result.status }
      );
    }

    const { ok: _ok, ...payload } = result;
    return NextResponse.json(payload);
  } catch (error) {
    console.error(
      "score-opportunities-batch error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Batch scoring failed." }, { status: 500 });
  }
}
