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

type ScoreReport = {
  id: string;
  overall_score: number;
  fit_label: string;
  eligibility_status: string;
  strengths: string[] | null;
  gaps: string[] | null;
  recommended_actions: string[] | null;
  ai_explanation: string | null;
  model_used: string | null;
  updated_at: string | null;
};

function formatOpportunityType(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function OpportunityDetailPage() {
  const params = useParams();
  const opportunityId = String(params.id);

  const [loading, setLoading] = useState(true);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [scoreReport, setScoreReport] = useState<ScoreReport | null>(null);
  const [message, setMessage] = useState("");
  const [scoreMessage, setScoreMessage] = useState("");
  const [scoring, setScoring] = useState(false);

  useEffect(() => {
    async function loadDetail() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: opportunityData, error } = await supabase
        .from("opportunities")
        .select(
          "id, title, provider, type, description, ai_summary, country, eligible_countries, eligible_education_levels, eligible_fields, funding_amount, funding_type, deadline, effort_level, reward_level, application_url, competitiveness_factors"
        )
        .eq("id", opportunityId)
        .eq("is_active", true)
        .eq("is_approved", true)
        .eq("lifecycle_status", "active")
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

      const { data: reportData } = await supabase
        .from("opportunity_score_reports")
        .select(
          "id, overall_score, fit_label, eligibility_status, strengths, gaps, recommended_actions, ai_explanation, model_used, updated_at"
        )
        .eq("opportunity_id", opportunityId)
        .eq("user_id", user.id)
        .maybeSingle();

      setScoreReport((reportData || null) as ScoreReport | null);
      setLoading(false);
    }

    loadDetail();
  }, [opportunityId]);

  async function generateScoreReport() {
    setScoring(true);
    setScoreMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setScoreMessage("Please log in again before generating a score report.");
      setScoring(false);
      return;
    }

    try {
      const response = await fetch("/api/score-opportunity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          opportunityId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setScoreMessage(result.error || "Could not generate score report.");
        setScoring(false);
        return;
      }

      setScoreReport(result.report as ScoreReport);
      setScoreMessage("AI score report generated successfully.");
    } catch (error) {
      setScoreMessage(
        error instanceof Error
          ? error.message
          : "Could not generate score report."
      );
    }

    setScoring(false);
  }

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
                    <h2 className="text-xl font-semibold">
                      Eligibility & details
                    </h2>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm text-muted-foreground">Country</p>
                        <p className="font-medium">
                          {opportunity.country || "Global"}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">Funding</p>
                        <p className="font-medium">
                          {opportunity.funding_amount || "Not specified"}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">
                          Funding type
                        </p>
                        <p className="font-medium">
                          {opportunity.funding_type || "Not specified"}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">
                          Reward level
                        </p>
                        <p className="font-medium">
                          {opportunity.reward_level || "Not specified"}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">
                          Eligible countries
                        </p>
                        <p className="font-medium">
                          {opportunity.eligible_countries?.join(", ") ||
                            "Not specified"}
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
                          {opportunity.eligible_fields?.join(", ") ||
                            "Not specified"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div>
                        <h2 className="text-xl font-semibold">
                          AI competitiveness report
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          This report explains your competitiveness, key strengths,
                          profile gaps, and how to position your existing
                          experience for this opportunity.
                        </p>
                      </div>

                      <Button
                        type="button"
                        onClick={generateScoreReport}
                        disabled={scoring || Boolean(scoreReport)}
                      >
                        {scoring
                          ? "Generating..."
                          : scoreReport
                            ? "Report generated"
                            : "Generate AI report"}
                      </Button>
                    </div>

                    {scoreMessage && (
                      <p className="mt-4 text-sm text-muted-foreground">
                        {scoreMessage}
                      </p>
                    )}

                    {!scoreReport ? (
                      <div className="mt-6 rounded-xl border border-dashed p-6">
                        <p className="text-sm text-muted-foreground">
                          No AI report has been generated yet. Generate a report
                          to see your definitive score, eligibility status,
                          strengths, gaps, and recommended next steps.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-6 space-y-5">
                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="rounded-xl border p-5">
                            <p className="text-sm text-muted-foreground">
                              Match score
                            </p>
                            <p className="mt-2 text-4xl font-semibold">
                              {scoreReport.overall_score}/100
                            </p>
                          </div>

                          <div className="rounded-xl border p-5">
                            <p className="text-sm text-muted-foreground">
                              Fit label
                            </p>
                            <p className="mt-2 text-xl font-semibold">
                              {scoreReport.fit_label}
                            </p>
                          </div>

                          <div className="rounded-xl border p-5">
                            <p className="text-sm text-muted-foreground">
                              Eligibility
                            </p>
                            <p className="mt-2 text-xl font-semibold">
                              {scoreReport.eligibility_status}
                            </p>
                          </div>
                        </div>

                        {scoreReport.ai_explanation && (
                          <div className="rounded-xl border p-5">
                            <h3 className="font-semibold">Explanation</h3>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {scoreReport.ai_explanation}
                            </p>
                          </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="rounded-xl border p-5">
                            <h3 className="font-semibold">Strengths</h3>
                            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                              {(scoreReport.strengths || []).length === 0 ? (
                                <li>No strengths listed.</li>
                              ) : (
                                (scoreReport.strengths || []).map((item) => (
                                  <li key={item}>• {item}</li>
                                ))
                              )}
                            </ul>
                          </div>

                          <div className="rounded-xl border p-5">
                            <h3 className="font-semibold">Gaps</h3>
                            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                              {(scoreReport.gaps || []).length === 0 ? (
                                <li>No gaps listed.</li>
                              ) : (
                                (scoreReport.gaps || []).map((item) => (
                                  <li key={item}>• {item}</li>
                                ))
                              )}
                            </ul>
                          </div>

                          <div className="rounded-xl border p-5">
                            <h3 className="font-semibold">How to position your profile</h3>
                            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                              {(scoreReport.recommended_actions || []).length ===
                              0 ? (
                                <li>No positioning guidance listed.</li>
                              ) : (
                                (scoreReport.recommended_actions || []).map(
                                  (item) => <li key={item}>• {item}</li>
                                )
                              )}
                            </ul>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Model: {scoreReport.model_used || "AI"} · Updated:{" "}
                          {scoreReport.updated_at
                            ? new Date(scoreReport.updated_at).toLocaleString()
                            : "Unknown"}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <aside className="space-y-4">
                {scoreReport ? (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        Match score
                      </p>
                      <p className="mt-2 text-5xl font-semibold">
                        {scoreReport.overall_score}/100
                      </p>
                      <p className="mt-2 font-medium">
                        {scoreReport.fit_label}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {scoreReport.eligibility_status}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        Match score
                      </p>
                      <p className="mt-2 text-xl font-semibold">
                        Not generated yet
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Generate the AI report to calculate your definitive
                        score.
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
