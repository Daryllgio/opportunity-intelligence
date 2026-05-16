import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { scheduleScoringJobForUser } from "@/lib/scoring/schedule-scoring-job";

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
