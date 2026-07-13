"use client";

/**
 * Embedded Stripe checkout — the payment form renders here, on our page;
 * the user never leaves oppscores.com. New subscribers see the 7-day trial
 * baked into the summary; returning subscribers see the plain subscription.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { AppNav } from "@/components/layout/app-nav";
import { supabase } from "@/lib/supabase";
import { getPlanLimits } from "@/lib/billing/plans";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

function CheckoutInner() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan") || "pro";
  const planLimits = getPlanLimits(plan);
  const [error, setError] = useState("");
  const [manageInstead, setManageInstead] = useState(false);

  const fetchClientSecret = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      window.location.href = `/login?next=/checkout?plan=${plan}`;
      throw new Error("Not signed in");
    }
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ plan }),
    });
    const payload = await response.json();
    if (!response.ok) {
      if (payload.manageInstead) setManageInstead(true);
      setError(payload.error || "Could not start checkout.");
      throw new Error(payload.error || "checkout failed");
    }
    return payload.clientSecret as string;
  }, [plan]);

  if (!stripePromise) {
    return (
      <p className="mt-10 text-sm text-red-600">
        Payments aren&apos;t configured yet (missing publishable key).
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Start {planLimits.name}
      </h1>
      <p className="mt-1 text-[15px] text-neutral-500">
        ${planLimits.price}/month after your free week. Cancel anytime from
        Settings. no refunds needed, because you can try everything first.
      </p>

      {error ? (
        <div className="mt-8 rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
          <p className="text-sm text-red-600">{error}</p>
          {manageInstead && (
            <Link
              href="/settings"
              className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Manage your plan in Settings
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
          <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />
      <Suspense fallback={<p className="p-10 text-neutral-400">Loading checkout…</p>}>
        <CheckoutInner />
      </Suspense>
    </div>
  );
}
