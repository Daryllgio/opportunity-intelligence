"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { calculateCompetitivenessScore } from "@/lib/scoring";

type ExperienceEntry = {
  title?: string;
  organization?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  impact?: string;
  link?: string;
};

type AwardEntry = {
  name?: string;
  organization?: string;
  year?: string;
  description?: string;
};

type Profile = {
  nationality: string | null;
  country_of_study: string | null;
  student_status: string | null;
  school: string | null;
  school_other: string | null;
  education_level: string | null;
  field_of_study: string | null;
  field_of_study_other: string | null;
  gpa: number | null;
  languages: string[] | null;
  target_opportunity_types: string[] | null;
  leadership_experiences: ExperienceEntry[] | null;
  research_experiences: ExperienceEntry[] | null;
  volunteer_experiences: ExperienceEntry[] | null;
  work_project_experiences: ExperienceEntry[] | null;
  awards: AwardEntry[] | null;
};

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
  opportunity_id: string;
  created_at: string;
};

type ScoredOpportunity = {
  opportunity: Opportunity;
  score: ReturnType<typeof calculateCompetitivenessScore>;
};

function getSchool(profile: Profile | null) {
  if (!profile) return "";
  return profile.school === "Other"
    ? profile.school_other || ""
    : profile.school || "";
}

function getMajor(profile: Profile | null) {
  if (!profile) return "";
  return profile.field_of_study === "Other"
    ? profile.field_of_study_other || ""
    : profile.field_of_study || "";
}

function getProfileCompleteness(profile: Profile | null) {
  if (!profile) return 0;

  const fields = [
    profile.nationality,
    profile.country_of_study,
    profile.student_status,
    getSchool(profile),
    profile.education_level,
    getMajor(profile),
    profile.gpa?.toString(),
  ];

  const baseScore = fields.filter(Boolean).length / fields.length;

  const experienceCount =
    (profile.leadership_experiences?.length || 0) +
    (profile.research_experiences?.length || 0) +
    (profile.volunteer_experiences?.length || 0) +
    (profile.work_project_experiences?.length || 0) +
    (profile.awards?.length || 0);

  const experienceBonus = Math.min(0.3, experienceCount * 0.06);

  return Math.min(100, Math.round((baseScore * 0.7 + experienceBonus) * 100));
}

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

function daysUntil(deadline: string | null) {
  if (!deadline) return null;

  const today = new Date();
  const deadlineDate = new Date(`${deadline}T00:00:00`);
  const diff = deadlineDate.getTime() - today.getTime();

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getNextAction({
  profile,
  completeness,
  topMatches,
  savedCount,
}: {
  profile: Profile | null;
  completeness: number;
  topMatches: ScoredOpportunity[];
  savedCount: number;
}) {
  if (!profile) {
    return {
      title: "Build your opportunity profile",
      description:
        "Complete your profile so OppScore can calculate personalized competitiveness scores.",
      href: "/profile/edit",
      button: "Build profile",
    };
  }

  if (completeness < 70) {
    return {
      title: "Strengthen your profile details",
      description:
        "Add more complete academic and experience details so your scores become more accurate.",
      href: "/profile/edit",
      button: "Improve profile",
    };
  }

  if (topMatches.length > 0) {
    return {
      title: "Review your strongest matches",
      description:
        "Start with the highest-scoring opportunities before browsing the full database.",
      href: "/opportunities",
      button: "View top matches",
    };
  }

  if (savedCount > 0) {
    return {
      title: "Review your saved opportunities",
      description:
        "You have saved opportunities waiting for review. Check deadlines and next steps.",
      href: "/saved",
      button: "View saved",
    };
  }

  return {
    title: "Find opportunities to pursue",
    description:
      "Browse the opportunity database and save the ones you want to revisit.",
    href: "/opportunities",
    button: "Find opportunities",
  };
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [saved, setSaved] = useState<SavedOpportunity[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUserEmail(user.email || null);

      const { data: profileData } = await supabase
        .from("profiles")
        .select(
          "nationality, country_of_study, student_status, school, school_other, education_level, field_of_study, field_of_study_other, gpa, languages, target_opportunity_types, leadership_experiences, research_experiences, volunteer_experiences, work_project_experiences, awards"
        )
        .eq("id", user.id)
        .maybeSingle();

      setProfile((profileData as Profile | null) || null);

      const { data: opportunityData } = await supabase
        .from("opportunities")
        .select(
          "id, title, provider, type, description, ai_summary, country, eligible_countries, eligible_education_levels, eligible_fields, funding_amount, funding_type, deadline, effort_level, reward_level, application_url, competitiveness_factors"
        )
        .eq("is_active", true)
        .eq("is_approved", true)
        .order("deadline", { ascending: true });

      setOpportunities((opportunityData as Opportunity[]) || []);

      const { data: savedData } = await supabase
        .from("saved_opportunities")
        .select("id, opportunity_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setSaved((savedData as SavedOpportunity[]) || []);
      setLoading(false);
    }

    loadDashboard();
  }, []);

  const completeness = getProfileCompleteness(profile);

  const scoredOpportunities = useMemo(() => {
    if (!profile) return [];

    return opportunities
      .map((opportunity) => ({
        opportunity,
        score: calculateCompetitivenessScore({
          profile: profile as never,
          opportunity,
        }),
      }))
      .sort((a, b) => b.score.score - a.score.score);
  }, [opportunities, profile]);

  const topMatches = scoredOpportunities.slice(0, 3);

  const upcomingDeadlines = scoredOpportunities
    .map((item) => ({
      ...item,
      daysLeft: daysUntil(item.opportunity.deadline),
    }))
    .filter((item) => item.daysLeft !== null && item.daysLeft >= 0)
    .sort((a, b) => Number(a.daysLeft) - Number(b.daysLeft))
    .slice(0, 3);

  const nextAction = getNextAction({
    profile,
    completeness,
    topMatches,
    savedCount: saved.length,
  });

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <Badge variant="secondary">Dashboard</Badge>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                Your opportunity strategy board
              </h1>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                Start here to see what needs your attention, which matches are
                strongest, and what to do next.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href={profile ? "/profile" : "/profile/edit"}>
                  {profile ? "View profile" : "Build profile"}
                </Link>
              </Button>

              <Button asChild>
                <Link href="/opportunities">View opportunities</Link>
              </Button>
            </div>
          </div>

          {loading ? (
            <Card className="mt-8">
              <CardContent className="p-6">
                <p className="text-muted-foreground">Loading dashboard...</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="mt-8">
                <CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
                  <div>
                    <Badge variant="outline">Recommended next step</Badge>
                    <h2 className="mt-3 text-2xl font-semibold">
                      {nextAction.title}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                      {nextAction.description}
                    </p>
                  </div>

                  <Button asChild>
                    <Link href={nextAction.href}>{nextAction.button}</Link>
                  </Button>
                </CardContent>
              </Card>

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">
                      Profile completion
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold">
                      {completeness}%
                    </h2>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">Top match</p>
                    <h2 className="mt-2 text-3xl font-semibold">
                      {topMatches[0] ? `${topMatches[0].score.score}/100` : "—"}
                    </h2>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">Saved</p>
                    <h2 className="mt-2 text-3xl font-semibold">
                      {saved.length}
                    </h2>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">Plan</p>
                    <h2 className="mt-2 text-3xl font-semibold">Free</h2>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-semibold">
                          Top recommended opportunities
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Your strongest matches based on your current profile.
                        </p>
                      </div>

                      <Button asChild variant="outline">
                        <Link href="/opportunities">View all</Link>
                      </Button>
                    </div>

                    <div className="mt-5 space-y-3">
                      {!profile ? (
                        <div className="rounded-xl border border-dashed p-4">
                          <p className="text-sm text-muted-foreground">
                            Build your profile to generate opportunity matches.
                          </p>
                        </div>
                      ) : topMatches.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-4">
                          <p className="text-sm text-muted-foreground">
                            No approved opportunities found yet.
                          </p>
                        </div>
                      ) : (
                        topMatches.map(({ opportunity, score }) => (
                          <Link
                            key={opportunity.id}
                            href={`/opportunities/${opportunity.id}`}
                            className="block rounded-xl border p-4 transition hover:bg-muted/40"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <Badge variant="secondary">
                                  {formatOpportunityType(opportunity.type)}
                                </Badge>
                                <h3 className="mt-2 font-medium">
                                  {opportunity.title}
                                </h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {opportunity.provider ||
                                    "Provider not specified"}
                                </p>
                              </div>

                              <div className="text-right">
                                <p className="font-semibold">
                                  {score.score}/100
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatRecommendation(score.recommendation)}
                                </p>
                              </div>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card>
                    <CardContent className="p-6">
                      <h2 className="text-xl font-semibold">
                        Upcoming deadlines
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        The closest deadlines in your ranked list.
                      </p>

                      <div className="mt-5 space-y-3">
                        {upcomingDeadlines.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No upcoming deadlines found.
                          </p>
                        ) : (
                          upcomingDeadlines.map(({ opportunity, daysLeft }) => (
                            <Link
                              key={opportunity.id}
                              href={`/opportunities/${opportunity.id}`}
                              className="block rounded-xl border p-4 transition hover:bg-muted/40"
                            >
                              <p className="font-medium">{opportunity.title}</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {daysLeft === 0
                                  ? "Due today"
                                  : `${daysLeft} day${
                                      daysLeft === 1 ? "" : "s"
                                    } left`}
                              </p>
                            </Link>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h2 className="text-xl font-semibold">Profile summary</h2>

                      <div className="mt-5 space-y-4">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Account
                          </p>
                          <p className="font-medium">{userEmail || "—"}</p>
                        </div>

                        <div>
                          <p className="text-sm text-muted-foreground">
                            School / university
                          </p>
                          <p className="font-medium">
                            {getSchool(profile) || "—"}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm text-muted-foreground">
                            Field of study
                          </p>
                          <p className="font-medium">
                            {getMajor(profile) || "—"}
                          </p>
                        </div>

                        <Button asChild variant="outline" className="w-full">
                          <Link href={profile ? "/profile" : "/profile/edit"}>
                            {profile ? "View full profile" : "Build profile"}
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
