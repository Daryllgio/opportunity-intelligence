"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppNav } from "@/components/layout/app-nav";
import { supabase } from "@/lib/supabase";
import { getPlanLabel, getPlanLimits } from "@/lib/billing/plans";

// The email_deadline_reminders column ships via a pending migration, so the
// generated DB types don't know it yet — use an untyped handle for it.
const db = supabase as unknown as SupabaseClient;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-neutral-100 py-8 first:border-t-0 dark:border-neutral-900">
      <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && (
            <p className="mt-1 text-sm leading-5 text-neutral-400">
              {description}
            </p>
          )}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>("free");
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [remindersSupported, setRemindersSupported] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setEmail(user.email || null);

      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_plan")
        .eq("id", user.id)
        .maybeSingle();

      setPlan(profile?.subscription_plan || "free");

      const { data: prefRow, error: prefError } = await db
        .from("profiles")
        .select("email_deadline_reminders")
        .eq("id", user.id)
        .maybeSingle();

      if (prefError) {
        // Column not migrated yet — hide the toggle rather than break.
        setRemindersSupported(false);
      } else {
        setRemindersEnabled(prefRow?.email_deadline_reminders !== false);
      }

      setLoading(false);
    }

    load();
  }, []);

  async function toggleReminders(enabled: boolean) {
    setRemindersEnabled(enabled);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await db
      .from("profiles")
      .update({ email_deadline_reminders: enabled })
      .eq("id", user.id);
    if (error) setRemindersEnabled(!enabled);
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordMessage("");
    if (newPassword.length < 8) {
      setPasswordMessage("Password must be at least 8 characters.");
      return;
    }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) {
      setPasswordMessage(error.message);
      return;
    }
    setNewPassword("");
    setPasswordMessage("Password updated.");
  }

  async function deleteAccount() {
    setDeleteError("");
    setDeleting(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    try {
      const response = await fetch("/api/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: session?.access_token
            ? `Bearer ${session.access_token}`
            : "",
        },
        body: JSON.stringify({ confirm: "DELETE" }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setDeleteError(body.error || "Could not delete the account.");
        setDeleting(false);
        return;
      }

      await supabase.auth.signOut();
      window.location.href = "/";
    } catch {
      setDeleteError("Could not delete the account.");
      setDeleting(false);
    }
  }

  const planLimits = getPlanLimits(plan);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-[15px] text-neutral-500">
          Account, notifications, and plan.
        </p>

        {loading ? (
          <div className="mt-10 space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900"
              />
            ))}
          </div>
        ) : (
          <div className="mt-10">
            <Section title="Account" description="Your sign-in details.">
              <p className="text-sm">
                <span className="text-neutral-400">Email · </span>
                {email}
              </p>

              <form onSubmit={changePassword} className="mt-6 max-w-sm">
                <label
                  htmlFor="newPassword"
                  className="block text-sm font-medium"
                >
                  Change password
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="New password"
                    minLength={8}
                    className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900"
                  />
                  <button
                    type="submit"
                    disabled={passwordSaving || !newPassword}
                    className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                  >
                    {passwordSaving ? "Saving…" : "Update"}
                  </button>
                </div>
                {passwordMessage && (
                  <p className="mt-2 text-sm text-neutral-500">{passwordMessage}</p>
                )}
              </form>
            </Section>

            <Section
              title="Notifications"
              description="Email reminders for saved opportunities."
            >
              {remindersSupported ? (
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={remindersEnabled}
                    onChange={(event) => toggleReminders(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-neutral-300 accent-neutral-600"
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      Deadline reminders
                    </span>
                    <span className="block text-sm text-neutral-400">
                      One email 7 days, 3 days, and the day a saved
                      opportunity is due.
                    </span>
                  </span>
                </label>
              ) : (
                <p className="text-sm text-neutral-400">
                  Notification preferences are being rolled out.
                </p>
              )}
            </Section>

            <Section title="Plan" description="What your plan includes.">
              <p className="text-sm font-medium">{getPlanLabel(plan)}</p>
              <p className="mt-1 text-sm text-neutral-400">
                {planLimits.hasCompetitivenessRanking
                  ? `Matching across ${
                      planLimits.rankedCategoryLimit === "all"
                        ? "all"
                        : planLimits.rankedCategoryLimit
                    } categor${planLimits.rankedCategoryLimit === 1 ? "y" : "ies"} · ${planLimits.gapReports} reports per month`
                  : "Browse-only. Upgrade for matching, saving, and reports."}
              </p>
              <Link
                href="/pricing"
                className="mt-3 inline-block text-sm font-medium underline underline-offset-2"
              >
                {plan === "free" ? "See plans" : "Compare plans"}
              </Link>
            </Section>

            <Section
              title="Delete account"
              description="Permanently removes your profile, saved items, and reports."
            >
              <p className="text-sm text-neutral-500">
                Type <span className="font-mono font-medium">DELETE</span> to
                confirm. This cannot be undone.
              </p>
              <div className="mt-3 flex max-w-sm gap-2">
                <input
                  value={deleteConfirm}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                  placeholder="DELETE"
                  className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm placeholder:text-neutral-300 focus:border-neutral-400 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900"
                />
                <button
                  type="button"
                  onClick={deleteAccount}
                  disabled={deleteConfirm !== "DELETE" || deleting}
                  className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:hover:bg-red-950"
                >
                  {deleting ? "Deleting…" : "Delete account"}
                </button>
              </div>
              {deleteError && (
                <p className="mt-2 text-sm text-red-600">{deleteError}</p>
              )}
            </Section>
          </div>
        )}
      </main>
    </div>
  );
}
