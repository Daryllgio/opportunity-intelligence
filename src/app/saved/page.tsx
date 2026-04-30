"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { SaveOpportunityButton } from "@/components/opportunities/save-opportunity-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export default function SavedPage() {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<ScoredSavedOpportunity[]>([]);

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
        const scored = ((data || []) as SavedOpportunity[])
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
            Keep track of opportunities you want to review, compare, or apply to
            later.
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
            <div className="mt-8 grid gap-4">
              {saved.map(({ savedId, opportunity, score }) => (
                <Card key={savedId}>
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
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
