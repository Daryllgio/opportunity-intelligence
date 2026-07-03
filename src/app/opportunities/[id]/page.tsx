"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppNav } from "@/components/layout/app-nav";
import { SaveOpportunityButton } from "@/components/opportunities/save-opportunity-button";
import { AddToCalendarButton } from "@/components/opportunities/add-to-calendar-button";
import { ReportIssueButton } from "@/components/opportunities/report-issue-button";
import { SimilarOpportunities } from "@/components/opportunities/similar-opportunities";
import { OpportunityTypeBadge } from "@/components/ui/opportunity-type-badge";
import { ApplicationStatusBadge } from "@/components/ui/application-status-badge";
import { SourceTrustBadge } from "@/components/ui/source-trust-badge";
import { DestinationConfidenceBadge } from "@/components/ui/destination-confidence-badge";
import { FreshnessLabel } from "@/components/ui/freshness-label";
import { supabase } from "@/lib/supabase";
import { getPlanLimits } from "@/lib/billing/plans";

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
  deadline_confidence: string | null;
  application_status: string | null;
  effort_level: string | null;
  reward_level: string | null;
  application_url: string | null;
  source_url: string | null;
  competitiveness_factors: string[] | null;
  source_category: string | null;
  application_destination_url: string | null;
  application_destination_type: string | null;
  destination_confidence: string | null;
  official_source_url: string | null;
  created_at: string | null;
  updated_at: string | null;
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

const OPPORTUNITY_SELECT =
  "id, title, provider, type, description, ai_summary, country, eligible_countries, eligible_education_levels, eligible_fields, funding_amount, funding_type, deadline, deadline_confidence, application_status, effort_level, reward_level, application_url, source_url, competitiveness_factors, source_category, application_destination_url, application_destination_type, destination_confidence, official_source_url, created_at, updated_at";

const DESTINATION_TYPE_LABELS: Record<string, string> = {
  official_application_page: "Official application page",
  official_program_page: "Official program page",
  third_party_portal: "Third-party application portal",
  login_gated_portal: "Login-gated portal",
  email_based_application: "Email-based application",
  application_document: "Application document",
  aggregator_or_database: "Aggregator page",
  not_found: "Not verified",
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function domainFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function resolveApplyUrl(opp: Opportunity): string | null {
  return (
    opp.application_destination_url || opp.application_url || opp.source_url || null
  );
}

function FactItem({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-neutral-900 dark:text-neutral-100">
        {value}
      </dd>
    </div>
  );
}

export default function OpportunityDetailPage() {
  const params = useParams();
  const opportunityId = String(params.id);

  const [loading, setLoading] = useState(true);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [scoreReport, setScoreReport] = useState<ScoreReport | null>(null);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [hasFullDetails, setHasFullDetails] = useState(true);
  const [hasGapReports, setHasGapReports] = useState(false);
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

      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_plan")
        .eq("id", user.id)
        .maybeSingle();

      const planLimits = getPlanLimits(profile?.subscription_plan);
      setHasFullDetails(planLimits.hasFullDetails);
      setHasGapReports(planLimits.hasGapReports);

      const { data: opportunityData, error } = await supabase
        .from("opportunities")
        .select(OPPORTUNITY_SELECT)
        .eq("id", opportunityId)
        .eq("is_active", true)
        .eq("is_approved", true)
        .eq("lifecycle_status", "active")
        .maybeSingle();

      if (error || !opportunityData) {
        setMessage("This opportunity is no longer available.");
        setLoading(false);
        return;
      }

      setOpportunity(opportunityData as unknown as Opportunity);

      const [{ data: reportData }, { data: scoreRow }] = await Promise.all([
        supabase
          .from("opportunity_score_reports")
          .select(
            "id, overall_score, fit_label, eligibility_status, strengths, gaps, recommended_actions, ai_explanation, model_used, updated_at"
          )
          .eq("opportunity_id", opportunityId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("opportunity_competitiveness_scores")
          .select("score, score_status")
          .eq("opportunity_id", opportunityId)
          .eq("user_id", user.id)
          .eq("score_status", "current")
          .maybeSingle(),
      ]);

      setScoreReport((reportData || null) as ScoreReport | null);
      if (typeof scoreRow?.score === "number") setMatchScore(scoreRow.score);
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
      setScoreMessage("Please log in again before generating a report.");
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
        body: JSON.stringify({ opportunityId }),
      });

      const result = await response.json();

      if (!response.ok) {
        setScoreMessage(result.error || "Could not generate the report.");
        setScoring(false);
        return;
      }

      setScoreReport(result.report as ScoreReport);
    } catch {
      setScoreMessage("Could not generate the report. Please try again.");
    }

    setScoring(false);
  }

  const applyUrl = opportunity ? resolveApplyUrl(opportunity) : null;
  const sourceDomain = opportunity ? domainFromUrl(opportunity.source_url) : null;
  const deadlineText = opportunity ? formatDate(opportunity.deadline) : null;
  const lastChecked = opportunity ? formatDate(opportunity.updated_at) : null;

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link
          href="/opportunities"
          className="text-sm text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          ← All opportunities
        </Link>

        {loading ? (
          <div className="mt-8 space-y-4">
            <div className="h-8 w-3/4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
            <div className="h-40 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
          </div>
        ) : message ? (
          <div className="mt-16 text-center">
            <h1 className="text-xl font-semibold">{message}</h1>
            <p className="mt-2 text-sm text-neutral-500">
              It may have expired or been removed after re-verification.
            </p>
            <Link
              href="/opportunities"
              className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Browse open opportunities
            </Link>
          </div>
        ) : opportunity ? (
          <>
            {/* ── Header ── */}
            <header className="mt-6">
              <div className="flex flex-wrap items-center gap-3">
                <OpportunityTypeBadge type={opportunity.type} />
                {opportunity.application_status && (
                  <ApplicationStatusBadge status={opportunity.application_status} />
                )}
                <FreshnessLabel createdAt={opportunity.created_at} />
              </div>

              <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight">
                {opportunity.title}
              </h1>

              {opportunity.provider && (
                <p className="mt-2 text-base text-neutral-500 dark:text-neutral-400">
                  {opportunity.provider}
                </p>
              )}

              {matchScore !== null && (
                <p className="mt-3 text-sm text-neutral-500">
                  Your match score:{" "}
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {matchScore}
                  </span>
                  <span className="text-neutral-400"> / 100</span>
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {applyUrl && (
                  <a
                    href={applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-primary px-6 py-2.5 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Apply now
                  </a>
                )}
                <SaveOpportunityButton opportunityId={opportunity.id} />
              </div>

              {opportunity.deadline && (
                <div className="mt-3">
                  <AddToCalendarButton
                    title={opportunity.title}
                    deadline={opportunity.deadline}
                    opportunityId={opportunity.id}
                  />
                </div>
              )}
            </header>

            {/* ── Key facts ── */}
            <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-neutral-100 py-8 sm:grid-cols-4 dark:border-neutral-900">
              <FactItem
                label="Deadline"
                value={
                  deadlineText ||
                  (opportunity.application_status === "rolling" ? "Rolling" : null)
                }
              />
              <FactItem label="Funding" value={opportunity.funding_amount} />
              <FactItem label="Country" value={opportunity.country} />
              <FactItem
                label="Effort"
                value={
                  opportunity.effort_level
                    ? opportunity.effort_level.charAt(0).toUpperCase() +
                      opportunity.effort_level.slice(1)
                    : null
                }
              />
            </dl>

            {hasFullDetails ? (
              <>
                {/* ── Summary ── */}
                {opportunity.ai_summary && (
                  <section className="mt-10">
                    <p className="border-l-2 border-neutral-200 pl-4 text-[15px] leading-7 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
                      {opportunity.ai_summary}
                    </p>
                  </section>
                )}

                {/* ── Description ── */}
                {opportunity.description && (
                  <section className="mt-10">
                    <h2 className="text-lg font-semibold">About this opportunity</h2>
                    <p className="mt-3 whitespace-pre-line break-words text-[15px] leading-7 text-neutral-600 dark:text-neutral-300">
                      {opportunity.description}
                    </p>
                  </section>
                )}

                {/* ── Requirements checklist ── */}
                {opportunity.competitiveness_factors &&
                  opportunity.competitiveness_factors.length > 0 && (
                    <section className="mt-10">
                      <h2 className="text-lg font-semibold">
                        What selection is based on
                      </h2>
                      <ul className="mt-3 space-y-2">
                        {opportunity.competitiveness_factors.map((factor) => (
                          <li
                            key={factor}
                            className="flex items-start gap-2.5 text-[15px] leading-6 text-neutral-600 dark:text-neutral-300"
                          >
                            <span
                              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-600"
                              aria-hidden="true"
                            />
                            {factor}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                {/* ── Eligibility ── */}
                <section className="mt-10">
                  <h2 className="text-lg font-semibold">Eligibility</h2>
                  <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                    <FactItem
                      label="Education levels"
                      value={
                        opportunity.eligible_education_levels?.length
                          ? opportunity.eligible_education_levels
                              .map((l) => l.replace(/_/g, " "))
                              .join(", ")
                          : "Not specified"
                      }
                    />
                    <FactItem
                      label="Fields of study"
                      value={
                        opportunity.eligible_fields?.length
                          ? opportunity.eligible_fields.map((f) => f.replace(/_/g, " ")).join(", ")
                          : "All fields"
                      }
                    />
                    <FactItem
                      label="Eligible countries"
                      value={
                        opportunity.eligible_countries?.length
                          ? opportunity.eligible_countries.join(", ")
                          : "Not specified"
                      }
                    />
                    <FactItem
                      label="Funding type"
                      value={opportunity.funding_type}
                    />
                  </dl>
                </section>

                {/* ── Gap report ── */}
                <section className="mt-12 border-t border-neutral-100 pt-10 dark:border-neutral-900">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <h2 className="text-lg font-semibold">
                        Your competitiveness report
                      </h2>
                      <p className="mt-1 max-w-md text-sm leading-6 text-neutral-500">
                        A detailed read on your strengths, gaps, and how to
                        position your application for this specific opportunity.
                      </p>
                    </div>
                    {!scoreReport && hasGapReports && (
                      <button
                        type="button"
                        onClick={generateScoreReport}
                        disabled={scoring}
                        className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {scoring ? "Analyzing…" : "Generate report"}
                      </button>
                    )}
                  </div>

                  {scoreMessage && (
                    <p className="mt-4 text-sm text-neutral-500">{scoreMessage}</p>
                  )}

                  {!hasGapReports && !scoreReport && (
                    <p className="mt-4 rounded-lg bg-neutral-50 p-4 text-sm text-neutral-500 dark:bg-neutral-900">
                      Competitiveness reports are part of paid plans.{" "}
                      <Link href="/pricing" className="font-medium underline underline-offset-2">
                        See plans
                      </Link>
                    </p>
                  )}

                  {scoreReport && (
                    <div className="mt-6">
                      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                        <p>
                          <span className="text-3xl font-semibold">
                            {scoreReport.overall_score}
                          </span>
                          <span className="text-sm text-neutral-400"> / 100</span>
                        </p>
                        <p className="text-sm font-medium">{scoreReport.fit_label}</p>
                        <p className="text-sm text-neutral-500">
                          {scoreReport.eligibility_status}
                        </p>
                      </div>

                      {scoreReport.ai_explanation && (
                        <p className="mt-4 text-[15px] leading-7 text-neutral-600 dark:text-neutral-300">
                          {scoreReport.ai_explanation}
                        </p>
                      )}

                      <div className="mt-8 grid gap-8 sm:grid-cols-2">
                        <div>
                          <h3 className="text-sm font-semibold">Strengths</h3>
                          <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                            {(scoreReport.strengths || []).map((item) => (
                              <li key={item} className="flex gap-2.5">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" aria-hidden="true" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold">Gaps</h3>
                          <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                            {(scoreReport.gaps || []).map((item) => (
                              <li key={item} className="flex gap-2.5">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {(scoreReport.recommended_actions || []).length > 0 && (
                        <div className="mt-8">
                          <h3 className="text-sm font-semibold">
                            How to position your application
                          </h3>
                          <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                            {(scoreReport.recommended_actions || []).map((item) => (
                              <li key={item} className="flex gap-2.5">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-600" aria-hidden="true" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </>
            ) : (
              /* ── Free plan: gated details ── */
              <section className="mt-10 rounded-lg border border-neutral-200 p-8 text-center dark:border-neutral-800">
                <h2 className="text-lg font-semibold">
                  Full details are on paid plans
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-500">
                  Upgrade to see the full description, eligibility breakdown,
                  selection criteria, match scoring, and competitiveness
                  reports for every opportunity.
                </p>
                <Link
                  href="/pricing"
                  className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  See plans
                </Link>
              </section>
            )}

            {/* ── Source & verification ── */}
            <section className="mt-12 rounded-lg bg-neutral-50 p-5 dark:bg-neutral-900">
              <div className="flex flex-wrap items-center gap-2">
                <SourceTrustBadge category={opportunity.source_category || "unknown"} />
                <DestinationConfidenceBadge
                  confidence={opportunity.destination_confidence || "none"}
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-500">
                {DESTINATION_TYPE_LABELS[
                  opportunity.application_destination_type || "not_found"
                ] || "Application destination"}
                {sourceDomain && <> · found via {sourceDomain}</>}
                {lastChecked && <> · last checked {lastChecked}</>}
              </p>
              <div className="mt-3">
                <ReportIssueButton opportunityId={opportunity.id} />
              </div>
            </section>

            {/* ── Similar ── */}
            <SimilarOpportunities
              opportunityId={opportunity.id}
              type={opportunity.type}
              eligibleFields={opportunity.eligible_fields}
            />
          </>
        ) : null}
      </main>
    </div>
  );
}
