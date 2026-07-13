/**
 * Stripe wiring — the thin, typed bridge between Stripe objects and the
 * platform's own billing state machine (billing/subscription.ts). Stripe is
 * the source of truth for MONEY (charges, trials, periods, cancellation);
 * the profiles table is the source of truth for ACCESS (subscription_status,
 * plan, grace windows). Webhooks reconcile the two.
 *
 * LIVE KEYS. Everything here moves real money — no experimental calls.
 */
import Stripe from "stripe";
import type { SubscriptionPlan } from "@/lib/billing/plans";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

export function priceIdForPlan(plan: SubscriptionPlan): string {
  const priceId = {
    basic: process.env.STRIPE_PRICE_BASIC,
    pro: process.env.STRIPE_PRICE_PRO,
    premium: process.env.STRIPE_PRICE_PREMIUM,
  }[plan];
  if (!priceId) throw new Error(`Missing Stripe price id for plan "${plan}".`);
  return priceId;
}

export function planForPriceId(priceId: string | null | undefined): SubscriptionPlan | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_BASIC) return "basic";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_PREMIUM) return "premium";
  return null;
}

type SupabaseClientLike = { from: (table: string) => any };

/** Find or create the Stripe customer for a user, persisting the id. */
export async function getOrCreateStripeCustomer({
  supabase,
  userId,
  email,
}: {
  supabase: SupabaseClientLike;
  userId: string;
  email: string | null;
}): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  const existing = String(profile?.stripe_customer_id || "");
  if (existing) return existing;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { oppscore_user_id: userId },
  });

  // The customer id MUST persist — it's how webhooks map money events back
  // to a user. If the column is missing (apply-me-5.sql pending) or the
  // write fails, checkout cannot safely proceed: delete the just-created
  // customer and fail loudly rather than mint orphans on every attempt.
  const { error: persistError } = await supabase
    .from("profiles")
    .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (persistError) {
    await stripe.customers.del(customer.id).catch(() => {});
    throw new Error(
      /column|schema/i.test(persistError.message)
        ? "Billing columns missing — apply scripts/sql/apply-me-5.sql first."
        : `Could not persist Stripe customer: ${persistError.message}`
    );
  }

  return customer.id;
}

/** Resolve which profile a Stripe customer id belongs to. */
export async function userIdForCustomer(
  supabase: SupabaseClientLike,
  customerId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

/** Map a Stripe subscription object onto profile billing fields. */
export function subscriptionToProfileFields(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price?.id;
  const plan = planForPriceId(priceId);
  const status = subscription.status;

  // Stripe status -> platform access status. past_due opens OUR grace
  // window (7 days, data preserved); canceled/unpaid/expired stop access.
  const platformStatus =
    status === "trialing"
      ? "trialing"
      : status === "active"
        ? "active"
        : status === "past_due"
          ? "grace"
          : "expired";

  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;

  return {
    plan,
    fields: {
      ...(plan ? { subscription_plan: plan } : {}),
      subscription_status: platformStatus,
      stripe_subscription_id: subscription.id,
      cancel_at_period_end: subscription.cancel_at_period_end === true,
      ...(currentPeriodEnd
        ? { current_period_end: new Date(currentPeriodEnd * 1000).toISOString() }
        : {}),
      ...(subscription.trial_end && status === "trialing"
        ? { trial_ends_at: new Date(subscription.trial_end * 1000).toISOString() }
        : {}),
      updated_at: new Date().toISOString(),
    },
  };
}

/**
 * Apply due scheduled downgrades: profiles whose pending_plan has reached
 * its effective date get the Stripe price swap (no proration — the new
 * cheaper price simply starts the new period) and the profile plan update.
 * Runs inside the daily lifecycle cron.
 */
export async function processDuePlanChanges(supabase: SupabaseClientLike) {
  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("profiles")
    .select("id, pending_plan, stripe_subscription_id")
    .not("pending_plan", "is", null)
    .lte("plan_change_effective_at", nowIso);
  if (error || !due?.length) return { applied: 0 };

  const stripe = getStripe();
  let applied = 0;
  for (const row of due) {
    const plan = String(row.pending_plan) as SubscriptionPlan;
    try {
      if (row.stripe_subscription_id) {
        const subscription = await stripe.subscriptions.retrieve(
          String(row.stripe_subscription_id)
        );
        const itemId = subscription.items.data[0]?.id;
        if (itemId) {
          await stripe.subscriptions.update(String(row.stripe_subscription_id), {
            items: [{ id: itemId, price: priceIdForPlan(plan) }],
            proration_behavior: "none",
          });
        }
      }
      await supabase
        .from("profiles")
        .update({
          subscription_plan: plan,
          pending_plan: null,
          plan_change_effective_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      applied += 1;
    } catch (err) {
      console.error("plan change failed for", row.id, err);
    }
  }
  return { applied };
}
