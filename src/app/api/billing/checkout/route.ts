import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isPaidPlan, TRIAL_DAYS } from "@/lib/billing/plans";
import { getSubscriptionState } from "@/lib/billing/subscription";
import {
  getOrCreateStripeCustomer,
  getStripe,
  priceIdForPlan,
} from "@/lib/billing/stripe";

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
 * Create an EMBEDDED Stripe Checkout session for a plan. The payment form
 * renders on oppscores.com; the user never leaves. New subscribers get the
 * 7-day free trial (one per account, ever — enforced by trial_started_at);
 * returning subscribers go straight to paid.
 *
 * Users who already hold a live subscription are refused here — plan
 * changes go through /api/billing/manage (proration/scheduling), not a
 * second checkout.
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

    const body = await request.json().catch(() => ({}));
    const plan = String(body.plan || "");
    if (!isPaidPlan(plan)) {
      return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
    }

    const service = createServiceSupabase();
    const { data: profile } = await service
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) {
      return NextResponse.json(
        { error: "Set up your profile before subscribing." },
        { status: 400 }
      );
    }

    const state = getSubscriptionState(profile);
    if (
      profile.stripe_subscription_id &&
      (state.status === "active" || state.status === "trialing" || state.status === "grace")
    ) {
      return NextResponse.json(
        {
          error: "You already have a subscription. Change your plan from Settings instead.",
          manageInstead: true,
        },
        { status: 409 }
      );
    }

    const customerId = await getOrCreateStripeCustomer({
      supabase: service,
      userId: user.id,
      email: user.email || null,
    });

    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://oppscores.com";

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      // SDK v22 vocabulary: "embedded_page" is the embedded checkout mode.
      ui_mode: "embedded_page",
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
      subscription_data: {
        // One free trial per account, ever.
        ...(profile.trial_started_at ? {} : { trial_period_days: TRIAL_DAYS }),
        metadata: { oppscore_user_id: user.id, oppscore_plan: plan },
      },
      metadata: { oppscore_user_id: user.id, oppscore_plan: plan },
      return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    });

    return NextResponse.json({
      clientSecret: session.client_secret,
      sessionId: session.id,
      trialIncluded: !profile.trial_started_at,
    });
  } catch (error) {
    console.error("checkout error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 500 }
    );
  }
}
