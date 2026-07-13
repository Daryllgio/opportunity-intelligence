"use client";

/**
 * Plan action button — the pricing page's brain for each card.
 *
 *   signed out            -> signup (plan remembered)
 *   signed in, no sub     -> embedded checkout (7-day trial if unused)
 *   the user's own plan   -> "Current plan" indicator, no action
 *   higher plan           -> upgrade (prorated, immediate) via manage API
 *   lower plan            -> downgrade (at period end) via manage API
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PLAN_LIMITS, type SubscriptionPlan } from "@/lib/billing/plans";

type BillingSnapshot = {
  plan: SubscriptionPlan | null;
  status: string;
  hasStripeSubscription: boolean;
  pendingPlan: string | null;
};

export function StartTrialButton({
  plan,
  label,
  highlighted = false,
}: {
  plan: "basic" | "pro" | "premium";
  label: string;
  highlighted?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (active) setLoggedIn(false);
        return;
      }
      if (active) setLoggedIn(true);
      try {
        const response = await fetch("/api/billing/manage", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (response.ok && active) setBilling(await response.json());
      } catch {
        // Pricing page still works without the snapshot.
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const currentPlan = billing?.plan || null;
  const subscribed =
    billing?.hasStripeSubscription &&
    ["active", "trialing", "grace"].includes(String(billing?.status));
  const isCurrent = subscribed && currentPlan === plan;
  const isUpgrade =
    subscribed && currentPlan && PLAN_LIMITS[plan].price > PLAN_LIMITS[currentPlan].price;
  const isPendingTarget = billing?.pendingPlan === plan;

  async function act() {
    if (busy) return;
    setBusy(true);
    setMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.push(`/signup?plan=${plan}`);
      return;
    }

    if (!subscribed) {
      router.push(`/checkout?plan=${plan}`);
      return;
    }

    // Plan change on a live subscription.
    try {
      const response = await fetch("/api/billing/manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "change_plan", plan }),
      });
      const payload = await response.json();
      setMessage(payload.message || payload.error || "");
      if (response.ok) router.refresh();
    } catch {
      setMessage("Something went wrong. Try again from Settings.");
    } finally {
      setBusy(false);
    }
  }

  if (isCurrent) {
    return (
      <div className="mt-8">
        <div className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-primary/60 bg-primary/5 px-4 py-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          <span aria-hidden>✓</span> Current plan
        </div>
        {billing?.pendingPlan && (
          <p className="mt-2 text-center text-xs text-neutral-500">
            Moving to {PLAN_LIMITS[billing.pendingPlan as SubscriptionPlan]?.name} at period end
          </p>
        )}
      </div>
    );
  }

  const buttonLabel = !loggedIn
    ? label
    : !subscribed
      ? label
      : isPendingTarget
        ? "Scheduled at period end"
        : isUpgrade
          ? `Upgrade to ${PLAN_LIMITS[plan].name}`
          : `Switch to ${PLAN_LIMITS[plan].name}`;

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={act}
        disabled={busy || isPendingTarget}
        className={`w-full rounded-lg px-4 py-2 text-center text-sm font-medium transition-colors disabled:opacity-60 ${
          highlighted
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
        }`}
      >
        {busy ? "One moment…" : buttonLabel}
      </button>
      {message && (
        <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{message}</p>
      )}
    </div>
  );
}
