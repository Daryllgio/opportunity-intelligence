import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { scheduleScoringJobForUser } from "@/lib/scoring/schedule-scoring-job";
import { registerSchoolDemand } from "@/lib/discovery/school-demand";

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
        { error: "You must be logged in to schedule scoring." },
        { status: 401 }
      );
    }

    const result = await scheduleScoringJobForUser({
      supabase,
      userId: user.id,
    });

    // This endpoint fires on every profile/preferences save — the natural
    // moment to register the user's school/transfer/grad-target demand so
    // the next daytime discovery slot picks it up. Never blocks scoring.
    try {
      const service = createServiceSupabase();
      const { data: profile } = await service
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (profile) {
        await registerSchoolDemand({ supabase: service, profile });
      }
    } catch {
      // The reconciliation sweep in the daytime cron is the safety net.
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to schedule scoring job.",
      },
      { status: 500 }
    );
  }
}
