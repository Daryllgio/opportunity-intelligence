import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  addDays,
  computeNextLifecycleCheck,
} from "@/lib/opportunities/lifecycle";

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
        { error: "You must be logged in." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.is_admin) {
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 }
      );
    }

    const now = new Date();

    const { data: dueOpportunities, error: dueError } = await supabase
      .from("opportunities")
      .select("*")
      .neq("lifecycle_status", "archived")
      .not("next_check_at", "is", null)
      .lte("next_check_at", now.toISOString())
      .order("next_check_at", { ascending: true })
      .limit(25);

    if (dueError) {
      return NextResponse.json({ error: dueError.message }, { status: 500 });
    }

    let processed = 0;
    let renewalWindow = 0;
    let preDeadline = 0;
    let rolling = 0;
    let noFurtherCheck = 0;

    for (const opportunity of dueOpportunities || []) {
      processed += 1;

      let next_check_at: string | null = null;
      let check_reason: string | null = null;

      if (opportunity.check_reason === "renewal_window") {
        renewalWindow += 1;

        // During renewal windows, check every 14 days.
        next_check_at = addDays(now, 14).toISOString();
        check_reason = "renewal_window";
      } else if (opportunity.check_reason === "rolling_recheck") {
        rolling += 1;

        // Rolling opportunities are rechecked every ~75 days.
        next_check_at = addDays(now, 75).toISOString();
        check_reason = "rolling_recheck";
      } else if (opportunity.check_reason === "pre_deadline_verification") {
        preDeadline += 1;

        // After the pre-deadline verification point is reached, do not schedule
        // repeated checks before the deadline. Expiration maintenance will handle
        // the opportunity when the deadline passes.
        next_check_at = null;
        check_reason = "no_recurring_check_needed";
        noFurtherCheck += 1;
      } else {
        const nextCheck = computeNextLifecycleCheck(opportunity, now);
        next_check_at = nextCheck.next_check_at;
        check_reason = nextCheck.check_reason;
      }

      const { error: updateError } = await supabase
        .from("opportunities")
        .update({
          last_checked_at: now.toISOString(),
          next_check_at,
          check_reason,
          updated_at: now.toISOString(),
        })
        .eq("id", opportunity.id);

      if (updateError) {
        return NextResponse.json(
          {
            error: updateError.message,
            opportunity_id: opportunity.id,
            title: opportunity.title,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      processed,
      renewalWindow,
      preDeadline,
      rolling,
      noFurtherCheck,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run due opportunity checks.",
      },
      { status: 500 }
    );
  }
}
