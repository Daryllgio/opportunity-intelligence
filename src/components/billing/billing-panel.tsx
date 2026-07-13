"use client";

/**
 * Settings billing panel: current plan, live status (trial days left,
 * grace warnings, next billing date, scheduled downgrades), change-plan
 * link, and cancel/resume — the user's one honest window into their money.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { PLAN_LIMITS, type PlanLimits, type SubscriptionPlan } from "@/lib/billing/plans";
import { formatDateOnly } from "@/lib/utils/format";

type Snapshot = {
  plan: SubscriptionPlan | null;
  status: string;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: string | null;
  pendingPlanEffectiveAt: string | null;
  hasStripeSubscription: boolean;
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return Number.isFinite(days) ? Math.max(0, days) : null;
}

export function BillingPanel({
  planLabel,
  planLimits,
}: {
  planLabel: string;
  planLimits: PlanLimits;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    try {
      const response = await fetch("/api/billing/manage", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.ok) setSnapshot(await response.json());
    } catch {
      // The static plan copy below still renders.
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function post(action: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    try {
      const response = await fetch("/api/billing/manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();
      setMessage(payload.message || payload.error || "");
      await load();
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const trialDays = daysUntil(snapshot?.trialEndsAt || null);
  const graceDays = daysUntil(snapshot?.graceEndsAt || null);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{planLabel}</p>
        {snapshot?.status === "trialing" && (
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-neutral-800 dark:text-neutral-200">
            Free trial{typeof trialDays === "number" ? ` · ${trialDays} day${trialDays === 1 ? "" : "s"} left` : ""}
          </span>
        )}
        {snapshot?.status === "grace" && (
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Payment issue{typeof graceDays === "number" ? ` · access ends in ${graceDays} day${graceDays === 1 ? "" : "s"}` : ""}
          </span>
        )}
        {snapshot?.status === "expired" && (
          <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            Expired · your data is saved
          </span>
        )}
      </div>

      <p className="mt-1 text-sm text-neutral-400">
        {planLimits.hasCompetitivenessRanking
          ? `Matching across ${
              planLimits.rankedCategoryLimit === "all" ? "all" : planLimits.rankedCategoryLimit
            } categor${planLimits.rankedCategoryLimit === 1 ? "y" : "ies"} · up to ${planLimits.competitivenessReports} reports per month`
          : "Database access: the full eligibility-matched catalog, saving, and reminders."}
      </p>

      {snapshot?.status === "trialing" && typeof trialDays === "number" && trialDays <= 2 && (
        <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
          Your card will be charged ${snapshot.plan ? PLAN_LIMITS[snapshot.plan].price : ""} when
          the trial ends{snapshot.trialEndsAt ? ` on ${formatDateOnly(snapshot.trialEndsAt)}` : ""}.
        </p>
      )}

      {snapshot?.currentPeriodEnd && snapshot.status === "active" && (
        <p className="mt-2 text-sm text-neutral-500">
          {snapshot.cancelAtPeriodEnd
            ? `Cancels on ${formatDateOnly(snapshot.currentPeriodEnd)} — access continues until then.`
            : `Next billing date: ${formatDateOnly(snapshot.currentPeriodEnd)}.`}
        </p>
      )}

      {snapshot?.pendingPlan && snapshot.pendingPlanEffectiveAt && (
        <p className="mt-2 text-sm text-neutral-500">
          Moving to {PLAN_LIMITS[snapshot.pendingPlan as SubscriptionPlan]?.name} on{" "}
          {formatDateOnly(snapshot.pendingPlanEffectiveAt)}.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Link
          href="/pricing"
          className="text-sm font-medium underline underline-offset-2"
        >
          {snapshot?.hasStripeSubscription ? "Change plan" : "See plans"}
        </Link>

        {snapshot?.hasStripeSubscription &&
          ["active", "trialing", "grace"].includes(snapshot.status) &&
          (snapshot.cancelAtPeriodEnd ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => post("resume")}
              className="text-sm font-medium text-neutral-700 underline underline-offset-2 disabled:opacity-50 dark:text-neutral-300"
            >
              Undo cancellation
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => post("cancel")}
              className="text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-600 disabled:opacity-50"
            >
              Cancel subscription
            </button>
          ))}
      </div>

      {message && (
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">{message}</p>
      )}
    </div>
  );
}
