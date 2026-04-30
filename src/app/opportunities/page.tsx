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
import { calculateCompetitivenessScore } from "@/lib/scoring";

type Opportunity = {
  id: string;
  title: string;
  provider: string | null;
  type: string;
  description: string | null;
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

type ScoredOpportunity = {
  opportunity: Opportunity;
  score: ReturnType<typeof calculateCompetitivenessScore>;
};

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

export default function OpportunitiesPage() {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [scoredOpportunities, setScoredOpportunities] = useState<
    ScoredOpportunity[]
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
        .select(
          "nationality, country_of_study, student_status, school, school_other, education_level, field_of_study, field_of_study_other, gpa, languages, target_opportunity_types, leadership_experiences, research_experiences, volunteer_experiences, work_project_experiences, awards"
        )
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

      const { data: opportunities, error: opportunitiesError } = await supabase
        .from("opportunities")
        .select(
          "id, title, provider, type, description, country, eligible_countries, eligible_education_levels, eligible_fields, funding_amount, funding_type, deadline, effort_level, reward_level, application_url, competitiveness_factors"
        )
        .eq("is_active", true)
        .eq("is_approved", true)
        .order("deadline", { ascending: true });

      if (opportunitiesError) {
        setErrorMessage(opportunitiesError.message);
        setLoading(false);
        return;
      }

      const scored = ((opportunities || []) as Opportunity[])
        .map((opportunity) => ({
          opportunity,
          score: calculateCompetitivenessScore({
            profile: profileData as never,
            opportunity,
          }),
        }))
        .sort((a, b) => b.score.score - a.score.score);

      setScoredOpportunities(scored);
      setLoading(false);
    }

    loadOpportunities();
  }, []);

  const opportunityTypes = useMemo(() => {
    const types = new Set(scoredOpportunities.map((item) => item.opportunity.type));
    return Array.from(types);
  }, [scoredOpportunities]);

  const filteredOpportunities = scoredOpportunities.filter(({ opportunity }) => {
    const query = search.toLowerCase();

    const matchesSearch =
      opportunity.title.toLowerCase().includes(query) ||
      opportunity.provider?.toLowerCase().includes(query) ||
      opportunity.description?.toLowerCase().includes(query);

    const matchesType =
      typeFilter === "all" || opportunity.type === typeFilter;

    return matchesSearch && matchesType;
  });

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <Badge variant="secondary">Opportunities</Badge>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Your ranked opportunities
          </h1>

          <p className="mt-3 max-w-2xl text-muted-foreground">
            Browse opportunities ranked by your competitiveness.
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
                  <h2 className="text-lg font-semibold">Log in to see scores</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create a profile to unlock personalized competitiveness scores.
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
                  <h2 className="text-lg font-semibold">
                    Complete your profile first
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    OppScore needs your academic profile and experience details
                    to calculate personalized scores.
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

              <div className="mt-6 grid gap-4">
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
                      <CardContent className="grid gap-5 p-6 lg:grid-cols-[1fr_210px] lg:items-center">
                        <div>
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

                          <h2 className="mt-3 text-xl font-semibold">
                            {opportunity.title}
                          </h2>

                          {opportunity.provider && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              Provider: {opportunity.provider}
                            </p>
                          )}

                          {opportunity.description && (
                            <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                              {opportunity.description}
                            </p>
                          )}

                          <div className="mt-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
                            {opportunity.funding_amount && (
                              <span>{opportunity.funding_amount}</span>
                            )}
                            {opportunity.funding_type && (
                              <span>• {opportunity.funding_type}</span>
                            )}
                            {opportunity.reward_level && (
                              <span>• Reward: {opportunity.reward_level}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-3">
                          <div className="rounded-2xl border p-4 text-center">
                            <p className="text-sm text-muted-foreground">
                              Competitiveness
                            </p>
                            <p className="mt-1 text-3xl font-semibold">
                              {score.score}/100
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {formatRecommendation(score.recommendation)}
                            </p>
                          </div>

                          <SaveOpportunityButton opportunityId={opportunity.id} />

                          <Button asChild variant="outline">
                            <Link href={`/opportunities/${opportunity.id}`}>
                              View details
                            </Link>
                          </Button>
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
