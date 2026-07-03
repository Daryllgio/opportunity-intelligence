"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { AddToCalendarButton } from "@/components/opportunities/add-to-calendar-button";
import { supabase } from "@/lib/supabase";

type Opportunity = {
  id: string;
  title: string;
  provider: string | null;
  type: string;
  deadline: string | null;
  funding_amount: string | null;
  application_url: string | null;
  lifecycle_status: string | null;
};

type SavedRow = {
  savedId: string;
  status: string;
  opportunity: Opportunity;
  score: number | null;
};

const STATUS_META: Record<string, { label: string; dot: string }> = {
  saved: { label: "Saved", dot: "bg-neutral-300" },
  planning: { label: "Planning", dot: "bg-sky-400" },
  applying: { label: "Applying", dot: "bg-amber-400" },
  submitted: { label: "Submitted", dot: "bg-neutral-500" },
  won: { label: "Won", dot: "bg-green-500" },
  rejected: { label: "Rejected", dot: "bg-red-400" },
  not_applying: { label: "Not applying", dot: "bg-neutral-300" },
};

const STATUS_OPTIONS = Object.keys(STATUS_META);

const TABS = [
  { key: "all", label: "All" },
  { key: "saved", label: "Saved" },
  { key: "planning", label: "Planning" },
  { key: "applying", label: "Applying" },
  { key: "submitted", label: "Submitted" },
  { key: "won", label: "Won" },
];

function normalizeStatus(status: string | null): string {
  return status && STATUS_META[status] ? status : "saved";
}

function daysUntil(deadline: string | null) {
  if (!deadline) return null;
  const due = new Date(deadline);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - Date.now()) / 86400000);
}

function DeadlineText({ deadline }: { deadline: string | null }) {
  const days = daysUntil(deadline);
  const dot =
    days === null || days < 0
      ? "bg-neutral-300"
      : days < 7
        ? "bg-red-400"
        : days <= 14
          ? "bg-amber-400"
          : "bg-green-500";
  const label =
    days === null
      ? "No deadline"
      : days < 0
        ? "Closed"
        : days === 0
          ? "Due today"
          : days === 1
            ? "Due tomorrow"
            : `Due in ${days} days`;

  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-neutral-500">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export default function SavedPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<SavedRow[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [pending, setPending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUserId(user.id);

      const [{ data }, { data: scoreRows }] = await Promise.all([
        supabase
          .from("saved_opportunities")
          .select(
            `id, status,
             opportunities (id, title, provider, type, deadline, funding_amount, application_url, lifecycle_status)`
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("opportunity_competitiveness_scores")
          .select("opportunity_id, score")
          .eq("user_id", user.id)
          .eq("score_status", "current"),
      ]);

      const scoreMap = new Map(
        (scoreRows || []).map((row) => [row.opportunity_id, row.score])
      );

      const normalized = ((data || []) as Array<Record<string, unknown>>)
        .map((item) => {
          const opportunity = (
            Array.isArray(item.opportunities)
              ? item.opportunities[0]
              : item.opportunities
          ) as Opportunity | null;
          if (!opportunity || opportunity.lifecycle_status !== "active") {
            return null;
          }
          return {
            savedId: String(item.id),
            status: normalizeStatus(item.status as string | null),
            opportunity,
            score:
              typeof scoreMap.get(opportunity.id) === "number"
                ? (scoreMap.get(opportunity.id) as number)
                : null,
          };
        })
        .filter(Boolean) as SavedRow[];

      setRows(normalized);
      setLoading(false);
    }

    load();
  }, []);

  async function updateStatus(savedId: string, newStatus: string) {
    if (!userId) return;
    const previous = rows.find((r) => r.savedId === savedId)?.status ?? "saved";
    setRows((current) =>
      current.map((r) => (r.savedId === savedId ? { ...r, status: newStatus } : r))
    );
    setPending((p) => ({ ...p, [savedId]: true }));

    const { error } = await supabase
      .from("saved_opportunities")
      .update({ status: newStatus })
      .eq("id", savedId)
      .eq("user_id", userId);

    if (error) {
      setRows((current) =>
        current.map((r) => (r.savedId === savedId ? { ...r, status: previous } : r))
      );
    }
    setPending((p) => ({ ...p, [savedId]: false }));
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const tab of TABS) {
      if (tab.key === "all") continue;
      c[tab.key] = rows.filter((r) => r.status === tab.key).length;
    }
    return c;
  }, [rows]);

  const visible = rows.filter(
    (row) => activeTab === "all" || row.status === activeTab
  );

  function exportCsv() {
    const header = ["Title", "Provider", "Type", "Deadline", "Status", "Match", "Application URL"];
    const escape = (value: unknown) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [
      header.join(","),
      ...rows.map((row) =>
        [
          row.opportunity.title,
          row.opportunity.provider,
          row.opportunity.type,
          row.opportunity.deadline,
          STATUS_META[row.status].label,
          row.score,
          row.opportunity.application_url,
        ]
          .map(escape)
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "oppscore-saved-opportunities.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Saved</h1>
            <p className="mt-1 text-[15px] text-neutral-500 dark:text-neutral-400">
              Track where each application stands.
            </p>
          </div>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={exportCsv}
              className="shrink-0 text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              Export CSV
            </button>
          )}
        </div>

        {loading ? (
          <div className="mt-8 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-neutral-200 p-10 text-center dark:border-neutral-800">
            <h2 className="text-lg font-semibold">Nothing saved yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
              Save opportunities while browsing to track deadlines and
              application progress here.
            </p>
            <Link
              href="/opportunities"
              className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Browse opportunities
            </Link>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="mt-8 flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-800">
              {TABS.map((tab) => {
                const active = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100"
                        : "border-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                    }`}
                  >
                    {tab.label}
                    <span className="ml-1.5 text-neutral-300 dark:text-neutral-600">
                      {counts[tab.key] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Rows */}
            <ul className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-900">
              {visible.length === 0 ? (
                <li className="py-10 text-center text-sm text-neutral-500">
                  Nothing in this stage yet.
                </li>
              ) : (
                visible.map((row) => (
                  <li
                    key={row.savedId}
                    className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/opportunities/${row.opportunity.id}`}
                        className="text-[15px] font-medium hover:underline"
                      >
                        {row.opportunity.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                        {row.opportunity.provider && (
                          <span className="truncate text-sm text-neutral-400">
                            {row.opportunity.provider}
                          </span>
                        )}
                        <DeadlineText deadline={row.opportunity.deadline} />
                        {row.score !== null && (
                          <span className="text-sm text-neutral-500">
                            Match {row.score}
                          </span>
                        )}
                      </div>
                      {row.opportunity.deadline && (
                        <div className="mt-1.5">
                          <AddToCalendarButton
                            title={row.opportunity.title}
                            deadline={row.opportunity.deadline}
                            opportunityId={row.opportunity.id}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${STATUS_META[row.status].dot}`}
                        aria-hidden="true"
                      />
                      <select
                        value={row.status}
                        disabled={pending[row.savedId]}
                        onChange={(event) =>
                          updateStatus(row.savedId, event.target.value)
                        }
                        className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-900"
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_META[status].label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
