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
  leadership_experiences: unknown[] | null;
  research_experiences: unknown[] | null;
  volunteer_experiences: unknown[] | null;
  work_project_experiences: unknown[] | null;
  awards: unknown[] | null;
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

function getScoreBadgeVariant(score: number) {
  if (score >= 78) return "default";
  if (score >= 60) return "secondary";
  return "outline";
}

export default async function OpportunitiesPage() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: Profile | null = null;

  if (user) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select(
        "nationality, country_of_study, student_status, school, school_other, education_level, field_of_study, field_of_study_other, gpa, languages, target_opportunity_types, leadership_experiences, research_experiences, volunteer_experiences, work_project_experiences, awards"
      )
      .eq("id", user.id)
      .single();

    profile = profileData as Profile | null;
  }

  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select(
      "id, title, provider, type, description, country, eligible_countries, eligible_education_levels, eligible_fields, funding_amount, funding_type, deadline, effort_level, reward_level, application_url, competitiveness_factors"
    )
    .eq("is_active", true)
    .eq("is_approved", true)
    .order("deadline", { ascending: true });

  const scoredOpportunities =
    profile && opportunities
      ? (opportunities as Opportunity[])
          .map((opportunity) => {
            const score = calculateCompetitivenessScore({
              profile: profile as never,
              opportunity,
            });

            return {
              opportunity,
              score,
            };
          })
          .sort((a, b) => b.score.score - a.score.score)
      : [];

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <Badge variant="secondary">Opportunities</Badge>

        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Your ranked opportunities
        </h1>

        <p className="mt-3 max-w-2xl text-muted-foreground">
          Browse scholarships, research opportunities, funded conferences,
          fellowships, grants, and competitions ranked by your competitiveness.
        </p>

        {!user && (
          <Card className="mt-8">
            <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Log in to see scores</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create a profile to unlock personalized competitiveness scores.
                </p>
              </div>
              <Button asChild>
                <a href="/login">Log in</a>
              </Button>
            </CardContent>
          </Card>
        )}

        {user && !profile && (
          <Card className="mt-8">
            <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  Complete your profile first
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  OppScore needs your academic profile and experience details to
                  calculate personalized scores.
                </p>
              </div>
              <Button asChild>
                <a href="/profile">Complete profile</a>
              </Button>
            </CardContent>
          </Card>
        )}

        {error ? (
          <Card className="mt-8">
            <CardContent className="p-6">
              <p className="text-sm text-destructive">
                Could not load opportunities. Check your Supabase connection and
                table policies.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 grid gap-4">
            {profile &&
              scoredOpportunities.map(({ opportunity, score }) => (
                <Card key={opportunity.id}>
                  <CardContent className="flex flex-col justify-between gap-5 p-6 lg:flex-row lg:items-start">
                    <div className="max-w-3xl">
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

                        <Badge variant={getScoreBadgeVariant(score.score)}>
                          {score.label}
                        </Badge>
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
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">
                          {opportunity.description}
                        </p>
                      )}

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border p-4">
                          <p className="text-sm font-medium">Why this score</p>
                          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {score.reasons.slice(0, 3).map((reason) => (
                              <li key={reason}>• {reason}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="rounded-xl border p-4">
                          <p className="text-sm font-medium">Gap report</p>
                          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {score.gaps.slice(0, 3).map((gap) => (
                              <li key={gap}>• {gap}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

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
                        <span>• Confidence: {score.confidence}</span>
                      </div>
                    </div>

                    <div className="flex min-w-48 flex-col gap-3">
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

                      {opportunity.application_url ? (
                        <Button asChild variant="outline">
                          <a
                            href={opportunity.application_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View opportunity
                          </a>
                        </Button>
                      ) : (
                        <Button variant="outline">View opportunity</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

            {profile && scoredOpportunities.length === 0 && (
              <Card>
                <CardContent className="p-6">
                  <p className="text-muted-foreground">
                    No approved opportunities found yet.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
