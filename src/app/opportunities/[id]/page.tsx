"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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

type Score = ReturnType<typeof calculateCompetitivenessScore>;

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

export default function OpportunityDetailPage() {
  const params = useParams();
  const opportunityId = String(params.id);

  const [loading, setLoading] = useState(true);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadDetail() {
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

      const { data: opportunityData, error } = await supabase
        .from("opportunities")
        .select(
          "id, title, provider, type, description, ai_summary, country, eligible_countries, eligible_education_levels, eligible_fields, funding_amount, funding_type, deadline, effort_level, reward_level, application_url, competitiveness_factors"
        )
        .eq("id", opportunityId)
        .eq("is_active", true)
        .eq("is_approved", true)
        .maybeSingle();

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      if (!opportunityData) {
        setMessage("Opportunity not found.");
        setLoading(false);
        return;
      }

      setOpportunity(opportunityData as Opportunity);

      if (profileData) {
        const calculatedScore = calculateCompetitivenessScore({
          profile: profileData as never,
          opportunity: opportunityData as Opportunity,
        });

        setScore(calculatedScore);
      }

      setLoading(false);
    }

    loadDetail();
  }, [opportunityId]);

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <Button asChild variant="outline">
            <Link href="/opportunities">← Back to opportunities</Link>
          </Button>

          {loading ? (
            <Card className="mt-8">
              <CardContent className="p-6">
                <p className="text-muted-foreground">Loading opportunity...</p>
              </CardContent>
            </Card>
          ) : message ? (
            <Card className="mt-8">
              <CardContent className="p-6">
                <p className="text-sm text-destructive">{message}</p>
              </CardContent>
            </Card>
          ) : opportunity ? (
            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
              <div className="space-y-6">
                <Card>
                  <CardContent className="p-8">
                    <div className="flex flex-wrap gap-2">
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

                    <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                      {opportunity.title}
                    </h1>

                    {opportunity.provider && (
                      <p className="mt-2 text-muted-foreground">
                        Provider: {opportunity.provider}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {opportunity.ai_summary && (
                  <Card>
                    <CardContent className="p-6">
                      <h2 className="text-xl font-semibold">AI summary</h2>
                      <p className="mt-3 leading-7 text-muted-foreground">
                        {opportunity.ai_summary}
                      </p>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-xl font-semibold">Full description</h2>
                    <p className="mt-3 whitespace-pre-line leading-7 text-muted-foreground">
                      {opportunity.description || "No description provided."}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-xl font-semibold">Eligibility & details</h2>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm text-muted-foreground">Country</p>
                        <p className="font-medium">{opportunity.country || "Global"}</p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">Funding</p>
                        <p className="font-medium">
                          {opportunity.funding_amount || "Not specified"}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">Funding type</p>
                        <p className="font-medium">
                          {opportunity.funding_type || "Not specified"}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">Reward level</p>
                        <p className="font-medium">
                          {opportunity.reward_level || "Not specified"}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">
                          Eligible countries
                        </p>
                        <p className="font-medium">
                          {opportunity.eligible_countries?.join(", ") || "Not specified"}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">
                          Eligible education levels
                        </p>
                        <p className="font-medium">
                          {opportunity.eligible_education_levels?.join(", ") ||
                            "Not specified"}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">
                          Eligible fields
                        </p>
                        <p className="font-medium">
                          {opportunity.eligible_fields?.join(", ") || "Not specified"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {score && (
                  <Card>
                    <CardContent className="p-6">
                      <h2 className="text-xl font-semibold">Gap report</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        These are the main factors affecting your competitiveness for this opportunity.
                      </p>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl border p-4">
                          <p className="font-medium">Strengths</p>
                          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                            {score.reasons.map((reason) => (
                              <li key={reason}>• {reason}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="rounded-xl border p-4">
                          <p className="font-medium">Areas to improve</p>
                          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                            {score.gaps.map((gap) => (
                              <li key={gap}>• {gap}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <aside className="space-y-4">
                {score && (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        Competitiveness
                      </p>
                      <p className="mt-2 text-5xl font-semibold">
                        {score.score}/100
                      </p>
                      <p className="mt-2 font-medium">{score.label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatRecommendation(score.recommendation)}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Confidence: {score.confidence}
                      </p>
                    </CardContent>
                  </Card>
                )}

                <SaveOpportunityButton opportunityId={opportunity.id} />

                {opportunity.application_url && (
                  <Button asChild className="w-full">
                    <a
                      href={opportunity.application_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Visit application page
                    </a>
                  </Button>
                )}
              </aside>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
