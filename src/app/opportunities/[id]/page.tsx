"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppNav } from "@/components/layout/app-nav";
import { SaveOpportunityButton } from "@/components/opportunities/save-opportunity-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OpportunityTypeBadge } from "@/components/ui/opportunity-type-badge";
import { ApplicationStatusBadge } from "@/components/ui/application-status-badge";
import { SourceTrustBadge } from "@/components/ui/source-trust-badge";
import { DestinationConfidenceBadge } from "@/components/ui/destination-confidence-badge";
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
  deadline_confidence: string | null;
  application_status: string | null;
  effort_level: string | null;
  reward_level: string | null;
  application_url: string | null;
  source_url: string | null;
  competitiveness_factors: string[] | null;
  // Source & verification fields
  source_category: string | null;
  application_destination_url: string | null;
  application_destination_type: string | null;
  application_url_quality: string | null;
  destination_confidence: string | null;
  official_source_url: string | null;
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
  "id, title, provider, type, description, ai_summary, country, eligible_countries, eligible_education_levels, eligible_fields, funding_amount, funding_type, deadline, deadline_confidence, application_status, effort_level, reward_level, application_url, source_url, competitiveness_factors, source_category, application_destination_url, application_destination_type, application_url_quality, destination_confidence, official_source_url, updated_at";

const DESTINATION_TYPE_LABELS: Record<string, string> = {
  official_application_page: "Official application page",
  official_program_page: "Official program page",
  third_party_portal: "Third-party application portal",
  login_gated_portal: "Login-gated portal",
  email_based_application: "Email-based application",
  aggregator_or_database: "Aggregator page",
  not_found: "Application destination not verified",
};

function destinationTypeLabel(type: string | null): string {
  if (!type) return "Application destination not verified";
  return DESTINATION_TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

function formatOpportunityType(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Derive a readable domain from any of the opportunity's URLs.
function domainFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const PORTAL_NAMES: Array<{ match: string; name: string }> = [
  { match: "awardspring", name: "AwardSpring" },
  { match: "submittable", name: "Submittable" },
  { match: "scholarshipowl", name: "ScholarshipOwl" },
  { match: "smapply", name: "SM Apply" },
  { match: "fluidreview", name: "FluidReview" },
  { match: "wizehive", name: "WizeHive" },
];

function detectPortalName(opp: Opportunity): string | null {
  const haystack = [opp.application_destination_url, opp.application_url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  for (const { match, name } of PORTAL_NAMES) {
    if (haystack.includes(match)) return name;
  }
  return null;
}

// Best application URL, in priority order.
function resolveApplyUrl(opp: Opportunity): string | null {
  return (
    opp.application_destination_url ||
    opp.application_url ||
    opp.source_url ||
    null
  );
}

const VERIFIED_DEST = new Set([
  "official_application_page",
  "official_program_page",
]);
const PORTAL_DEST = new Set(["third_party_portal", "login_gated_portal"]);
const OFFICIAL_SOURCES = new Set([
  "government",
  "university",
  "official_provider",
]);
const FOUNDATION_SOURCES = new Set(["foundation", "nonprofit"]);

type TrustMessage = {
  tone: "positive" | "neutral" | "caution";
  text: string;
  officialSourceUrl?: string | null;
};

// Contextual trust message describing source quality and verification.
function buildTrustMessage(opp: Opportunity): TrustMessage {
  const category = opp.source_category;
  const destType = opp.application_destination_type;
  const confidence = opp.destination_confidence;
  const domain = domainFromUrl(opp.source_url) || "an external source";
  const portal = detectPortalName(opp);

  const destinationFound = destType !== null && destType !== "not_found";

  if (!destinationFound || !confidence || confidence === "none") {
    return {
      tone: "caution",
      text: "The application destination has not been fully verified. Please check the provider's website directly before applying.",
    };
  }

  if (destType && PORTAL_DEST.has(destType)) {
    return {
      tone: "neutral",
      text: `The application is hosted through ${
        portal ?? "a third-party application portal"
      }.`,
    };
  }

  if (category === "aggregator") {
    return {
      tone: "caution",
      text: `This opportunity was found through ${domain}. We recommend verifying details on the official provider's website.`,
      officialSourceUrl: opp.official_source_url,
    };
  }

  if (category && OFFICIAL_SOURCES.has(category) && destType && VERIFIED_DEST.has(destType)) {
    return {
      tone: "positive",
      text: "This opportunity was found on an official source and links to a verified destination.",
    };
  }

  if (category && FOUNDATION_SOURCES.has(category)) {
    return {
      tone: "positive",
      text: "This opportunity comes from a foundation or nonprofit. The application link has been verified.",
    };
  }

  return {
    tone: "neutral",
    text: "The application link for this opportunity has been verified.",
  };
}

function applyButtonLabel(opp: Opportunity): string {
  const destType = opp.application_destination_type;
  const portal = detectPortalName(opp);
  const domain = domainFromUrl(opp.source_url);

  if (destType && VERIFIED_DEST.has(destType)) return "Apply on official website";
  if (destType && PORTAL_DEST.has(destType))
    return `Apply through ${portal ?? "application portal"}`;
  if (opp.source_category === "aggregator")
    return `View on ${domain ?? "source"}`;
  return "Visit provider website";
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
        .select(OPPORTUNITY_SELECT)
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

      setOpportunity(opportunityData as unknown as Opportunity);

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

  const trust = opportunity ? buildTrustMessage(opportunity) : null;
  const applyUrl = opportunity ? resolveApplyUrl(opportunity) : null;
  const sourceDomain = opportunity ? domainFromUrl(opportunity.source_url) : null;
  const deadlineText = opportunity ? formatDate(opportunity.deadline) : null;
  const lastChecked = opportunity ? formatDate(opportunity.updated_at) : null;

  const trustToneClass: Record<TrustMessage["tone"], string> = {
    positive:
      "bg-neutral-50 text-neutral-700 border-neutral-200 dark:bg-neutral-900 dark:text-neutral-300 dark:border-neutral-700",
    neutral:
      "bg-neutral-50 text-neutral-700 border-neutral-200 dark:bg-neutral-900 dark:text-neutral-300 dark:border-neutral-700",
    caution:
      "bg-amber-50/60 text-amber-900 border-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
  };

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <Button asChild variant="outline">
            <Link href="/opportunities">Back to opportunities</Link>
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
                {/* ── Header ─────────────────────────────────────── */}
                <Card>
                  <CardContent className="p-8">
                    <div className="flex flex-wrap items-center gap-2">
                      <OpportunityTypeBadge type={opportunity.type} />
                      {opportunity.application_status && (
                        <ApplicationStatusBadge
                          status={opportunity.application_status}
                        />
                      )}
                    </div>

                    <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                      {opportunity.title}
                    </h1>

                    {opportunity.provider && (
                      <p className="mt-2 text-lg text-muted-foreground">
                        {opportunity.provider}
                      </p>
                    )}

                    <div className="mt-6 flex flex-wrap gap-3">
                      {applyUrl && (
                        <Button asChild>
                          <a
                            href={applyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Apply
                          </a>
                        </Button>
                      )}
                      <SaveOpportunityButton opportunityId={opportunity.id} />
                    </div>

                    {/* Key details grid */}
                    <dl className="mt-8 grid grid-cols-2 gap-6 border-t pt-8 sm:grid-cols-3">
                      {deadlineText && (
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-neutral-400">
                            Deadline
                          </dt>
                          <dd className="mt-1 text-sm font-medium">
                            {deadlineText}
                            {opportunity.deadline_confidence && (
                              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:bg-neutral-800">
                                {opportunity.deadline_confidence} confidence
                              </span>
                            )}
                          </dd>
                        </div>
                      )}
                      {opportunity.funding_amount && (
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-neutral-400">
                            Funding
                          </dt>
                          <dd className="mt-1 text-sm font-medium">
                            {opportunity.funding_amount}
                          </dd>
                        </div>
                      )}
                      {opportunity.country && (
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-neutral-400">
                            Country
                          </dt>
                          <dd className="mt-1 text-sm font-medium">
                            {opportunity.country}
                          </dd>
                        </div>
                      )}
                      {opportunity.eligible_education_levels &&
                        opportunity.eligible_education_levels.length > 0 && (
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-neutral-400">
                              Education
                            </dt>
                            <dd className="mt-1 text-sm font-medium">
                              {opportunity.eligible_education_levels.join(", ")}
                            </dd>
                          </div>
                        )}
                      {opportunity.eligible_fields &&
                        opportunity.eligible_fields.length > 0 && (
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-neutral-400">
                              Fields
                            </dt>
                            <dd className="mt-1 text-sm font-medium">
                              {opportunity.eligible_fields.join(", ")}
                            </dd>
                          </div>
                        )}
                      {(opportunity.effort_level || opportunity.reward_level) && (
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-neutral-400">
                            Effort / Reward
                          </dt>
                          <dd className="mt-1 text-sm font-medium capitalize">
                            {opportunity.effort_level || "—"} /{" "}
                            {opportunity.reward_level || "—"}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </CardContent>
                </Card>

                {/* ── Source & verification ──────────────────────── */}
                {trust && (
                  <Card>
                    <CardContent className="p-6">
                      <h2 className="text-xl font-semibold">
                        Source &amp; verification
                      </h2>

                      <dl className="mt-4 space-y-4 text-sm">
                        <div className="flex flex-wrap items-center gap-3">
                          <dt className="w-28 shrink-0 text-muted-foreground">
                            Source
                          </dt>
                          <dd className="flex flex-wrap items-center gap-2">
                            <SourceTrustBadge
                              category={opportunity.source_category || "unknown"}
                            />
                            {sourceDomain && <span>{sourceDomain}</span>}
                          </dd>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <dt className="w-28 shrink-0 text-muted-foreground">
                            Destination
                          </dt>
                          <dd className="flex flex-wrap items-center gap-2">
                            <DestinationConfidenceBadge
                              confidence={
                                opportunity.destination_confidence || "none"
                              }
                            />
                            <span>
                              {destinationTypeLabel(
                                opportunity.application_destination_type
                              )}
                            </span>
                          </dd>
                        </div>

                        {opportunity.application_url_quality && (
                          <div className="flex flex-wrap items-center gap-3">
                            <dt className="w-28 shrink-0 text-muted-foreground">
                              Link quality
                            </dt>
                            <dd className="capitalize">
                              {opportunity.application_url_quality.replace(
                                /_/g,
                                " "
                              )}
                            </dd>
                          </div>
                        )}

                        {applyUrl && (
                          <div className="flex flex-wrap items-start gap-3">
                            <dt className="w-28 shrink-0 text-muted-foreground">
                              Application
                            </dt>
                            <dd className="min-w-0 break-all">
                              <a
                                href={applyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-neutral-700 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
                              >
                                {applyUrl}
                              </a>
                            </dd>
                          </div>
                        )}
                      </dl>

                      <div
                        className={`mt-5 rounded-md border px-4 py-3 text-sm ${
                          trustToneClass[trust.tone]
                        }`}
                      >
                        {trust.text}
                        {trust.officialSourceUrl && (
                          <>
                            {" "}
                            <a
                              href={trust.officialSourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium underline"
                            >
                              Official source
                            </a>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {opportunity.ai_summary && (
                  <Card>
                    <CardContent className="p-6">
                      <h2 className="text-xl font-semibold">AI summary</h2>
                      <div className="mt-3 rounded-md border-l-2 border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-600 dark:bg-neutral-900">
                        <p className="leading-7 text-neutral-700 dark:text-neutral-200">
                          {opportunity.ai_summary}
                        </p>
                      </div>
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
                      Eligibility &amp; details
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
                        <p className="font-medium capitalize">
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

                      {opportunity.competitiveness_factors &&
                        opportunity.competitiveness_factors.length > 0 && (
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Competitiveness factors
                            </p>
                            <p className="font-medium">
                              {opportunity.competitiveness_factors.join(", ")}
                            </p>
                          </div>
                        )}
                    </div>
                  </CardContent>
                </Card>

                {/* ── Apply CTA ──────────────────────────────────── */}
                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-xl font-semibold">Ready to apply?</h2>
                    {applyUrl ? (
                      <>
                        <Button asChild className="mt-4">
                          <a
                            href={applyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {applyButtonLabel(opportunity)}
                          </a>
                        </Button>
                        <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-neutral-400">
                              Application type
                            </dt>
                            <dd className="mt-1">
                              {destinationTypeLabel(
                                opportunity.application_destination_type
                              )}
                            </dd>
                          </div>
                          {sourceDomain && (
                            <div>
                              <dt className="text-xs uppercase tracking-wide text-neutral-400">
                                Source
                              </dt>
                              <dd className="mt-1">{sourceDomain}</dd>
                            </div>
                          )}
                          {lastChecked && (
                            <div>
                              <dt className="text-xs uppercase tracking-wide text-neutral-400">
                                Last checked
                              </dt>
                              <dd className="mt-1">{lastChecked}</dd>
                            </div>
                          )}
                        </dl>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        No application link is available for this opportunity
                        yet. Please check the provider&apos;s website directly.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* ── AI competitiveness report ──────────────────── */}
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

                {/* Source snapshot in the sidebar */}
                <Card>
                  <CardContent className="p-6">
                    <p className="text-sm font-medium">Source snapshot</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <SourceTrustBadge
                        category={opportunity.source_category || "unknown"}
                      />
                      <DestinationConfidenceBadge
                        confidence={opportunity.destination_confidence || "none"}
                      />
                    </div>
                    {sourceDomain && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {sourceDomain}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <SaveOpportunityButton opportunityId={opportunity.id} />

                {applyUrl && (
                  <Button asChild className="w-full">
                    <a href={applyUrl} target="_blank" rel="noopener noreferrer">
                      {applyButtonLabel(opportunity)}
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
