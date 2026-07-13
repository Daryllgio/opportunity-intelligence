import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { PLAN_LIMITS, isPaidPlan } from "@/lib/billing/plans";
import { getSubscriptionState } from "@/lib/billing/subscription";
import { getStripe, priceIdForPlan } from "@/lib/billing/stripe";

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

async function loadContext(request: NextRequest) {
  const supabase = createSupabaseForRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };

  const service = createServiceSupabase();
  const { data: profile } = await service
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    return { error: NextResponse.json({ error: "Profile not found." }, { status: 404 }) };
  }
  return { user, profile, service };
}

/** Current billing snapshot for the settings page. */
export async function GET(request: NextRequest) {
  try {
    const context = await loadContext(request);
    if ("error" in context) return context.error;
    const { profile } = context;

    const state = getSubscriptionState(profile);
    return NextResponse.json({
      plan: state.effectivePlan,
      status: state.status,
      trialEndsAt: profile.trial_ends_at || null,
      graceEndsAt: profile.grace_ends_at || null,
      currentPeriodEnd: profile.current_period_end || null,
      cancelAtPeriodEnd: profile.cancel_at_period_end === true,
      pendingPlan: profile.pending_plan || null,
      pendingPlanEffectiveAt: profile.plan_change_effective_at || null,
      hasStripeSubscription: Boolean(profile.stripe_subscription_id),
    });
  } catch (error) {
    console.error("billing manage GET error:", error);
    return NextResponse.json({ error: "Could not load billing." }, { status: 500 });
  }
}

/**
 * Plan management against the LIVE subscription:
 *   upgrade   -> Stripe swaps the price now with proration; access updates
 *                the moment the webhook lands (and optimistically here).
 *   downgrade -> keeps the higher tier until the period ends: we store the
 *                pending plan; Stripe's swap is applied by the daily billing
 *                cron when the period rolls (no proration surprises).
 *   cancel    -> cancel_at_period_end; access continues to the period end.
 *   resume    -> undo a pending cancellation.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await loadContext(request);
    if ("error" in context) return context.error;
    const { user, profile, service } = context;

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const stripe = getStripe();

    const subscriptionId = String(profile.stripe_subscription_id || "");
    if (!subscriptionId) {
      return NextResponse.json(
        { error: "No active subscription. Choose a plan to subscribe." },
        { status: 400 }
      );
    }

    if (action === "cancel") {
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
      await service
        .from("profiles")
        .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      return NextResponse.json({
        ok: true,
        message: "Your plan stays active until the end of the billing period, then stops. Your data is kept.",
      });
    }

    if (action === "resume") {
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });
      await service
        .from("profiles")
        .update({ cancel_at_period_end: false, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      return NextResponse.json({ ok: true, message: "Cancellation undone. Welcome back." });
    }

    if (action === "change_plan") {
      const targetPlan = String(body.plan || "");
      if (!isPaidPlan(targetPlan)) {
        return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
      }

      const state = getSubscriptionState(profile);
      const currentPrice = state.effectivePlan ? PLAN_LIMITS[state.effectivePlan].price : 0;
      const targetPrice = PLAN_LIMITS[targetPlan].price;
      if (state.effectivePlan === targetPlan) {
        return NextResponse.json({ error: "That's already your plan." }, { status: 400 });
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const itemId = subscription.items.data[0]?.id;
      if (!itemId) {
        return NextResponse.json({ error: "Subscription item not found." }, { status: 500 });
      }

      if (targetPrice > currentPrice) {
        // UPGRADE: swap now, prorate the difference, unlock immediately.
        await stripe.subscriptions.update(subscriptionId, {
          items: [{ id: itemId, price: priceIdForPlan(targetPlan) }],
          proration_behavior: "create_prorations",
          cancel_at_period_end: false,
        });
        await service
          .from("profiles")
          .update({
            subscription_plan: targetPlan,
            pending_plan: null,
            plan_change_effective_at: null,
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
        return NextResponse.json({
          ok: true,
          immediate: true,
          message: `Upgraded to ${PLAN_LIMITS[targetPlan].name}. The difference is prorated on your next invoice.`,
        });
      }

      // DOWNGRADE: hold the higher tier until the period ends; the daily
      // billing cron applies the Stripe price swap when it's due.
      const effectiveAt = profile.current_period_end
        ? String(profile.current_period_end)
        : new Date(Date.now() + 30 * 86400000).toISOString();
      await service
        .from("profiles")
        .update({
          pending_plan: targetPlan,
          plan_change_effective_at: effectiveAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      return NextResponse.json({
        ok: true,
        immediate: false,
        effectiveAt,
        message: `You keep ${state.effectivePlan ? PLAN_LIMITS[state.effectivePlan].name : "your current plan"} until ${new Date(effectiveAt).toLocaleDateString()}, then move to ${PLAN_LIMITS[targetPlan].name}.`,
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("billing manage POST error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Billing action failed." }, { status: 500 });
  }
}
