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

type SavedOpportunity = {
  id: string;
  created_at: string;
  opportunity_id: string;
  opportunities: Opportunity | null;
};

type ScoredSavedOpportunity = {
  savedId: string;
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

function getCardSummary(opportunity: Opportunity) {
  if (opportunity.ai_summary) return opportunity.ai_summary;

  if (!opportunity.description) return "No summary available yet.";

  return opportunity.description.length > 180
    ? `${opportunity.description.slice(0, 180)}...`
    : opportunity.description;
}

export default function SavedPage() {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<ScoredSavedOpportunity[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    async function loadSaved() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select(
          "nationality, country_of_study, student_status, school, school_other, education_level, field_of_study, field_of_study_other, gpa, languages, target_opportunity_types, leadership_experiences, research_experiences, volunteer_experiences, work_project_experiences, awards"
        )
        .eq("id", user.id)
        .maybeSingle();

      const { data, error } = await supabase
        .from("saved_opportunities")
        .select(
          `
          id,
          created_at,
          opportunity_id,
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
            competitiveness_factors
          )
        `
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && profileData) {
        const normalizedSaved = (data || []).map((item) => ({
          ...item,
          opportunities: Array.isArray(item.opportunities)
            ? item.opportunities[0] || null
            : item.opportunities,
        })) as unknown as SavedOpportunity[];

        const scored = normalizedSaved
          .filter((item) => item.opportunities)
          .map((item) => {
            const opportunity = item.opportunities as Opportunity;

            return {
              savedId: item.id,
              opportunity,
              score: calculateCompetitivenessScore({
                profile: profileData as never,
                opportunity,
              }),
            };
          });

        setSaved(scored);
      }

      setLoading(false);
    }

    loadSaved();
  }, []);

  const opportunityTypes = useMemo(() => {
    const types = new Set(saved.map((item) => item.opportunity.type));
    return Array.from(types);
  }, [saved]);

  const filteredSaved = saved.filter(({ opportunity }) => {
    const query = search.toLowerCase();

    const matchesSearch =
      opportunity.title.toLowerCase().includes(query) ||
      opportunity.provider?.toLowerCase().includes(query) ||
      opportunity.description?.toLowerCase().includes(query) ||
      opportunity.ai_summary?.toLowerCase().includes(query);

    const matchesType = typeFilter === "all" || opportunity.type === typeFilter;

    return matchesSearch && matchesType;
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
            Review the opportunities you saved and return to their details when
            you are ready.
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
                    Save opportunities from your ranked list so you can return
                    to them later.
                  </p>
                </div>

                <Button asChild>
                  <Link href="/opportunities">Find opportunities</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mt-8 grid gap-3 md:grid-cols-[1fr_260px]">
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
                        No saved opportunities match your current search.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredSaved.map(({ savedId, opportunity, score }) => (
                <Card key={savedId}>
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
                        <div className="rounded-xl border px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm text-muted-foreground">
                              Score
                            </p>
                            <p className="text-lg font-semibold">
                              {score.score}/100
                            </p>
                          </div>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatRecommendation(score.recommendation)}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <SaveOpportunityButton
                            opportunityId={opportunity.id}
                          />

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
