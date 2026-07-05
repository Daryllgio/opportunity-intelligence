"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { OpportunityCard } from "@/components/ui/opportunity-card";

type AiResult = {
  id: string;
  title: string;
  provider: string | null;
  type: string;
  deadline: string | null;
  application_status: string | null;
  funding_amount: string | null;
  country: string | null;
  created_at: string | null;
  effort_level: string | null;
  reward_level: string | null;
  reason: string;
};

/**
 * Premium natural-language search. Users describe what they want
 * ("research on cancer this summer in California with a stipend") and get
 * ranked picks from the verified catalog, each with a reason. Non-premium
 * users see the input and an upgrade note on submit.
 */
export function AiSearch({ hasAiSearch }: { hasAiSearch: boolean }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [upgradeNeeded, setUpgradeNeeded] = useState(false);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [results, setResults] = useState<AiResult[] | null>(null);
  const [credits, setCredits] = useState<{ used: number; budget: number } | null>(null);

  async function runSearch() {
    const trimmed = query.trim();
    if (trimmed.length < 3 || searching) return;

    if (!hasAiSearch) {
      setUpgradeNeeded(true);
      return;
    }

    setSearching(true);
    setError("");
    setUpgradeNeeded(false);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError("Please sign in again.");
      setSearching(false);
      return;
    }

    try {
      const response = await fetch("/api/ai-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.upgrade) setUpgradeNeeded(true);
        else setError(data.error || "Search failed. Please try again.");
        setSearching(false);
        return;
      }
      setInterpretation(data.interpretation || null);
      setResults(data.results || []);
      if (data.usage) {
        setCredits({ used: data.usage.usedCredits, budget: data.usage.budgetCredits });
      }
    } catch {
      setError("Search failed. Please try again.");
    }
    setSearching(false);
  }

  function clearResults() {
    setResults(null);
    setInterpretation(null);
    setError("");
    setUpgradeNeeded(false);
  }

  return (
    <div className="mb-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          runSearch();
        }}
        className="relative"
      >
        <span
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-primary"
          aria-hidden="true"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path d="M10 1.5l1.9 4.6 4.6 1.9-4.6 1.9L10 14.5l-1.9-4.6-4.6-1.9 4.6-1.9L10 1.5z" />
            <path d="M16.5 12.5l.95 2.3 2.3.95-2.3.95-.95 2.3-.95-2.3-2.3-.95 2.3-.95.95-2.3z" opacity="0.7" />
          </svg>
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder='Describe it: "research on cancer this summer with a stipend above $3,000"'
          className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-28 text-sm text-neutral-900 placeholder:text-neutral-500 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/10 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
          aria-label="AI search"
        />
        <button
          type="submit"
          disabled={searching || query.trim().length < 3}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {searching ? "Searching…" : "AI search"}
        </button>
      </form>

      {upgradeNeeded && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
          <p className="text-sm text-neutral-800 dark:text-neutral-200">
            AI search is a Premium feature: describe anything, get verified
            matches back.
          </p>
          <Link
            href="/pricing"
            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            See Premium
          </Link>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}

      {results !== null && (
        <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                AI picks from the verified catalog
              </p>
              {interpretation && (
                <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
                  Searched for: {interpretation}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {credits && (
                <span className="text-xs text-neutral-500">
                  {credits.budget - credits.used} of {credits.budget} search
                  credits left
                </span>
              )}
              <button
                type="button"
                onClick={clearResults}
                className="text-sm font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                Clear
              </button>
            </div>
          </div>

          {results.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-700 dark:text-neutral-300">
              Nothing in the catalog genuinely fits that request right now. New
              opportunities are verified nightly, so it&apos;s worth asking
              again soon.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((result) => (
                <div key={result.id} className="flex flex-col gap-2">
                  <OpportunityCard
                    id={result.id}
                    title={result.title}
                    provider={result.provider}
                    type={result.type}
                    deadline={result.deadline}
                    applicationStatus={result.application_status}
                    fundingAmount={result.funding_amount}
                    country={result.country}
                    createdAt={result.created_at}
                    effortLevel={result.effort_level}
                    rewardLevel={result.reward_level}
                  />
                  {result.reason && (
                    <p className="px-1 text-xs leading-5 text-neutral-600 dark:text-neutral-400">
                      {result.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
