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
import { AiSearch } from "@/components/opportunities/ai-search";
import { ScoreRefreshTrigger } from "@/components/opportunities/score-refresh-trigger";
import { shortBlockerLabel } from "@/lib/matching/eligibility";
import { tier1Eligibility } from "@/lib/matching/tier1";
import { profileScoringGate } from "@/lib/scoring/profile-gate";
import { supabase } from "@/lib/supabase";
import { getPlanLimitsForProfile } from "@/lib/billing/subscription";

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
  effort_level?: string | null;
  reward_level?: string | null;
  eligibility_criteria?: unknown;
};

const typeLabel = (value: string) =>
  OPPORTUNITY_TYPES.find((t) => t.value === value)?.label ||
  value.replace(/_/g, " ");

function sanitize(value: string) {
  return value.replace(/[%,()]/g, " ").trim();
}

function OpportunitiesBrowse() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramsKey = searchParams.toString();
  const [reloadNonce, setReloadNonce] = useState(0);

  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [hasRanking, setHasRanking] = useState(false);
  const [profileRow, setProfileRow] = useState<Record<string, unknown> | null>(null);
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
        .select("*")
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
      setProfileRow(profileData as Record<string, unknown>);

      const planLimits = getPlanLimitsForProfile(profileData as Record<string, unknown>);
      setHasRanking(planLimits.hasCompetitivenessRanking);

      let query = supabase
        .from("opportunities")
        // select * so newly migrated columns (eligibility_criteria) flow in
        // without breaking before the migration lands.
        .select("*")
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

      // Eligibility filtering happens CLIENT-SIDE with the two-tier system
      // (tier1Eligibility below + the cached AI resolver). The old SQL
      // exact-containment filter (cs.{undergraduate}) silently hid rows
      // whose free-text levels said 'bachelors', 'post-secondary',
      // 'college', or 'undergraduate (second year or higher)'.

      // Never show rows whose applications aren't open: closed cycles and
      // not-yet-open opportunities are tracked internally, not browsable.
      query = query.or(
        "application_status.is.null,application_status.in.(open,rolling,unknown)"
      );

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
  }, [paramsKey, reloadNonce]);

  // ─── Two-tier eligibility against the viewer's profile ───
  // Tier 1 (deterministic rules) runs instantly in the browser. Rows it
  // positively rules out are NEVER shown — that's the product promise.
  // Genuinely uncertain rows are resolved by the cached Tier-2 endpoint in
  // the background; anything it confirms ineligible disappears too.
  const tier1Results = useMemo(() => {
    const map = new Map<string, ReturnType<typeof tier1Eligibility>>();
    if (!profileRow) return map;
    for (const row of rows) {
      map.set(
        row.id,
        tier1Eligibility({
          profile: profileRow,
          opportunity: row as unknown as Record<string, unknown>,
        })
      );
    }
    return map;
  }, [rows, profileRow]);

  const [aiDecisions, setAiDecisions] = useState<
    Record<string, { decision: string; reason: string | null }>
  >({});

  useEffect(() => {
    let active = true;
    async function resolveUncertain() {
      if (!profileRow) return;
      const uncertainIds = rows
        .filter((row) => {
          const tier1 = tier1Results.get(row.id);
          return (
            tier1 &&
            tier1.decision === "uncertain" &&
            tier1.uncertainChecks.length > 0 &&
            aiDecisions[row.id] === undefined
          );
        })
        .map((row) => row.id)
        .slice(0, 100);
      if (uncertainIds.length === 0) return;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      try {
        const response = await fetch("/api/eligibility/resolve", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ opportunityIds: uncertainIds }),
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (active && payload.decisions) {
          setAiDecisions((current) => ({ ...current, ...payload.decisions }));
        }
      } catch {
        // Network failure: rows simply stay visible (fail open).
      }
    }
    resolveUncertain();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tier1Results, profileRow]);

  const eligibilityFlags = useMemo(() => {
    const flags = new Map<string, string>();
    for (const row of rows) {
      const tier1 = tier1Results.get(row.id);
      if (tier1?.decision === "ineligible" && tier1.blockers[0]) {
        flags.set(row.id, shortBlockerLabel(tier1.blockers[0]));
      }
    }
    return flags;
  }, [rows, tier1Results]);

  const sortMode = searchParams.get("sort") || "match";
  const hideUnverified = searchParams.get("eligible") === "only";

  // ─── Sort: best match (scored first), newest added, or deadline soonest ───
  const { scored, unscored } = useMemo(() => {
    // Confirmed ineligible (rules or AI) is always hidden.
    let visible = rows.filter((row) => {
      const tier1 = tier1Results.get(row.id);
      if (tier1?.decision === "ineligible") return false;
      if (aiDecisions[row.id]?.decision === "ineligible") return false;
      return true;
    });
    // The toggle additionally hides rows with unresolved strict requirements.
    if (hideUnverified) {
      visible = visible.filter((row) => {
        const tier1 = tier1Results.get(row.id);
        if (!tier1) return true;
        if (tier1.decision === "eligible") return true;
        return (
          tier1.uncertainChecks.length === 0 ||
          aiDecisions[row.id]?.decision === "eligible"
        );
      });
    }

    if (sortMode === "newest") {
      const sorted = [...visible].sort((a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || ""))
      );
      return { scored: sorted, unscored: [] as Opportunity[] };
    }
    if (sortMode === "deadline") {
      // Fetch order is already deadline-ascending with nulls last.
      return { scored: [...visible], unscored: [] as Opportunity[] };
    }

    const scoredRows: Opportunity[] = [];
    const unscoredRows: Opportunity[] = [];
    for (const row of visible) {
      if (scores[row.id] !== undefined) scoredRows.push(row);
      else unscoredRows.push(row);
    }
    scoredRows.sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
    // Unscored stay deadline-ascending (the fetch order).
    return { scored: scoredRows, unscored: unscoredRows };
  }, [rows, scores, sortMode, hideUnverified, tier1Results, aiDecisions]);

  const combined = useMemo(() => [...scored, ...unscored], [scored, unscored]);
  const totalPages = Math.max(1, Math.ceil(combined.length / PAGE_SIZE));
  const pageRows = combined.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // The scored/unscored section split only exists in match order; other sorts
  // render one flat grid.
  const scoredOnPage =
    sortMode === "match"
      ? pageRows.filter((r) => scores[r.id] !== undefined)
      : pageRows;
  const unscoredOnPage =
    sortMode === "match"
      ? pageRows.filter((r) => scores[r.id] === undefined)
      : [];

  const activeTypes = (searchParams.get("type") || "").split(",").filter(Boolean);
  const activeCountry = searchParams.get("country") || "";
  const activeDeadline = Boolean(
    searchParams.get("deadline_from") || searchParams.get("deadline_to")
  );
  const activeQuery = searchParams.get("q") || "";
  const activeFilterCount =
    activeTypes.length + (activeCountry ? 1 : 0) + (activeDeadline ? 1 : 0);
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
      <ScoreRefreshTrigger
        onScoresRefreshed={() => setReloadNonce((nonce) => nonce + 1)}
      />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
        <p className="mt-1 text-[15px] text-neutral-600 dark:text-neutral-400">
          {hasRanking
            ? "Sorted by your match strength, best options first."
            : "Currently open opportunities from verified sources."}
        </p>
      </div>

      {isLoggedIn && hasProfile && (
        <AiSearch
          hasAiSearch={getPlanLimitsForProfile(profileRow).hasAiSearch}
        />
      )}

      {isLoggedIn && hasProfile && profileRow && (() => {
        const gate = profileScoringGate(profileRow);
        if (!gate.complete) {
          return (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
              <p className="text-sm text-neutral-800 dark:text-neutral-200">
                Complete your profile to unlock match scores. Still needed:{" "}
                <span className="font-medium">{gate.missing.join(", ")}</span>.
              </p>
              <Link
                href="/profile/edit"
                className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Finish profile
              </Link>
            </div>
          );
        }
        if (gate.experienceNudge) {
          return (
            <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
              Tip: adding experiences to your{" "}
              <Link href="/profile/edit" className="underline underline-offset-2">
                profile
              </Link>{" "}
              makes your scores more accurate.
            </p>
          );
        }
        return null;
      })()}

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
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[15rem_1fr]">
          {/* Desktop sidebar. no box, just a rail */}
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
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                  New opportunities are discovered daily. Try broadening your
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
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {combined.length} open opportunit{combined.length === 1 ? "y" : "ies"}
                      {sortMode === "match" &&
                        scored.length > 0 &&
                        ` · ${scored.length} scored for you`}
                    </p>
                    <div className="flex items-center gap-4">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                        <input
                          type="checkbox"
                          checked={hideUnverified}
                          onChange={(event) =>
                            updateParams((params) => {
                              if (event.target.checked) params.set("eligible", "only");
                              else params.delete("eligible");
                              params.delete("page");
                            })
                          }
                          className="h-3.5 w-3.5 rounded border-neutral-300 accent-[var(--primary)]"
                        />
                        Only ones I can definitely apply to
                      </label>
                      <select
                        value={sortMode}
                        onChange={(event) =>
                          updateParams((params) => {
                            if (event.target.value === "match") params.delete("sort");
                            else params.set("sort", event.target.value);
                            params.delete("page");
                          })
                        }
                        className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
                        aria-label="Sort opportunities"
                      >
                        <option value="match">Best match</option>
                        <option value="newest">Newest added</option>
                        <option value="deadline">Deadline soonest</option>
                      </select>
                    </div>
                  </div>
                )}

                {scoredOnPage.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                        effortLevel={opportunity.effort_level}
                        rewardLevel={opportunity.reward_level}
                        score={scores[opportunity.id]}
                        eligibilityFlag={eligibilityFlags.get(opportunity.id)}
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
                            ? "Outside your scored categories. Open any of them to run an individual report."
                            : "Upgrade to see match scores for these."}
                        </p>
                      </div>
                    )}
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                          effortLevel={opportunity.effort_level}
                          rewardLevel={opportunity.reward_level}
                          unscored={hasRanking && sortMode === "match"}
                          score={sortMode === "match" ? undefined : scores[opportunity.id]}
                          eligibilityFlag={eligibilityFlags.get(opportunity.id)}
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
