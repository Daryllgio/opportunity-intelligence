import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { tier1Eligibility } from "@/lib/matching/tier1";
import { resolveEligibilityTier2 } from "@/lib/matching/tier2-eligibility";

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
 * Resolve eligibility for a set of opportunities against the caller's own
 * profile. Tier 1 (rules) runs server-side on the fly; rows it can't decide
 * go to the cached Tier-2 resolver. The browse page calls this once per
 * load for its undecided rows — cache hits cost nothing, and the Flash
 * budget below caps worst-case spend per request.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseForRequest(request);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const opportunityIds: string[] = Array.isArray(body.opportunityIds)
      ? body.opportunityIds.map(String).slice(0, 100)
      : [];

    if (opportunityIds.length === 0) {
      return NextResponse.json({ decisions: {} });
    }

    const service = createServiceSupabase();

    const [{ data: profile }, { data: rows }] = await Promise.all([
      service.from("profiles").select("*").eq("id", user.id).single(),
      service
        .from("opportunities")
        .select(
          "id, title, eligibility_criteria, eligible_education_levels, eligible_countries, eligible_fields, attributes"
        )
        .in("id", opportunityIds),
    ]);

    if (!profile) {
      return NextResponse.json({ decisions: {} });
    }

    const decisions: Record<
      string,
      { decision: string; reason: string | null; source: string }
    > = {};

    const uncertainRows: Record<string, unknown>[] = [];
    for (const row of rows || []) {
      const tier1 = tier1Eligibility({ profile, opportunity: row });
      if (tier1.decision === "uncertain") {
        uncertainRows.push(row);
      } else {
        decisions[String(row.id)] = {
          decision: tier1.decision,
          reason: tier1.reasons[0] || null,
          source: "rules",
        };
      }
    }

    const tier2 = await resolveEligibilityTier2({
      supabase: service,
      profile,
      rows: uncertainRows,
      maxAiCalls: 4, // ≤32 rows of fresh Flash per request; the rest cache-warm later
    });

    for (const [id, result] of tier2.decisions) {
      decisions[id] = result;
    }

    return NextResponse.json({
      decisions,
      aiCalls: tier2.aiCalls,
      cacheHits: tier2.cacheHits,
    });
  } catch (error) {
    console.error("Eligibility resolve error:", error);
    return NextResponse.json(
      { error: "Could not resolve eligibility." },
      { status: 500 }
    );
  }
}
