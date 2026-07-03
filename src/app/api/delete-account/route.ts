import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

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
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (body.confirm !== "DELETE") {
      return NextResponse.json(
        { error: "Confirmation phrase missing." },
        { status: 400 }
      );
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Remove user-owned rows first, then the auth user.
    await admin.from("saved_opportunities").delete().eq("user_id", user.id);
    await admin
      .from("opportunity_competitiveness_scores")
      .delete()
      .eq("user_id", user.id);
    await admin.from("opportunity_score_reports").delete().eq("user_id", user.id);
    await admin.from("user_ai_usage").delete().eq("user_id", user.id);
    await admin.from("user_scoring_jobs").delete().eq("user_id", user.id);
    await admin
      .from("profile_experience_summaries")
      .delete()
      .eq("user_id", user.id);
    await admin.from("profiles").delete().eq("id", user.id);

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error("account deletion failed:", deleteError.message);
      return NextResponse.json(
        { error: "Could not delete the account. Please contact support." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "delete-account error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Could not delete the account." },
      { status: 500 }
    );
  }
}
