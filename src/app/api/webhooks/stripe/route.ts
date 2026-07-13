import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { GRACE_DAYS } from "@/lib/billing/plans";
import {
  getStripe,
  planForPriceId,
  subscriptionToProfileFields,
  userIdForCustomer,
} from "@/lib/billing/stripe";

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Stripe webhook — where real payment events drive the access state machine.
 *
 *   checkout.session.completed  -> link subscription, start trial/active
 *   invoice.paid                -> active (clears grace), roll period end
 *   invoice.payment_failed      -> grace (7 days, access continues, data kept)
 *   customer.subscription.updated -> sync plan/status/cancel-at-period-end
 *   customer.subscription.deleted -> expired (access stops, DATA PRESERVED —
 *                                    resubscribing resumes where they left off)
 *
 * SETUP (founder): register this endpoint in the Stripe Dashboard →
 * Developers → Webhooks → Add endpoint:
 *     https://oppscores.com/api/webhooks/stripe
 * with the five events above, then put the signing secret in
 * STRIPE_WEBHOOK_SECRET (Vercel env + .env.local). Until the secret is set
 * this endpoint refuses every event (fail closed — unverified webhooks are
 * an attack surface, not a convenience).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook not configured: STRIPE_WEBHOOK_SECRET is missing." },
      { status: 503 }
    );
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature") || "";
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    return NextResponse.json(
      { error: `Signature verification failed: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 400 }
    );
  }

  const supabase = createServiceSupabase();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          String(session.metadata?.oppscore_user_id || "") ||
          (session.customer
            ? await userIdForCustomer(supabase, String(session.customer))
            : null);
        if (!userId) break;

        if (session.subscription) {
          const subscription = await getStripe().subscriptions.retrieve(
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
              pending_plan: null,
              plan_change_effective_at: null,
            })
            .eq("id", userId);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const userId = invoice.customer
          ? await userIdForCustomer(supabase, String(invoice.customer))
          : null;
        if (!userId) break;

        await supabase
          .from("profiles")
          .update({
            subscription_status: "active",
            grace_ends_at: null,
            ...(invoice.period_end
              ? { current_period_end: new Date(invoice.period_end * 1000).toISOString() }
              : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const userId = invoice.customer
          ? await userIdForCustomer(supabase, String(invoice.customer))
          : null;
        if (!userId) break;

        const graceEndsAt = new Date(
          Date.now() + GRACE_DAYS * 86400000
        ).toISOString();
        await supabase
          .from("profiles")
          .update({
            subscription_status: "grace",
            grace_ends_at: graceEndsAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.customer
          ? await userIdForCustomer(supabase, String(subscription.customer))
          : null;
        if (!userId) break;

        const { fields } = subscriptionToProfileFields(subscription);
        await supabase.from("profiles").update(fields).eq("id", userId);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.customer
          ? await userIdForCustomer(supabase, String(subscription.customer))
          : null;
        if (!userId) break;

        // Access stops; every byte of their data stays. Resubscribing
        // resumes exactly where they left off.
        await supabase
          .from("profiles")
          .update({
            subscription_status: "expired",
            stripe_subscription_id: null,
            cancel_at_period_end: false,
            pending_plan: null,
            plan_change_effective_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        break;
      }

      default:
        break; // Unhandled event types acknowledged without action.
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("stripe webhook error:", error instanceof Error ? error.message : error);
    // 500 makes Stripe retry — correct for transient DB trouble.
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
