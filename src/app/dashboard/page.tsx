"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

type ExperienceEntry = Record<string, unknown>;

type Profile = {
  id: string;
  full_name: string | null;
  field_of_study: string | null;
  field_of_study_other: string | null;
  education_level: string | null;
  school: string | null;
  school_other: string | null;
  student_status: string | null;
  gpa: number | null;
  country_of_study: string | null;
  nationality: string | null;
  languages: string[] | null;
  target_opportunity_types: string[] | null;
  subscription_plan: string | null;
  leadership_experiences: ExperienceEntry[] | null;
  research_experiences: ExperienceEntry[] | null;
  volunteer_experiences: ExperienceEntry[] | null;
  work_project_experiences: ExperienceEntry[] | null;
  awards: ExperienceEntry[] | null;
};

type Opportunity = {
  id: string;
  title: string;
  provider: string | null;
  type: string;
  ai_summary: string | null;
  country: string | null;
  funding_amount: string | null;
  deadline: string | null;
  effort_level: string | null;
  reward_level: string | null;
  eligible_education_levels: string[] | null;
  eligible_fields: string[] | null;
  competitiveness_factors: string[] | null;
};

type SavedOpportunity = {
  id: string;
  opportunity_id: string;
  opportunities: Opportunity | null;
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

function formatType(type: string | null) {
  if (!type) return "Opportunity";

  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function daysUntil(deadline: string | null) {
  if (!deadline) return null;

  const today = new Date();
  const due = new Date(deadline);
  const diff = due.getTime() - today.getTime();

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getDeadlineLabel(deadline: string | null) {
  const days = daysUntil(deadline);

  if (days === null) return "No deadline listed";
  if (days < 0) return "Deadline passed";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days} days left`;
}

// Urgency dot for an upcoming deadline: red <7 days, amber 7-14, green after.
function getDeadlineDotColor(deadline: string | null) {
  const days = daysUntil(deadline);
  if (days === null || days < 0) return "bg-neutral-300";
  if (days < 7) return "bg-red-400";
  if (days <= 14) return "bg-amber-400";
  return "bg-green-500";
}

function DeadlineLabel({ deadline }: { deadline: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <span
        className={`h-1.5 w-1.5 rounded-full ${getDeadlineDotColor(deadline)}`}
        aria-hidden="true"
      />
      {getDeadlineLabel(deadline)}
    </span>
  );
}

function getPlanLabel(plan: string | null | undefined) {
  if (plan === "pro") return "Pro";
  if (plan === "premium") return "Premium";
  return "Free";
}

// Completion is computed from actual profile fields — there is no
// profile_completion column in the database.
function getProfileCompletion(profile: Profile | null) {
  if (!profile) return 0;

  const school =
    profile.school === "Other" ? profile.school_other : profile.school;
  const major =
    profile.field_of_study === "Other"
      ? profile.field_of_study_other
      : profile.field_of_study;

  const fields = [
    profile.nationality,
    profile.country_of_study,
    profile.student_status,
    school,
    profile.education_level,
    major,
    profile.gpa?.toString(),
  ];

  const base = fields.filter(Boolean).length / fields.length;

  const evidenceCount =
    (profile.leadership_experiences?.length || 0) +
    (profile.research_experiences?.length || 0) +
    (profile.volunteer_experiences?.length || 0) +
    (profile.work_project_experiences?.length || 0) +
    (profile.awards?.length || 0);

  return Math.min(
    100,
    Math.round((base * 0.75 + Math.min(0.25, evidenceCount * 0.05)) * 100)
  );
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [competitivenessScores, setCompetitivenessScores] = useState<
    CompetitivenessScore[]
  >([]);
  const [saved, setSaved] = useState<SavedOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      const { data: opportunityData } = await supabase
        .from("opportunities")
        .select(
          "id, title, provider, type, ai_summary, country, funding_amount, deadline, effort_level, reward_level, eligible_education_levels, eligible_fields, competitiveness_factors"
        )
        .eq("is_active", true)
        .eq("is_approved", true)
        .eq("lifecycle_status", "active")
        .in("type", [
          "scholarship",
          "research_program",
          "fellowship",
          "competition",
          "leadership_program",
        ])
        .order("deadline", { ascending: true, nullsFirst: false })
        .limit(20);

      const { data: savedData } = await supabase
        .from("saved_opportunities")
        .select(
          `
          id,
          opportunity_id,
          opportunities (
            id,
            title,
            provider,
            type,
            ai_summary,
            country,
            funding_amount,
            deadline,
            effort_level,
            reward_level,
            eligible_education_levels,
            eligible_fields,
            competitiveness_factors,
            lifecycle_status
          )
        `
        )
        .eq("user_id", user.id)
        .limit(6);

      const { data: scoreData } = await supabase
        .from("opportunity_competitiveness_scores")
        .select("opportunity_id, score, fit_label, model_used, updated_at, score_status")
        .eq("user_id", user.id)
        .eq("score_status", "current");

      const normalizedSaved = ((savedData ?? []) as unknown as Array<
        Record<string, unknown>
      >).map((savedItem) => ({
        ...savedItem,
        opportunities: Array.isArray(savedItem.opportunities)
          ? savedItem.opportunities[0] || null
          : savedItem.opportunities,
      }));

      setProfile(profileData as Profile | null);
      setOpportunities((opportunityData || []) as Opportunity[]);
      setCompetitivenessScores((scoreData || []) as CompetitivenessScore[]);
      setSaved(normalizedSaved as unknown as SavedOpportunity[]);
      setLoading(false);
    }

    loadDashboard();
  }, []);

  const opportunitiesWithScores = useMemo(() => {
    const scoreMap = new Map<string, CompetitivenessScore>();

    competitivenessScores.forEach((score) => {
      scoreMap.set(score.opportunity_id, score);
    });

    return opportunities.map((opportunity) => ({
      opportunity,
      score: scoreMap.get(opportunity.id) || null,
    }));
  }, [opportunities, competitivenessScores]);

  const scoredOpportunities = useMemo(() => {
    return opportunitiesWithScores
      .filter((item): item is { opportunity: Opportunity; score: CompetitivenessScore } =>
        Boolean(item.score)
      )
      .sort((a, b) => b.score.score - a.score.score);
  }, [opportunitiesWithScores]);

  const topMatches = scoredOpportunities.slice(0, 3);

  const urgentOpportunities = scoredOpportunities
    .filter(({ opportunity }) => {
      const days = daysUntil(opportunity.deadline);
      return days !== null && days >= 0 && days <= 30;
    })
    .slice(0, 3);

  const improveFirst = scoredOpportunities
    .filter(({ score }) => score.score < 45)
    .slice(0, 3);

  const savedOpportunities = saved
    .map((item) => item.opportunities)
    .filter(Boolean) as Opportunity[];

  const profileCompletion = getProfileCompletion(profile);
  const subscriptionPlan = profile?.subscription_plan || "free";
  const planLabel = getPlanLabel(subscriptionPlan);
  const paidPlan = subscriptionPlan === "pro" || subscriptionPlan === "premium";

  const nextActions = [
    profileCompletion < 80
      ? {
          title: "Complete your profile",
          description:
            "Add more details about your background so OppScore can rank opportunities more accurately.",
          href: "/profile",
          cta: "Edit profile",
        }
      : null,
    topMatches.length > 0
      ? {
          title: "Review your top match",
          description:
            "Start with the highest-ranked opportunity and decide whether to save or apply.",
          href: `/opportunities/${topMatches[0].opportunity.id}`,
          cta: "View match",
        }
      : null,
    savedOpportunities.length > 0
      ? {
          title: "Revisit saved opportunities",
          description:
            "Check deadlines and decide which saved opportunities are worth applying to this week.",
          href: "/saved",
          cta: "Open saved",
        }
      : null,
  ].filter(Boolean) as {
    title: string;
    description: string;
    href: string;
    cta: string;
  }[];

  if (loading) {
    return (
      <main className="min-h-screen bg-background">
        <AppNav />
        <section className="px-6 py-8">
          <div className="mx-auto max-w-7xl">
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground">Loading dashboard...</p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight">
                Opportunity Dashboard
              </h1>

              <p className="mt-3 max-w-3xl text-muted-foreground">
                Track your best matches, saved opportunities, deadlines, and
                next steps from one place.
              </p>
            </div>

            <Button asChild>
              <Link href="/opportunities">Browse opportunities</Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">
                  Profile completion
                </p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {profileCompletion}%
                </h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  Better profiles improve ranking quality.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Top matches</p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {topMatches.length}
                </h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  Best-ranked opportunities available now.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Saved</p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {savedOpportunities.length}
                </h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  Opportunities you marked for later.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">
                  Deadlines soon
                </p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {urgentOpportunities.length}
                </h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  Due within the next 30 days.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardContent className="p-6">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Current plan</p>
                  <h2 className="mt-1 text-2xl font-semibold">{planLabel}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {paidPlan
                      ? "OppScore evaluates eligible opportunities against your profile so you can focus on applications worth prioritizing."
                      : "Free users can browse the opportunity database and save opportunities. Upgrade to unlock competitiveness scores and gap reports."}
                  </p>
                </div>

                {!paidPlan && (
                  <Button asChild variant="outline">
                    <Link href="/pricing">View plans</Link>
                  </Button>
                )}
              </div>

            </CardContent>
          </Card>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.75fr]">
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                    <div>
                      <h2 className="text-2xl font-semibold">Top matches</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Start here when deciding what to apply to next.
                      </p>
                    </div>

                    <Button asChild variant="outline">
                      <Link href="/opportunities">View all</Link>
                    </Button>
                  </div>

                  <div className="mt-5 space-y-3">
                    {topMatches.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No scored matches yet. Generate competitiveness scores
                        from the admin scoring tool or browse opportunities.
                      </p>
                    ) : (
                      topMatches.map(({ opportunity, score }) => (
                        <div
                          key={opportunity.id}
                          className="rounded-xl border p-4"
                        >
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-3">
                                <Badge variant="outline">
                                  {formatType(opportunity.type)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {score.fit_label}
                                </span>
                                {opportunity.deadline && (
                                  <DeadlineLabel deadline={opportunity.deadline} />
                                )}
                              </div>

                              <h3 className="mt-3 text-lg font-semibold">
                                {opportunity.title}
                              </h3>

                              <p className="mt-1 text-sm text-muted-foreground">
                                {opportunity.provider || "Provider not specified"}
                                {opportunity.funding_amount
                                  ? ` · ${opportunity.funding_amount}`
                                  : ""}
                              </p>

                              {opportunity.ai_summary && (
                                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                                  {opportunity.ai_summary}
                                </p>
                              )}
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-xs text-muted-foreground">
                                Score
                              </p>
                              <p className="text-xl font-semibold">
                                {score.score}
                              </p>
                            </div>
                          </div>

                          <Button asChild className="mt-4" variant="outline">
                            <Link href={`/opportunities/${opportunity.id}`}>
                              View details
                            </Link>
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h2 className="text-2xl font-semibold">Upcoming deadlines</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Opportunities that may need attention soon.
                  </p>

                  <div className="mt-5 space-y-3">
                    {urgentOpportunities.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No upcoming deadlines in the next 30 days.
                      </p>
                    ) : (
                      urgentOpportunities.map(({ opportunity, score }) => (
                        <div
                          key={opportunity.id}
                          className="flex flex-col justify-between gap-3 rounded-xl border p-4 md:flex-row md:items-center"
                        >
                          <div>
                            <h3 className="font-medium">{opportunity.title}</h3>
                            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                              <DeadlineLabel deadline={opportunity.deadline} />
                              <span>· Score {score.score}</span>
                            </p>
                          </div>

                          <Button asChild variant="outline">
                            <Link href={`/opportunities/${opportunity.id}`}>
                              Open
                            </Link>
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-2xl font-semibold">Recommended actions</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The next few things that can improve your outcomes.
                  </p>

                  <div className="mt-5 space-y-3">
                    {nextActions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        You are in good shape. Keep reviewing new matches.
                      </p>
                    ) : (
                      nextActions.map((action) => (
                        <div
                          key={action.title}
                          className="border-b border-neutral-100 pb-4 last:border-b-0 last:pb-0 dark:border-neutral-800"
                        >
                          <h3 className="text-sm font-medium">{action.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            {action.description}
                          </p>
                          <Link
                            href={action.href}
                            className="mt-2 inline-block text-sm font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
                          >
                            {action.cta}
                          </Link>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h2 className="text-2xl font-semibold">Saved opportunities</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Opportunities you wanted to revisit.
                  </p>

                  <div className="mt-5 space-y-3">
                    {savedOpportunities.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No saved opportunities yet.
                      </p>
                    ) : (
                      savedOpportunities.slice(0, 4).map((opportunity) => (
                        <div key={opportunity.id} className="rounded-xl border p-4">
                          <h3 className="font-medium">{opportunity.title}</h3>
                          <p className="mt-1">
                            <DeadlineLabel deadline={opportunity.deadline} />
                          </p>
                          <Button asChild className="mt-4" variant="outline">
                            <Link href={`/opportunities/${opportunity.id}`}>
                              View
                            </Link>
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  <Button asChild className="mt-5" variant="outline">
                    <Link href="/saved">Open saved page</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h2 className="text-2xl font-semibold">Improve first</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    These may require stronger profile evidence before applying.
                  </p>

                  <div className="mt-5 space-y-3">
                    {improveFirst.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No improve-first matches right now.
                      </p>
                    ) : (
                      improveFirst.map(({ opportunity, score }) => (
                        <div key={opportunity.id} className="rounded-xl border p-4">
                          <h3 className="font-medium">{opportunity.title}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Score {score.score} · Improve profile before applying.
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
