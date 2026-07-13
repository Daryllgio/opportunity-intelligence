import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getStripe, subscriptionToProfileFields, planForPriceId } from "@/lib/billing/stripe";

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Checkout return: Stripe redirects here with the session id. We confirm
 * the session server-side and OPTIMISTICALLY sync the profile (the webhook
 * is authoritative and will land moments later — this makes the very first
 * page the user sees already reflect their new plan, webhook or not).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const origin = url.origin;

  if (!sessionId) {
    return NextResponse.redirect(`${origin}/pricing`);
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.status === "complete" && session.subscription) {
      const supabase = createServiceSupabase();
      const userId = String(session.metadata?.oppscore_user_id || "");
      if (userId) {
        const subscription = await stripe.subscriptions.retrieve(
          String(session.subscription)
        );
        const { fields } = subscriptionToProfileFields(subscription);
        const isTrial = subscription.status === "trialing";
        await supabase
          .from("profiles")
          .update({
            ...fields,
            ...(isTrial
              ? {
                  trial_started_at: new Date().toISOString(),
                  trial_plan: planForPriceId(subscription.items.data[0]?.price?.id),
                }
              : {}),
            grace_ends_at: null,
          })
          .eq("id", userId);
      }
      return NextResponse.redirect(`${origin}/opportunities?welcome=1`);
    }

    if (session.status === "open") {
      // Payment not completed — send them back to try again.
      return NextResponse.redirect(`${origin}/checkout?plan=${session.metadata?.oppscore_plan || "pro"}`);
    }

    return NextResponse.redirect(`${origin}/pricing`);
  } catch (error) {
    console.error("checkout return error:", error);
    return NextResponse.redirect(`${origin}/pricing`);
  }
}
