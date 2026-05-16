import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildLifecycleFields } from "@/lib/opportunities/lifecycle";

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

    const { data: opportunities, error: opportunitiesError } = await supabase
      .from("opportunities")
      .select("*")
      .order("created_at", { ascending: true });

    if (opportunitiesError) {
      return NextResponse.json(
        { error: opportunitiesError.message },
        { status: 500 }
      );
    }

    let updated = 0;
    let expired = 0;

    for (const opportunity of opportunities || []) {
      const lifecycleFields = buildLifecycleFields(opportunity);

      const { error: updateError } = await supabase
        .from("opportunities")
        .update({
          ...lifecycleFields,
          updated_at: new Date().toISOString(),
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

      updated += 1;

      if (lifecycleFields.lifecycle_status === "expired") {
        expired += 1;
      }
    }

    return NextResponse.json({
      updated,
      expired,
      active: updated - expired,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to backfill opportunity lifecycle.",
      },
      { status: 500 }
    );
  }
}
