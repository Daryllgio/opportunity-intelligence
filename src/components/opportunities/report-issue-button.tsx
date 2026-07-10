"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

const REPORT_REASONS = [
  { value: "dead_link", label: "The application link is dead" },
  { value: "wrong_page", label: "The link goes to the wrong page" },
  { value: "aggregator_page", label: "It links to an aggregator, not the provider" },
  { value: "not_relevant", label: "The opportunity details are wrong" },
  { value: "other", label: "Something else" },
];

/**
 * Feedback loop for the core product promise: if an Apply link is dead,
 * wrong, or an aggregator, the student can flag it for re-verification.
 */
export function ReportIssueButton({ opportunityId }: { opportunityId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSubmitting(true);
    setError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    try {
      const response = await fetch("/api/report-opportunity-issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: session?.access_token
            ? `Bearer ${session.access_token}`
            : "",
        },
        body: JSON.stringify({ opportunityId, reportType: reason }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || "Could not submit the report.");
        setSubmitting(false);
        return;
      }

      setDone(true);
    } catch {
      setError("Could not submit the report.");
    }
    setSubmitting(false);
  }

  if (done) {
    return (
      <p className="text-sm text-neutral-500">
        Thanks. we&apos;ll re-verify this opportunity.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300"
      >
        Report an issue
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
      <p className="text-sm font-medium">What&apos;s wrong?</p>
      <select
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="mt-2 h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        {REPORT_REASONS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit report"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
