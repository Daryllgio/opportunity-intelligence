"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppNav } from "@/components/layout/app-nav";
import { OpportunityCard } from "@/components/ui/opportunity-card";
import {
  FilterSidebar,
  OPPORTUNITY_TYPES,
} from "@/components/opportunities/filter-sidebar";
import { supabase } from "@/lib/supabase";
import { getPlanLimits } from "@/lib/billing/plans";

const PAGE_SIZE = 24;
const FETCH_CAP = 600;

type Opportunity = {
  id: string;
  title: string;
  provider: string | null;
  type: string;
  deadline: string | null;
  application_status: string | null;
  funding_amount: string | null;
  country: string | null;
  created_at: string | null;
  eligible_education_levels: string[] | null;
};

const typeLabel = (value: string) =>
  OPPORTUNITY_TYPES.find((t) => t.value === value)?.label ||
  value.replace(/_/g, " ");

function sanitize(value: string) {
  return value.replace(/[%,()]/g, " ").trim();
}

function normalizeEducationLevel(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z_]/g, "");
}

function OpportunitiesBrowse() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramsKey = searchParams.toString();

  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [scoredCategories, setScoredCategories] = useState<string[]>([]);
  const [hasRanking, setHasRanking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [rows, setRows] = useState<Opportunity[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [showFilters, setShowFilters] = useState(false);

  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const updateParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Debounced search → URL `q`
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const current = searchParams.get("q") || "";
      if (searchInput !== current) {
        updateParams((params) => {
          if (searchInput.trim()) params.set("q", searchInput.trim());
          else params.delete("q");
          params.delete("page");
        });
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!active) return;
        setIsLoggedIn(false);
        setLoading(false);
        return;
      }
      if (!active) return;
      setIsLoggedIn(true);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, subscription_plan, education_level, target_opportunity_types")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        if (!active) return;
        setErrorMessage("Could not load your profile. Please refresh.");
        setLoading(false);
        return;
      }
      if (!profileData) {
        if (!active) return;
        setHasProfile(false);
        setLoading(false);
        return;
      }
      if (!active) return;
      setHasProfile(true);

      const planLimits = getPlanLimits(profileData.subscription_plan);
      setHasRanking(planLimits.hasCompetitivenessRanking);

      let query = supabase
        .from("opportunities")
        .select(
          "id, title, provider, type, deadline, application_status, funding_amount, country, created_at, eligible_education_levels"
        )
        .eq("is_active", true)
        .eq("is_approved", true)
        .eq("lifecycle_status", "active");

      const q = searchParams.get("q");
      if (q) {
        const clean = sanitize(q);
        if (clean) {
          query = query.or(
            `title.ilike.%${clean}%,provider.ilike.%${clean}%,description.ilike.%${clean}%`
          );
        }
      }

      const type = searchParams.get("type");
      if (type) query = query.in("type", type.split(",").filter(Boolean));

      // Education level comes from the profile, not a filter control. Rows
      // with no recorded eligibility stay visible.
      const level = normalizeEducationLevel(
        String(profileData.education_level || "")
      );
      if (level) {
        query = query.or(
          `eligible_education_levels.is.null,eligible_education_levels.eq.{},eligible_education_levels.cs.{${level}}`
        );
      }

      const status = searchParams.get("status");
      if (status) query = query.eq("application_status", status);

      const country = searchParams.get("country");
      if (country) {
        const clean = sanitize(country);
        if (clean) query = query.ilike("country", `%${clean}%`);
      }

      const deadlineFrom = searchParams.get("deadline_from");
      if (deadlineFrom) query = query.gte("deadline", deadlineFrom);
      const deadlineTo = searchParams.get("deadline_to");
      if (deadlineTo) query = query.lte("deadline", deadlineTo);

      // Only currently-open content: future deadline or rolling.
      const today = new Date().toISOString().slice(0, 10);
      query = query.or(
        `deadline.gte.${today},and(deadline.is.null,application_status.eq.rolling)`
      );

      const { data, error } = await query
        .order("deadline", { ascending: true, nullsFirst: false })
        .limit(FETCH_CAP);

      if (error) {
        if (!active) return;
        setErrorMessage("Could not load opportunities. Please refresh.");
        setLoading(false);
        return;
      }

      const opportunities = (data || []) as unknown as Opportunity[];
      if (!active) return;
      setRows(opportunities);

      if (planLimits.hasCompetitivenessRanking && opportunities.length) {
        const { data: scoreData } = await supabase
          .from("opportunity_competitiveness_scores")
          .select("opportunity_id, score, score_status")
          .eq("user_id", user.id)
          .eq("score_status", "current");

        if (active) {
          const map: Record<string, number> = {};
          for (const row of scoreData || []) {
            if (typeof row.score === "number") {
              map[row.opportunity_id] = row.score;
            }
          }
          setScores(map);
        }
      } else if (active) {
        setScores({});
      }

      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  // ─── Sort: scored (best first), then unscored ───
  const { scored, unscored } = useMemo(() => {
    const scoredRows: Opportunity[] = [];
    const unscoredRows: Opportunity[] = [];
    for (const row of rows) {
      if (scores[row.id] !== undefined) scoredRows.push(row);
      else unscoredRows.push(row);
    }
    scoredRows.sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
    // Unscored stay deadline-ascending (the fetch order).
    return { scored: scoredRows, unscored: unscoredRows };
  }, [rows, scores]);

  const combined = useMemo(() => [...scored, ...unscored], [scored, unscored]);
  const totalPages = Math.max(1, Math.ceil(combined.length / PAGE_SIZE));
  const pageRows = combined.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const scoredOnPage = pageRows.filter((r) => scores[r.id] !== undefined);
  const unscoredOnPage = pageRows.filter((r) => scores[r.id] === undefined);

  const activeTypes = (searchParams.get("type") || "").split(",").filter(Boolean);
  const activeStatus = searchParams.get("status") || "";
  const activeCountry = searchParams.get("country") || "";
  const activeDeadline = Boolean(
    searchParams.get("deadline_from") || searchParams.get("deadline_to")
  );
  const activeQuery = searchParams.get("q") || "";
  const activeFilterCount =
    activeTypes.length +
    (activeStatus ? 1 : 0) +
    (activeCountry ? 1 : 0) +
    (activeDeadline ? 1 : 0);
  const hasAnyFilter = activeFilterCount > 0 || Boolean(activeQuery);

  const removeCsv = (key: string, value: string) =>
    updateParams((params) => {
      const set = new Set((params.get(key) || "").split(",").filter(Boolean));
      set.delete(value);
      if (set.size) params.set(key, Array.from(set).join(","));
      else params.delete(key);
      params.delete("page");
    });

  const clearKey = (...keys: string[]) =>
    updateParams((params) => {
      keys.forEach((key) => params.delete(key));
      params.delete("page");
    });

  const clearAll = () => {
    setSearchInput("");
    router.replace(pathname, { scroll: false });
  };

  const goToPage = (target: number) =>
    updateParams((params) => {
      if (target <= 1) params.delete("page");
      else params.set("page", String(target));
    });

  const Pill = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
    >
      {label}
      <span className="text-neutral-400" aria-hidden="true">
        ✕
      </span>
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
        <p className="mt-1 text-[15px] text-neutral-500 dark:text-neutral-400">
          {hasRanking
            ? "Sorted by your match strength — your best options are at the top."
            : "Currently open opportunities from verified sources."}
        </p>
      </div>

      {!loading && !isLoggedIn && (
        <div className="rounded-lg border border-neutral-200 p-8 text-center dark:border-neutral-800">
          <h2 className="text-lg font-semibold">Sign in to browse opportunities</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
            Create a free account to browse verified opportunities matched to
            your education level and field.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Create account
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}

      {!loading && isLoggedIn && !hasProfile && (
        <div className="rounded-lg border border-neutral-200 p-8 text-center dark:border-neutral-800">
          <h2 className="text-lg font-semibold">Set up your profile first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
            OppScore filters and scores opportunities using your education
            level, field, and background.
          </p>
          <Link
            href="/onboarding"
            className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Set up profile
          </Link>
        </div>
      )}

      {(isLoggedIn && hasProfile) || loading ? (
        <div className="grid gap-10 lg:grid-cols-[15rem_1fr]">
          {/* Desktop sidebar — no box, just a rail */}
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <FilterSidebar />
            </div>
          </aside>

          <div>
            {/* Search + mobile filters */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search by name or provider…"
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 pr-9 text-sm placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowFilters(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 text-sm font-medium lg:hidden dark:border-neutral-800"
              >
                Filters
                {activeFilterCount > 0 && ` (${activeFilterCount})`}
              </button>
            </div>

            {/* Active filter pills */}
            {hasAnyFilter && (
              <div className="mt-4 flex flex-wrap gap-2">
                {activeQuery && (
                  <Pill
                    label={`"${activeQuery}"`}
                    onRemove={() => {
                      setSearchInput("");
                      clearKey("q");
                    }}
                  />
                )}
                {activeTypes.map((value) => (
                  <Pill
                    key={`type-${value}`}
                    label={typeLabel(value)}
                    onRemove={() => removeCsv("type", value)}
                  />
                ))}
                {activeStatus && (
                  <Pill
                    label={activeStatus.charAt(0).toUpperCase() + activeStatus.slice(1)}
                    onRemove={() => clearKey("status")}
                  />
                )}
                {activeCountry && (
                  <Pill label={activeCountry} onRemove={() => clearKey("country")} />
                )}
                {activeDeadline && (
                  <Pill
                    label="Deadline range"
                    onRemove={() => clearKey("deadline_from", "deadline_to")}
                  />
                )}
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-sm text-neutral-400 hover:text-neutral-600"
                >
                  Clear all
                </button>
              </div>
            )}

            {errorMessage && (
              <p className="mt-6 text-sm text-red-600">{errorMessage}</p>
            )}

            {loading ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-44 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900"
                  />
                ))}
              </div>
            ) : combined.length === 0 && !errorMessage ? (
              <div className="mt-6 rounded-lg border border-dashed border-neutral-200 p-10 text-center dark:border-neutral-800">
                <p className="font-medium">Nothing matches these filters</p>
                <p className="mt-1 text-sm text-neutral-500">
                  New opportunities are discovered daily — try broadening your
                  filters or check back soon.
                </p>
                {hasAnyFilter && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="mt-4 text-sm font-medium underline underline-offset-2"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <>
                {!loading && (
                  <p className="mt-4 text-sm text-neutral-400">
                    {combined.length} open opportunit{combined.length === 1 ? "y" : "ies"}
                    {scored.length > 0 && ` · ${scored.length} scored for you`}
                  </p>
                )}

                {scoredOnPage.length > 0 && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {scoredOnPage.map((opportunity) => (
                      <OpportunityCard
                        key={opportunity.id}
                        id={opportunity.id}
                        title={opportunity.title}
                        provider={opportunity.provider}
                        type={opportunity.type}
                        deadline={opportunity.deadline}
                        applicationStatus={opportunity.application_status}
                        fundingAmount={opportunity.funding_amount}
                        country={opportunity.country}
                        createdAt={opportunity.created_at}
                        score={scores[opportunity.id]}
                      />
                    ))}
                  </div>
                )}

                {unscoredOnPage.length > 0 && (
                  <>
                    {scoredOnPage.length > 0 && (
                      <div className="mt-10 border-t border-neutral-100 pt-6 dark:border-neutral-900">
                        <h2 className="text-sm font-medium text-neutral-500">
                          More opportunities
                        </h2>
                        <p className="mt-0.5 text-xs text-neutral-400">
                          {hasRanking
                            ? "Outside your scored categories — open any of them to run an individual report."
                            : "Upgrade to see match scores for these."}
                        </p>
                      </div>
                    )}
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {unscoredOnPage.map((opportunity) => (
                        <OpportunityCard
                          key={opportunity.id}
                          id={opportunity.id}
                          title={opportunity.title}
                          provider={opportunity.provider}
                          type={opportunity.type}
                          deadline={opportunity.deadline}
                          applicationStatus={opportunity.application_status}
                          fundingAmount={opportunity.funding_amount}
                          country={opportunity.country}
                          createdAt={opportunity.created_at}
                          unscored={hasRanking}
                        />
                      ))}
                    </div>
                  </>
                )}

                {totalPages > 1 && (
                  <nav
                    className="mt-10 flex items-center justify-center gap-1"
                    aria-label="Pagination"
                  >
                    <button
                      type="button"
                      onClick={() => goToPage(page - 1)}
                      disabled={page <= 1}
                      className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      Previous
                    </button>
                    <span className="px-3 text-sm text-neutral-400">
                      {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => goToPage(page + 1)}
                      disabled={page >= totalPages}
                      className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      Next
                    </button>
                  </nav>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Mobile filter drawer */}
      {showFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowFilters(false)}
          />
          <div className="absolute bottom-0 left-0 top-0 w-80 overflow-y-auto bg-white p-6 dark:bg-neutral-950">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Filters</h2>
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                aria-label="Close filters"
              >
                ✕
              </button>
            </div>
            <FilterSidebar onApply={() => setShowFilters(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function OpportunitiesPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />
      <Suspense
        fallback={
          <div className="mx-auto max-w-6xl px-6 py-10">
            <p className="text-neutral-400">Loading opportunities…</p>
          </div>
        }
      >
        <OpportunitiesBrowse />
      </Suspense>
    </div>
  );
}
