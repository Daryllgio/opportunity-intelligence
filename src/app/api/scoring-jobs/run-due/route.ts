import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { processScoringJob } from "@/lib/scoring/process-scoring-job";
import { resolvePlanTransitions } from "@/lib/billing/subscription";

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
 * Run the CALLER's own pending scoring job, if one is ready. The browse page
 * fires this when a signed-in user looks at their matches, so a profile edit
 * turns into fresh scores at the moment they matter instead of at tomorrow's
 * cron. A job is ready when its debounce window has passed, or when the user
 * has clearly finished editing (no profile writes for 2+ minutes).
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

    const service = createServiceSupabase();

    // Presence beacon: the browse page calls this route on arrival, so it
    // doubles as "user is active" — which is what resumes paused auto-refresh
    // for dormant accounts. Fails silently until the column exists. It also
    // lazily persists any due subscription transition (trial/grace expiry,
    // scheduled downgrade) so billing state converges without its own cron.
    await service
      .from("profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", user.id)
      .then(() => {});

    const { data: profileForBilling } = await service
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (profileForBilling) {
      await resolvePlanTransitions(service, profileForBilling);
    }

    const { data: job } = await service
      .from("user_scoring_jobs")
      .select("id, user_id, attempts, scheduled_for")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .in("job_type", ["initial_scoring", "profile_refresh"])
      .order("scheduled_for", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!job) {
      return NextResponse.json({ processed: 0, message: "No pending scoring job." });
    }

    const dueNow =
      job.scheduled_for && new Date(job.scheduled_for).getTime() <= Date.now();

    if (!dueNow) {
      const { data: profile } = await service
        .from("profiles")
        .select("updated_at")
        .eq("id", user.id)
        .maybeSingle();

      const doneEditing =
        profile?.updated_at &&
        Date.now() - new Date(profile.updated_at).getTime() > 2 * 60 * 1000;

      if (!doneEditing) {
        return NextResponse.json({
          processed: 0,
          message: "Scoring job is debounced; it will run shortly.",
        });
      }
    }

    const result = await processScoringJob({
      supabase: service,
      job,
      origin: request.nextUrl.origin,
    });

    return NextResponse.json({ processed: 1, ...result });
  } catch (error) {
    console.error(
      "run-due scoring error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Failed to run scoring job." }, { status: 500 });
  }
}
