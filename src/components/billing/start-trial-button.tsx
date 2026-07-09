"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * "Start free trial" — signed-out users go to signup (plan remembered via
 * query param), signed-in users start the 7-day trial immediately.
 */
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

  async function start() {
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

    try {
      const response = await fetch("/api/billing/start-trial", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "Could not start the trial.");
        setBusy(false);
        return;
      }
      router.push("/opportunities");
    } catch {
      setMessage("Could not start the trial. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className={`w-full rounded-lg px-4 py-2 text-center text-sm font-medium transition-colors disabled:opacity-50 ${
          highlighted
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
        }`}
      >
        {busy ? "Starting…" : label}
      </button>
      {message && (
        <p className="mt-2 text-xs text-red-700 dark:text-red-400">{message}</p>
      )}
    </div>
  );
}
