"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { OpportunityCard } from "@/components/ui/opportunity-card";
import { supabase } from "@/lib/supabase";
import { getPlanLimits } from "@/lib/billing/plans";

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
  subscription_plan: string | null;
  leadership_experiences: unknown[] | null;
  research_experiences: unknown[] | null;
  volunteer_experiences: unknown[] | null;
  work_project_experiences: unknown[] | null;
  awards: unknown[] | null;
};

type Opportunity = {
  id: string;
  title: string;
  provider: string | null;
  type: string;
  deadline: string | null;
  application_status: string | null;
  funding_amount: string | null;
  country: string | null;
  created_at: string | null;
};

type ScoreRow = { opportunity_id: string; score: number | null };

function daysUntil(deadline: string | null) {
  if (!deadline) return null;
  const due = new Date(deadline);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - Date.now()) / 86400000);
}

function deadlineLabel(deadline: string | null) {
  const days = daysUntil(deadline);
  if (days === null) return "No deadline";
  if (days < 0) return "Closed";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days} days left`;
}

function deadlineDot(deadline: string | null) {
  const days = daysUntil(deadline);
  if (days === null || days < 0) return "bg-neutral-300";
  if (days < 7) return "bg-red-400";
  if (days <= 14) return "bg-amber-400";
  return "bg-green-500";
}

// Completion is computed from actual profile fields — there is no
// profile_completion column in the database.
function getProfileCompletion(profile: Profile | null) {
  if (!profile) return 0;

  const school = profile.school === "Other" ? profile.school_other : profile.school;
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
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [savedRows, setSavedRows] = useState<
    Array<{ opportunity: Opportunity }>
  >([]);
  const [newThisWeek, setNewThisWeek] = useState(0);
  const [gapReportsRemaining, setGapReportsRemaining] = useState<number | null>(
    null
  );

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const name =
        user.user_metadata?.first_name ||
        String(user.user_metadata?.full_name || "").split(" ")[0] ||
        null;
      setFirstName(name);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      setProfile(profileData as Profile | null);

      const planLimits = getPlanLimits(profileData?.subscription_plan);

      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const today = new Date().toISOString().slice(0, 10);

      const [
        { data: opportunityData },
        { data: scoreData },
        { data: savedData },
        { count: freshCount },
        { data: usage },
      ] = await Promise.all([
        supabase
          .from("opportunities")
          .select(
            "id, title, provider, type, deadline, application_status, funding_amount, country, created_at"
          )
          .eq("is_active", true)
          .eq("is_approved", true)
          .eq("lifecycle_status", "active")
          .or(`deadline.gte.${today},and(deadline.is.null,application_status.eq.rolling)`)
          .limit(400),
        supabase
          .from("opportunity_competitiveness_scores")
          .select("opportunity_id, score")
          .eq("user_id", user.id)
          .eq("score_status", "current"),
        supabase
          .from("saved_opportunities")
          .select(
            "opportunities!inner (id, title, provider, type, deadline, application_status, funding_amount, country, created_at, lifecycle_status)"
          )
          .eq("user_id", user.id),
        supabase
          .from("opportunities")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true)
          .eq("is_approved", true)
          .eq("lifecycle_status", "active")
          .gte("created_at", weekAgo),
        supabase
          .from("user_ai_usage")
          .select("gap_reports_used")
          .eq("user_id", user.id)
          .eq(
            "usage_month",
            `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`
          )
          .maybeSingle(),
      ]);

      setOpportunities((opportunityData || []) as Opportunity[]);

      const map: Record<string, number> = {};
      for (const row of (scoreData || []) as ScoreRow[]) {
        if (typeof row.score === "number") map[row.opportunity_id] = row.score;
      }
      setScores(map);

      const saved = ((savedData || []) as Array<Record<string, unknown>>)
        .map((row) => {
          const opportunity = Array.isArray(row.opportunities)
            ? row.opportunities[0]
            : row.opportunities;
          return opportunity as Opportunity & { lifecycle_status?: string };
        })
        .filter((o) => o && o.lifecycle_status === "active")
        .map((opportunity) => ({ opportunity }));
      setSavedRows(saved);

      setNewThisWeek(freshCount || 0);

      if (planLimits.hasGapReports) {
        const used = (usage as { gap_reports_used?: number } | null)?.gap_reports_used || 0;
        setGapReportsRemaining(Math.max(0, planLimits.gapReports - used));
      }

      setLoading(false);
    }

    load();
  }, []);

  const topMatches = useMemo(() => {
    return opportunities
      .filter((o) => scores[o.id] !== undefined)
      .sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0))
      .slice(0, 6);
  }, [opportunities, scores]);

  const upcomingSaved = useMemo(() => {
    return savedRows
      .filter(({ opportunity }) => {
        const days = daysUntil(opportunity.deadline);
        return days !== null && days >= 0 && days <= 30;
      })
      .sort(
        (a, b) =>
          (daysUntil(a.opportunity.deadline) ?? 999) -
          (daysUntil(b.opportunity.deadline) ?? 999)
      )
      .slice(0, 5);
  }, [savedRows]);

  const completion = getProfileCompletion(profile);

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-950">
        <AppNav />
        <main className="mx-auto max-w-5xl px-6 py-10">
          <div className="h-8 w-64 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-44 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900"
              />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="animate-fade-up">
          <h1 className="text-2xl font-semibold tracking-tight">
            {firstName ? `Good to see you, ${firstName}` : "Your dashboard"}
          </h1>
          <p className="mt-1 text-[15px] text-neutral-500 dark:text-neutral-400">
            {newThisWeek > 0
              ? `${newThisWeek} new opportunit${newThisWeek === 1 ? "y" : "ies"} discovered this week.`
              : "Here's where your opportunities stand."}
          </p>
        </header>

        {/* Stat strip */}
        <div className="animate-fade-up stagger-1 mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 sm:grid-cols-4 dark:border-neutral-800 dark:bg-neutral-800">
          {[
            {
              label: "Top matches",
              value: opportunities.filter((o) => scores[o.id] !== undefined).length,
              accent: true,
            },
            { label: "Saved", value: savedRows.length },
            {
              label: "Deadlines soon",
              value: savedRows.filter(({ opportunity }) => {
                const days = daysUntil(opportunity.deadline);
                return days !== null && days >= 0 && days <= 30;
              }).length,
            },
            {
              label: "Reports left",
              value: gapReportsRemaining === null ? "–" : gapReportsRemaining,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white px-5 py-4 dark:bg-neutral-950"
            >
              <p
                className={`text-2xl font-semibold tabular-nums ${
                  stat.accent ? "text-primary" : ""
                }`}
              >
                {stat.value}
              </p>
              <p className="mt-0.5 text-xs font-medium text-neutral-400">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* Profile completion prompt — shown only while incomplete */}
        {profile && completion < 80 && (
          <div className="mt-8 flex flex-col justify-between gap-4 rounded-lg border border-neutral-200 p-5 sm:flex-row sm:items-center dark:border-neutral-800">
            <div>
              <p className="text-sm font-medium">
                Your profile is {completion}% complete
              </p>
              <p className="mt-0.5 text-sm text-neutral-500">
                A fuller profile means sharper match scores and better reports.
              </p>
            </div>
            <Link
              href="/profile/edit"
              className="shrink-0 rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Finish profile
            </Link>
          </div>
        )}

        {!profile && (
          <div className="mt-8 rounded-lg border border-neutral-200 p-8 text-center dark:border-neutral-800">
            <h2 className="text-lg font-semibold">Welcome to OppScore</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
              Set up your profile to unlock personalized matches. It takes a
              few minutes.
            </p>
            <Link
              href="/onboarding"
              className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Get started
            </Link>
          </div>
        )}

        {/* Top matches */}
        <section className="mt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Your top matches</h2>
            <Link
              href="/opportunities"
              className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              View all
            </Link>
          </div>

          {topMatches.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-neutral-200 p-8 text-center dark:border-neutral-800">
              <p className="text-sm text-neutral-500">
                {profile
                  ? "Your matches are being scored. Check back shortly, or browse everything now."
                  : "Set up your profile to see scored matches."}
              </p>
              <Link
                href="/opportunities"
                className="mt-3 inline-block text-sm font-medium underline underline-offset-2"
              >
                Browse opportunities
              </Link>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {topMatches.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  id={opportunity.id}
                  title={opportunity.title}
                  provider={opportunity.provider}
                  type={opportunity.type}
                  deadline={opportunity.deadline}
                  applicationStatus={opportunity.application_status}
                  fundingAmount={opportunity.funding_amount}
                  country={opportunity.country}
                  createdAt={opportunity.created_at}
                  score={scores[opportunity.id]}
                />
              ))}
            </div>
          )}
        </section>

        {/* Upcoming deadlines */}
        <section className="mt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Upcoming deadlines</h2>
            <Link
              href="/saved"
              className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              All saved
            </Link>
          </div>

          {upcomingSaved.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-500">
              No saved opportunities due in the next 30 days.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-900">
              {upcomingSaved.map(({ opportunity }) => (
                <li key={opportunity.id}>
                  <Link
                    href={`/opportunities/${opportunity.id}`}
                    className="flex items-center justify-between gap-4 py-3.5 hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {opportunity.title}
                      </p>
                      {opportunity.provider && (
                        <p className="truncate text-sm text-neutral-400">
                          {opportunity.provider}
                        </p>
                      )}
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-neutral-500">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${deadlineDot(opportunity.deadline)}`}
                        aria-hidden="true"
                      />
                      {deadlineLabel(opportunity.deadline)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Quiet footer note: remaining reports */}
        {gapReportsRemaining !== null && (
          <p className="mt-16 text-xs text-neutral-400">
            {gapReportsRemaining} competitiveness report
            {gapReportsRemaining === 1 ? "" : "s"} remaining this month.
          </p>
        )}
      </main>
    </div>
  );
}
