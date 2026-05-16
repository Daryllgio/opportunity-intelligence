"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { SaveOpportunityButton } from "@/components/opportunities/save-opportunity-button";
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
};

type CompetitivenessScore = {
  opportunity_id: string;
  score: number;
  fit_label: string;
  model_used: string | null;
  updated_at: string | null;
};

type OpportunityWithScore = {
  opportunity: Opportunity;
  score: CompetitivenessScore | null;
};

function formatOpportunityType(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getCardSummary(opportunity: Opportunity) {
  if (opportunity.ai_summary) return opportunity.ai_summary;

  if (!opportunity.description) return "No summary available yet.";

  return opportunity.description.length > 180
    ? `${opportunity.description.slice(0, 180)}...`
    : opportunity.description;
}

export default function OpportunitiesPage() {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState("free");
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [opportunitiesWithScores, setOpportunitiesWithScores] = useState<
    OpportunityWithScore[]
  >([]);

  useEffect(() => {
    async function loadOpportunities() {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsLoggedIn(false);
        setLoading(false);
        return;
      }

      setIsLoggedIn(true);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, subscription_plan")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setErrorMessage(profileError.message);
        setLoading(false);
        return;
      }

      if (!profileData) {
        setHasProfile(false);
        setLoading(false);
        return;
      }

      setHasProfile(true);
      setSubscriptionPlan(profileData.subscription_plan || "free");

      const { data: opportunities, error: opportunitiesError } = await supabase
        .from("opportunities")
        .select(
          "id, title, provider, type, description, ai_summary, country, eligible_countries, eligible_education_levels, eligible_fields, funding_amount, funding_type, deadline, effort_level, reward_level, application_url, competitiveness_factors"
        )
        .eq("is_active", true)
        .eq("is_approved", true)
        .eq("lifecycle_status", "active")
        .in("type", [
          "scholarship",
          "research",
          "fellowship",
          "competition",
          "leadership_program",
        ])
        .order("deadline", { ascending: true });

      if (opportunitiesError) {
        setErrorMessage(opportunitiesError.message);
        setLoading(false);
        return;
      }

      const { data: scoreData, error: scoreError } = await supabase
        .from("opportunity_competitiveness_scores")
        .select("opportunity_id, score, fit_label, model_used, updated_at, score_status")
        .eq("user_id", user.id)
        .eq("score_status", "current");

      if (scoreError) {
        setErrorMessage(scoreError.message);
        setLoading(false);
        return;
      }

      const scoreMap = new Map<string, CompetitivenessScore>();

      ((scoreData || []) as CompetitivenessScore[]).forEach((score) => {
        scoreMap.set(score.opportunity_id, score);
      });

      const merged = ((opportunities || []) as Opportunity[])
        .map((opportunity) => ({
          opportunity,
          score: scoreMap.get(opportunity.id) || null,
        }))
        .sort((a, b) => {
          if (a.score && b.score) return b.score.score - a.score.score;
          if (a.score && !b.score) return -1;
          if (!a.score && b.score) return 1;

          const aDeadline = a.opportunity.deadline || "9999-12-31";
          const bDeadline = b.opportunity.deadline || "9999-12-31";

          return aDeadline.localeCompare(bDeadline);
        });

      setOpportunitiesWithScores(merged);
      setLoading(false);
    }

    loadOpportunities();
  }, []);

  const opportunityTypes = useMemo(() => {
    const types = new Set(
      opportunitiesWithScores.map((item) => item.opportunity.type)
    );
    return Array.from(types);
  }, [opportunitiesWithScores]);

  const filteredOpportunities = opportunitiesWithScores.filter(
    ({ opportunity }) => {
      const query = search.toLowerCase();

      const matchesSearch =
        opportunity.title.toLowerCase().includes(query) ||
        opportunity.provider?.toLowerCase().includes(query) ||
        opportunity.description?.toLowerCase().includes(query) ||
        opportunity.ai_summary?.toLowerCase().includes(query);

      const matchesType = typeFilter === "all" || opportunity.type === typeFilter;

      return matchesSearch && matchesType;
    }
  );

  const paidPlan = subscriptionPlan === "pro" || subscriptionPlan === "premium";

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <Badge variant="secondary">Opportunities</Badge>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Your opportunities
          </h1>

          <p className="mt-3 max-w-2xl text-muted-foreground">
            Search, compare, save, and review opportunities matched to your profile.
          </p>

          {loading && (
            <Card className="mt-8">
              <CardContent className="p-6">
                <p className="text-muted-foreground">Loading opportunities...</p>
              </CardContent>
            </Card>
          )}

          {!loading && !isLoggedIn && (
            <Card className="mt-8">
              <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Log in to view opportunities</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create a profile to save opportunities and access personalized tools.
                  </p>
                </div>

                <Button asChild>
                  <Link href="/login">Log in</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {!loading && isLoggedIn && !hasProfile && (
            <Card className="mt-8">
              <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Complete your profile first</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    OppScore needs your academic profile and experience details to personalize your opportunity list.
                  </p>
                </div>

                <Button asChild>
                  <Link href="/profile/edit">Build profile</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {!loading && errorMessage && (
            <Card className="mt-8">
              <CardContent className="p-6">
                <p className="text-sm text-destructive">{errorMessage}</p>
              </CardContent>
            </Card>
          )}

          {!loading && hasProfile && (
            <>
              <div className="mt-8 grid gap-3 md:grid-cols-[1fr_260px]">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search opportunities..."
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

              {!paidPlan && (
                <Card className="mt-6">
                  <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="font-semibold">
                        Competitiveness scores are available on paid plans.
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Free users can browse the database, use filters, and save opportunities.
                      </p>
                    </div>

                    <Button asChild variant="outline">
                      <Link href="/pricing">View plans</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}

              <div className="mt-6 grid gap-3">
                {filteredOpportunities.length === 0 ? (
                  <Card>
                    <CardContent className="p-6">
                      <p className="text-muted-foreground">
                        No opportunities match your current search.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredOpportunities.map(({ opportunity, score }) => (
                    <Card key={opportunity.id}>
                      <CardContent className="p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">
                                {formatOpportunityType(opportunity.type)}
                              </Badge>

                              {opportunity.deadline && (
                                <Badge variant="outline">
                                  Deadline: {opportunity.deadline}
                                </Badge>
                              )}

                              {opportunity.effort_level && (
                                <Badge variant="outline">
                                  Effort: {opportunity.effort_level}
                                </Badge>
                              )}
                            </div>

                            <h2 className="mt-3 text-lg font-semibold">
                              {opportunity.title}
                            </h2>

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
                            {paidPlan && score && (
                              <div className="rounded-xl border px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm text-muted-foreground">
                                    Competitiveness
                                  </p>
                                  <p className="text-lg font-semibold">
                                    {score.score}/100
                                  </p>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {score.fit_label}
                                </p>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                              <SaveOpportunityButton opportunityId={opportunity.id} />

                              <Button asChild variant="outline">
                                <Link href={`/opportunities/${opportunity.id}`}>
                                  Details
                                </Link>
                              </Button>
                            </div>
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
