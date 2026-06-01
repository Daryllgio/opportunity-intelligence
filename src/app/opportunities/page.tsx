"use client";

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppNav } from "@/components/layout/app-nav";
import { PageWrapper, PageHeader } from "@/components/layout/page-wrapper";
import { OpportunityCard } from "@/components/ui/opportunity-card";
import { Pagination } from "@/components/ui/pagination";
import {
  FilterSidebar,
  OPPORTUNITY_TYPES,
  EDUCATION_LEVELS,
} from "@/components/opportunities/filter-sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 20;

type Opportunity = {
  id: string;
  title: string;
  provider: string | null;
  type: string;
  deadline: string | null;
  application_status: string | null;
  funding_amount: string | null;
  country: string | null;
  effort_level: string | null;
  reward_level: string | null;
  source_category: string | null;
  eligible_education_levels: string[] | null;
};

type ScoreRow = { opportunity_id: string; score: number };

const typeLabel = (value: string) =>
  OPPORTUNITY_TYPES.find((t) => t.value === value)?.label ||
  value.replace(/_/g, " ");
const educationLabel = (value: string) =>
  EDUCATION_LEVELS.find((e) => e.value === value)?.label || value;

function sanitize(value: string) {
  return value.replace(/[%,()]/g, " ").trim();
}

function OpportunitiesBrowse() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramsKey = searchParams.toString();

  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [paidPlan, setPaidPlan] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [rows, setRows] = useState<Opportunity[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
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
        .select("id, subscription_plan")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        if (!active) return;
        setErrorMessage(profileError.message);
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
      const plan = profileData.subscription_plan || "free";
      setPaidPlan(plan === "pro" || plan === "premium");

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("opportunities")
        .select(
          "id, title, provider, type, deadline, application_status, funding_amount, country, effort_level, reward_level, source_category, eligible_education_levels",
          { count: "exact" }
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

      const education = searchParams.get("education");
      if (education) {
        const levels = education.split(",").filter(Boolean);
        if (levels.length) {
          query = query.overlaps("eligible_education_levels", levels);
        }
      }

      const status = searchParams.get("status");
      if (status) query = query.eq("application_status", status);

      const country = searchParams.get("country");
      if (country) {
        const clean = sanitize(country);
        if (clean) query = query.ilike("country", `%${clean}%`);
      }

      const field = searchParams.get("field");
      if (field) {
        const clean = field.replace(/[{}]/g, "").trim();
        if (clean) query = query.contains("eligible_fields", [clean]);
      }

      const deadlineFrom = searchParams.get("deadline_from");
      if (deadlineFrom) query = query.gte("deadline", deadlineFrom);
      const deadlineTo = searchParams.get("deadline_to");
      if (deadlineTo) query = query.lte("deadline", deadlineTo);

      const sort = searchParams.get("sort") || "deadline_asc";
      const ordered =
        sort === "newest"
          ? query.order("created_at", { ascending: false })
          : sort === "reward_high"
            ? query.order("funding_amount", {
                ascending: false,
                nullsFirst: false,
              })
            : sort === "effort_low"
              ? query.order("effort_level", {
                  ascending: true,
                  nullsFirst: false,
                })
              : query.order("deadline", {
                  ascending: true,
                  nullsFirst: false,
                });

      const { data, count, error } = await ordered.range(from, to);

      if (error) {
        if (!active) return;
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      const opportunities = (data || []) as unknown as Opportunity[];
      if (!active) return;
      setRows(opportunities);
      setTotal(count || 0);

      if ((plan === "pro" || plan === "premium") && opportunities.length) {
        const { data: scoreData } = await supabase
          .from("opportunity_competitiveness_scores")
          .select("opportunity_id, score, score_status")
          .eq("user_id", user.id)
          .eq("score_status", "current")
          .in(
            "opportunity_id",
            opportunities.map((o) => o.id)
          );

        if (active) {
          const map: Record<string, number> = {};
          for (const row of (scoreData || []) as unknown as ScoreRow[]) {
            map[row.opportunity_id] = row.score;
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
  }, [paramsKey, page]);

  // ─── Active filter pills ───
  const activeTypes = (searchParams.get("type") || "").split(",").filter(Boolean);
  const activeEducation = (searchParams.get("education") || "")
    .split(",")
    .filter(Boolean);
  const activeStatus = searchParams.get("status") || "";
  const activeCountry = searchParams.get("country") || "";
  const activeField = searchParams.get("field") || "";
  const activeDeadline =
    searchParams.get("deadline_from") || searchParams.get("deadline_to")
      ? true
      : false;
  const activeQuery = searchParams.get("q") || "";

  const activeFilterCount =
    activeTypes.length +
    activeEducation.length +
    (activeStatus ? 1 : 0) +
    (activeCountry ? 1 : 0) +
    (activeField ? 1 : 0) +
    (activeDeadline ? 1 : 0);

  const hasAnyFilter = activeFilterCount > 0 || Boolean(activeQuery);

  const removeCsv = (key: string, value: string) =>
    updateParams((params) => {
      const set = new Set(
        (params.get(key) || "").split(",").filter(Boolean)
      );
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

  const Pill = ({
    label,
    onRemove,
  }: {
    label: string;
    onRemove: () => void;
  }) => (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
    >
      {label}
      <span aria-hidden="true">✕</span>
    </button>
  );

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <PageWrapper>
      <PageHeader
        title="Opportunities"
        description="Discover scholarships, research programs, fellowships, grants, competitions, and more — filtered to fit you."
      />

      {!loading && !isLoggedIn && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                Log in to view opportunities
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a profile to save opportunities and access personalized
                tools.
              </p>
            </div>
            <Button asChild>
              <Link href="/login">Log in</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && isLoggedIn && !hasProfile && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                Complete your profile first
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                OppScore needs your academic profile to personalize your
                opportunity list.
              </p>
            </div>
            <Button asChild>
              <Link href="/profile/edit">Build profile</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {(isLoggedIn && hasProfile) || loading ? (
        <div className="grid gap-8 md:grid-cols-[18rem_1fr]">
          {/* Desktop sidebar */}
          <aside className="hidden md:block">
            <div className="sticky top-20 rounded-xl border border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900">
              <FilterSidebar />
            </div>
          </aside>

          {/* Results column */}
          <div>
            {/* Search bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search opportunities..."
                  className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 pr-9 text-sm dark:border-neutral-700 dark:bg-neutral-900"
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
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-4 text-sm font-medium md:hidden dark:border-neutral-700"
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
                {activeEducation.map((value) => (
                  <Pill
                    key={`edu-${value}`}
                    label={educationLabel(value)}
                    onRemove={() => removeCsv("education", value)}
                  />
                ))}
                {activeStatus && (
                  <Pill
                    label={
                      activeStatus.charAt(0).toUpperCase() +
                      activeStatus.slice(1)
                    }
                    onRemove={() => clearKey("status")}
                  />
                )}
                {activeCountry && (
                  <Pill
                    label={activeCountry}
                    onRemove={() => clearKey("country")}
                  />
                )}
                {activeField && (
                  <Pill
                    label={activeField}
                    onRemove={() => clearKey("field")}
                  />
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
                  className="text-sm text-neutral-500 hover:text-neutral-700"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Result count */}
            {!loading && !errorMessage && (
              <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
                {total === 0
                  ? "No opportunities found"
                  : `Showing ${rangeStart}–${rangeEnd} of ${total} opportunit${
                      total === 1 ? "y" : "ies"
                    }`}
              </p>
            )}

            {errorMessage && (
              <p className="mt-4 text-sm text-destructive">{errorMessage}</p>
            )}

            {/* Grid */}
            {loading ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-40 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800"
                  />
                ))}
              </div>
            ) : rows.length === 0 && !errorMessage ? (
              <Card className="mt-4">
                <CardContent className="p-8 text-center">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    No opportunities found matching your filters.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try broadening your search or clearing some filters.
                  </p>
                  {hasAnyFilter && (
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={clearAll}
                    >
                      Clear all filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((opportunity) => (
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
                    effortLevel={opportunity.effort_level}
                    rewardLevel={opportunity.reward_level}
                    sourceCategory={opportunity.source_category}
                    eligibleEducationLevels={
                      opportunity.eligible_education_levels
                    }
                    score={paidPlan ? scores[opportunity.id] ?? null : null}
                  />
                ))}
              </div>
            )}

            {!loading && !errorMessage && (
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
            )}
          </div>
        </div>
      ) : null}

      {/* Mobile filter drawer */}
      {showFilters && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowFilters(false)}
          />
          <div className="absolute bottom-0 left-0 top-0 w-80 overflow-y-auto bg-white p-6 dark:bg-neutral-900">
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
    </PageWrapper>
  );
}

export default function OpportunitiesPage() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      <AppNav />
      <Suspense
        fallback={
          <PageWrapper>
            <p className="text-muted-foreground">Loading opportunities…</p>
          </PageWrapper>
        }
      >
        <OpportunitiesBrowse />
      </Suspense>
    </div>
  );
}
