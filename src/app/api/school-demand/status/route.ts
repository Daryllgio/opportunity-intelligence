import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { deriveDemandSlices, demandKeyFor } from "@/lib/discovery/school-demand";

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

// The daytime demand cron's schedule (UTC hours) — keep in sync with
// vercel.json. Used to tell users honestly when their school's
// opportunities will be ready.
const DEMAND_CRON_UTC_HOURS = [8, 11, 14, 17, 20, 23];

function nextRunTime(): Date {
  const now = new Date();
  for (const hour of DEMAND_CRON_UTC_HOURS) {
    const candidate = new Date(now);
    candidate.setUTCHours(hour, 0, 0, 0);
    if (candidate > now) return candidate;
  }
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(DEMAND_CRON_UTC_HOURS[0], 0, 0, 0);
  return tomorrow;
}

/**
 * "When will my school's opportunities be ready?" — an honest expectation.
 * Returns the user's demand slices that are still being gathered and the
 * next scheduled gathering time, so the UI can say "check back around
 * [time]" instead of leaving a new user staring at a thin catalog.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseForRequest(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const service = createServiceSupabase();
    const { data: profile } = await service
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) return NextResponse.json({ pending: [], readyAround: null });

    const keys = deriveDemandSlices(profile).map(demandKeyFor);
    if (keys.length === 0) return NextResponse.json({ pending: [], readyAround: null });

    const { data: rows, error } = await service
      .from("school_demand")
      .select("demand_key, school, level, field, status, passes_done")
      .in("demand_key", keys);

    if (error) {
      // Table not migrated yet — nothing to report.
      return NextResponse.json({ pending: [], readyAround: null });
    }

    const pending = (rows || [])
      .filter((row) => row.status === "pending" || (row.status === "in_progress" && Number(row.passes_done) === 0))
      .map((row) => ({
        school: row.school,
        level: row.level,
        field: row.field,
      }));

    return NextResponse.json({
      pending,
      readyAround: pending.length > 0 ? nextRunTime().toISOString() : null,
    });
  } catch {
    return NextResponse.json({ pending: [], readyAround: null });
  }
}
