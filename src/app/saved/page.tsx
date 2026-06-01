"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

type Opportunity = {
  id: string;
  title: string;
  provider: string | null;
  type: string;
  description: string | null;
  ai_summary: string | null;
  country: string | null;
  eligible_countries: string[] | null;
  eligible_education_levels: string[] | null;
  eligible_fields: string[] | null;
  funding_amount: string | null;
  funding_type: string | null;
  deadline: string | null;
  effort_level: string | null;
  reward_level: string | null;
  application_url: string | null;
  competitiveness_factors: string[] | null;
  lifecycle_status: string | null;
};

type SavedOpportunity = {
  id: string;
  created_at: string;
  opportunity_id: string;
  status: string | null;
  opportunities: Opportunity | null;
};

type ScoredSavedOpportunity = {
  savedId: string;
  status: string;
  opportunity: Opportunity;
  score: { score: number | null; recommendation: string };
};

// Status workflow values, labels, and badge colors.
const STATUS_META: Record<
  string,
  { label: string; badge: string }
> = {
  saved: { label: "Saved", badge: "bg-neutral-100 text-neutral-600" },
  planning: { label: "Planning", badge: "bg-blue-50 text-blue-700" },
  applying: { label: "Applying", badge: "bg-amber-50 text-amber-700" },
  submitted: { label: "Submitted", badge: "bg-indigo-50 text-indigo-700" },
  won: { label: "Won", badge: "bg-green-50 text-green-700" },
  rejected: { label: "Rejected", badge: "bg-red-50 text-red-700" },
  not_applying: {
    label: "Not applying",
    badge: "bg-neutral-100 text-neutral-500",
  },
};

const STATUS_OPTIONS = [
  "saved",
  "planning",
  "applying",
  "submitted",
  "won",
  "rejected",
  "not_applying",
];

// Tabs shown in the filter bar (not_applying is reachable via the dropdown).
const TABS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "saved", label: "Saved" },
  { key: "planning", label: "Planning" },
  { key: "applying", label: "Applying" },
  { key: "submitted", label: "Submitted" },
  { key: "won", label: "Won" },
  { key: "rejected", label: "Rejected" },
];

function normalizeStatus(status: string | null): string {
  return status && STATUS_META[status] ? status : "saved";
}

function formatOpportunityType(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatRecommendation(recommendation: string) {
  if (recommendation === "apply_now") return "Apply Now";
  if (recommendation === "save_for_later") return "Save for Later";
  return "Improve First";
}

function getCardSummary(opportunity: Opportunity) {
  if (opportunity.ai_summary) return opportunity.ai_summary;

  if (!opportunity.description) return "No summary available yet.";

  return opportunity.description.length > 180
    ? `${opportunity.description.slice(0, 180)}...`
    : opportunity.description;
}

function daysUntil(deadline: string | null) {
  if (!deadline) return null;
  const due = new Date(deadline);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// Deadline urgency pill: red <7 days, amber 7-14, green 30+, gray closed/none.
function DeadlineUrgency({ deadline }: { deadline: string | null }) {
  const days = daysUntil(deadline);

  if (days === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800">
        No deadline
      </span>
    );
  }

  if (days < 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800">
        Closed
      </span>
    );
  }

  const cls =
    days < 7
      ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
      : days <= 14
        ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        : "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300";

  const label =
    days === 0
      ? "Due today"
      : days === 1
        ? "Due in 1 day"
        : `Due in ${days} days`;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

export default function SavedPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [saved, setSaved] = useState<ScoredSavedOpportunity[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  // Initialize the active tab from ?status= (SSR-safe: defaults to "all").
  const [activeStatus, setActiveStatus] = useState(() => {
    if (typeof window === "undefined") return "all";
    const param = new URLSearchParams(window.location.search).get("status");
    return param && (param === "all" || STATUS_META[param]) ? param : "all";
  });
  const [pending, setPending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadSaved() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from("saved_opportunities")
        .select(
          `
          id,
          created_at,
          opportunity_id,
          status,
          opportunities (
            id,
            title,
            provider,
            type,
            description,
            ai_summary,
            country,
            eligible_countries,
            eligible_education_levels,
            eligible_fields,
            deadline,
            funding_amount,
            funding_type,
            effort_level,
            reward_level,
            application_url,
            competitiveness_factors,
            lifecycle_status
          )
        `
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      // Read scores from the single source of truth (server-computed scores).
      const { data: scoreRows } = await supabase
        .from("opportunity_competitiveness_scores")
        .select("opportunity_id, score, fit_label, score_status")
        .eq("user_id", user.id)
        .eq("score_status", "current");

      const scoreMap = new Map<
        string,
        { score: number | null; fit_label: string | null }
      >();
      for (const row of (scoreRows as Array<{
        opportunity_id: string;
        score: number | null;
        fit_label: string | null;
      }>) || []) {
        scoreMap.set(row.opportunity_id, {
          score: typeof row.score === "number" ? row.score : null,
          fit_label: row.fit_label ?? null,
        });
      }

      if (!error) {
        const normalizedSaved = ((data ?? []) as unknown as Array<
          Record<string, unknown>
        >).map((item) => ({
          ...item,
          opportunities: Array.isArray(item.opportunities)
            ? item.opportunities[0] || null
            : item.opportunities,
        })) as unknown as SavedOpportunity[];

        const scored = normalizedSaved
          .filter(
            (item) =>
              item.opportunities &&
              item.opportunities.lifecycle_status === "active"
          )
          .map((item) => {
            const opportunity = item.opportunities as Opportunity;
            const entry = scoreMap.get(opportunity.id);

            return {
              savedId: item.id,
              status: normalizeStatus(item.status),
              opportunity,
              score: {
                score: entry?.score ?? null,
                recommendation: entry?.fit_label ?? "",
              },
            };
          });

        setSaved(scored);
      }

      setLoading(false);
    }

    loadSaved();
  }, []);

  function selectTab(key: string) {
    setActiveStatus(key);
    const url = new URL(window.location.href);
    if (key === "all") {
      url.searchParams.delete("status");
    } else {
      url.searchParams.set("status", key);
    }
    window.history.replaceState(null, "", url.toString());
  }

  // Optimistic status update: change UI immediately, revert if the DB fails.
  async function updateStatus(savedId: string, newStatus: string) {
    if (!userId) return;
    const prev = saved.find((s) => s.savedId === savedId)?.status ?? "saved";
    setSaved((rows) =>
      rows.map((r) =>
        r.savedId === savedId ? { ...r, status: newStatus } : r
      )
    );
    setPending((p) => ({ ...p, [savedId]: true }));

    const { error } = await supabase
      .from("saved_opportunities")
      .update({ status: newStatus })
      .eq("id", savedId)
      .eq("user_id", userId);

    if (error) {
      // Revert on failure.
      setSaved((rows) =>
        rows.map((r) =>
          r.savedId === savedId ? { ...r, status: prev } : r
        )
      );
    }

    setPending((p) => ({ ...p, [savedId]: false }));
  }

  const opportunityTypes = useMemo(() => {
    const types = new Set(saved.map((item) => item.opportunity.type));
    return Array.from(types);
  }, [saved]);

  // Counts per status tab.
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: saved.length };
    for (const tab of TABS) {
      if (tab.key === "all") continue;
      c[tab.key] = saved.filter((s) => s.status === tab.key).length;
    }
    return c;
  }, [saved]);

  const filteredSaved = saved.filter(({ opportunity, status }) => {
    const query = search.toLowerCase();

    const matchesSearch =
      opportunity.title.toLowerCase().includes(query) ||
      opportunity.provider?.toLowerCase().includes(query) ||
      opportunity.description?.toLowerCase().includes(query) ||
      opportunity.ai_summary?.toLowerCase().includes(query);

    const matchesType = typeFilter === "all" || opportunity.type === typeFilter;
    const matchesStatus = activeStatus === "all" || status === activeStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <Badge variant="secondary">Saved</Badge>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Saved opportunities
          </h1>

          <p className="mt-3 max-w-2xl text-muted-foreground">
            Track the opportunities you saved and where you are in the
            application process.
          </p>

          {loading ? (
            <Card className="mt-8">
              <CardContent className="p-6">
                <p className="text-muted-foreground">
                  Loading saved opportunities...
                </p>
              </CardContent>
            </Card>
          ) : saved.length === 0 ? (
            <Card className="mt-8 border-dashed">
              <CardContent className="flex flex-col gap-4 p-8 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    No saved opportunities yet
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Browse opportunities to find ones that match your profile,
                    then save them to track your applications here.
                  </p>
                </div>

                <Button asChild>
                  <Link href="/opportunities">Browse opportunities</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Status tabs */}
              <div className="mt-8 flex flex-wrap gap-2 border-b pb-3">
                {TABS.map((tab) => {
                  const active = tab.key === activeStatus;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => selectTab(tab.key)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                        active
                          ? "bg-indigo-600 text-white"
                          : "bg-background text-muted-foreground ring-1 ring-inset ring-border hover:bg-muted"
                      }`}
                    >
                      {tab.label}
                      <span
                        className={`ml-1.5 ${
                          active ? "text-indigo-100" : "text-neutral-400"
                        }`}
                      >
                        {counts[tab.key] ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-[1fr_260px]">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search saved opportunities..."
                />

                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All opportunity types</option>
                  {opportunityTypes.map((type) => (
                    <option key={type} value={type}>
                      {formatOpportunityType(type)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-6 grid gap-3">
                {filteredSaved.length === 0 ? (
                  <Card>
                    <CardContent className="p-6">
                      <p className="text-muted-foreground">
                        No saved opportunities match your current filters.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredSaved.map(({ savedId, status, opportunity, score }) => (
                    <Card key={savedId}>
                      <CardContent className="p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">
                                {formatOpportunityType(opportunity.type)}
                              </Badge>

                              <DeadlineUrgency deadline={opportunity.deadline} />

                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_META[status].badge}`}
                              >
                                {STATUS_META[status].label}
                              </span>
                            </div>

                            <Link
                              href={`/opportunities/${opportunity.id}`}
                              className="mt-3 block text-lg font-semibold hover:text-indigo-600"
                            >
                              {opportunity.title}
                            </Link>

                            <p className="mt-1 text-sm text-muted-foreground">
                              {opportunity.provider || "Provider not specified"}
                              {opportunity.funding_amount &&
                                ` · ${opportunity.funding_amount}`}
                              {opportunity.reward_level &&
                                ` · ${opportunity.reward_level} reward`}
                            </p>

                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                              {getCardSummary(opportunity)}
                            </p>
                          </div>

                          <div className="flex flex-col gap-3 lg:w-[240px]">
                            <div className="rounded-xl border px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm text-muted-foreground">
                                  Score
                                </p>
                                <p className="text-lg font-semibold">
                                  {score.score !== null
                                    ? `${score.score}/100`
                                    : "—"}
                                </p>
                              </div>

                              <p className="mt-1 text-sm text-muted-foreground">
                                {score.score !== null
                                  ? formatRecommendation(score.recommendation)
                                  : "Not scored yet"}
                              </p>
                            </div>

                            <div>
                              <label className="block text-xs uppercase tracking-wide text-neutral-400">
                                Status
                              </label>
                              <select
                                value={status}
                                disabled={pending[savedId]}
                                onChange={(e) =>
                                  updateStatus(savedId, e.target.value)
                                }
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                              >
                                {STATUS_OPTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {STATUS_META[s].label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <Button asChild variant="outline">
                              <Link href={`/opportunities/${opportunity.id}`}>
                                Details
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
