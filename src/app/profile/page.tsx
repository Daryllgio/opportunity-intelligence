"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

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

function getInitials(name: string | null, email: string | null) {
  const source = name || email || "OppScore Student";
  const parts = source.trim().split(/\s+/);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function getDisplayName({
  metadataName,
  email,
}: {
  metadataName: string | null;
  email: string | null;
}) {
  if (metadataName && metadataName.trim()) return metadataName;
  if (email) return email.split("@")[0];
  return "Student";
}

function getSchool(profile: Profile | null) {
  if (!profile) return "—";
  return profile.school === "Other"
    ? profile.school_other || "—"
    : profile.school || "—";
}

function getMajor(profile: Profile | null) {
  if (!profile) return "—";
  return profile.field_of_study === "Other"
    ? profile.field_of_study_other || "—"
    : profile.field_of_study || "—";
}

function getExperienceCount(profile: Profile | null) {
  if (!profile) return 0;

  return (
    (profile.leadership_experiences?.length || 0) +
    (profile.research_experiences?.length || 0) +
    (profile.volunteer_experiences?.length || 0) +
    (profile.work_project_experiences?.length || 0)
  );
}

function getCompleteness(profile: Profile | null) {
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

  const base = fields.filter((field) => field && field !== "—").length / fields.length;

  const evidenceCount =
    getExperienceCount(profile) + (profile.awards?.length || 0);

  return Math.min(
    100,
    Math.round((base * 0.75 + Math.min(0.25, evidenceCount * 0.05)) * 100)
  );
}

function getReadinessItems(profile: Profile | null) {
  if (!profile) return [];

  const hasAcademic =
    Boolean(profile.nationality) &&
    Boolean(profile.country_of_study) &&
    Boolean(profile.student_status) &&
    Boolean(getSchool(profile) !== "—") &&
    Boolean(profile.education_level) &&
    Boolean(getMajor(profile) !== "—");

  const hasPreferences =
    Boolean(profile.languages?.length) &&
    Boolean(profile.target_opportunity_types?.length);

  const hasExperienceEvidence = getExperienceCount(profile) > 0;
  const hasAwards = Boolean(profile.awards?.length);

  return [
    {
      label: "Academic information",
      complete: hasAcademic,
      help: hasAcademic
        ? "Your academic profile has the basics needed for matching."
        : "Add nationality, country of study, school, education level, and major.",
    },
    {
      label: "Preferences",
      complete: hasPreferences,
      help: hasPreferences
        ? "Your opportunity preferences and languages are set."
        : "Add languages and opportunity preferences to improve default recommendations.",
    },
    {
      label: "Experience evidence",
      complete: hasExperienceEvidence,
      help: hasExperienceEvidence
        ? "Your profile includes experience evidence for scoring."
        : "Add leadership, research, volunteer, or work/project experience.",
    },
    {
      label: "Awards & honors",
      complete: hasAwards,
      help: hasAwards
        ? "Awards and honors are included in your scoring profile."
        : "Add awards if you have them. This is optional but can strengthen some matches.",
    },
  ];
}

function ExperienceSection({
  title,
  entries,
}: {
  title: string;
  entries?: ExperienceEntry[] | null;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-xl font-semibold">{title}</h2>

        {!entries || entries.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No entries added yet.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {entries.map((entry, index) => (
              <div key={index} className="rounded-xl border p-4">
                <h3 className="font-medium">{entry.title || "Untitled role"}</h3>
                <p className="text-sm text-muted-foreground">
                  {entry.organization || "Organization not specified"}
                  {(entry.startDate || entry.endDate) &&
                    ` · ${entry.startDate || "Start"} - ${
                      entry.endDate || "Present"
                    }`}
                </p>

                {entry.description && (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {entry.description}
                  </p>
                )}

                {entry.impact && (
                  <p className="mt-2 text-sm leading-6">
                    <span className="font-medium">Impact: </span>
                    {entry.impact}
                  </p>
                )}

                {entry.link && (
                  <a
                    href={entry.link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm underline"
                  >
                    View link
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AwardsSection({ awards }: { awards?: AwardEntry[] | null }) {
  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-xl font-semibold">Awards & honors</h2>

        {!awards || awards.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No awards added yet.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {awards.map((award, index) => (
              <div key={index} className="rounded-xl border p-4">
                <h3 className="font-medium">{award.name || "Untitled award"}</h3>
                <p className="text-sm text-muted-foreground">
                  {award.organization || "Organization not specified"}
                  {award.year && ` · ${award.year}`}
                </p>

                {award.description && (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {award.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [metadataName, setMetadataName] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setEmail(user.email || null);

      const fullName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.user_metadata?.display_name ||
        null;

      setMetadataName(fullName);

      const { data } = await supabase
        .from("profiles")
        .select(
          "nationality, country_of_study, student_status, school, school_other, education_level, field_of_study, field_of_study_other, gpa, languages, target_opportunity_types, leadership_experiences, research_experiences, volunteer_experiences, work_project_experiences, awards"
        )
        .eq("id", user.id)
        .single();

      setProfile(data as Profile | null);
      setLoading(false);
    }

    loadProfile();
  }, []);

  const completeness = getCompleteness(profile);
  const school = getSchool(profile);
  const major = getMajor(profile);
  const displayName = getDisplayName({ metadataName, email });
  const readinessItems = getReadinessItems(profile);

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          {loading ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground">Loading profile...</p>
              </CardContent>
            </Card>
          ) : !profile ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col gap-4 p-8 md:flex-row md:items-center md:justify-between">
                <div>
                  <Badge variant="secondary">Profile</Badge>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                    You have not built your opportunity profile yet.
                  </h1>
                  <p className="mt-3 max-w-2xl text-muted-foreground">
                    Create your profile so OppScore can rank opportunities based
                    on your background and experience.
                  </p>
                </div>

                <Button asChild>
                  <Link href="/profile/edit">Build profile</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardContent className="p-8">
                  <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                    <div className="flex gap-5">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border bg-muted text-2xl font-semibold">
                        {getInitials(displayName, email)}
                      </div>

                      <div>
                        <Badge variant="secondary">Opportunity Profile</Badge>
                        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                          {displayName}
                        </h1>
                        <p className="mt-2 text-lg text-muted-foreground">
                          {major} · {profile.education_level || "Student"}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {school} · {profile.country_of_study || "Country not set"}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {profile.student_status && (
                            <Badge variant="outline">{profile.student_status}</Badge>
                          )}
                          {profile.nationality && (
                            <Badge variant="outline">
                              Nationality: {profile.nationality}
                            </Badge>
                          )}
                          {profile.gpa && (
                            <Badge variant="outline">
                              GPA: {profile.gpa.toFixed(2)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button asChild variant="outline">
                        <Link href="/profile/edit">Edit profile</Link>
                      </Button>
                      <Button asChild>
                        <Link href="/opportunities">View matches</Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-4">
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
                    <p className="text-sm text-muted-foreground">Languages</p>
                    <h2 className="mt-2 text-3xl font-semibold">
                      {profile.languages?.length || 0}
                    </h2>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">
                      Experience entries
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold">
                      {getExperienceCount(profile)}
                    </h2>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">Awards</p>
                    <h2 className="mt-2 text-3xl font-semibold">
                      {profile.awards?.length || 0}
                    </h2>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-xl font-semibold">Score readiness</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      These sections affect how accurately OppScore can evaluate
                      your competitiveness.
                    </p>

                    <div className="mt-5 space-y-4">
                      {readinessItems.map((item) => (
                        <div key={item.label} className="rounded-xl border p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">{item.label}</p>
                            <Badge variant={item.complete ? "secondary" : "outline"}>
                              {item.complete ? "Complete" : "Needs work"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {item.help}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-xl font-semibold">Preferences</h2>

                    <div className="mt-5 space-y-5">
                      <div>
                        <p className="text-sm text-muted-foreground">Languages</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {profile.languages && profile.languages.length > 0 ? (
                            profile.languages.map((language) => (
                              <Badge key={language} variant="outline">
                                {language}
                              </Badge>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">—</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">
                          Opportunity preferences
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {profile.target_opportunity_types &&
                          profile.target_opportunity_types.length > 0 ? (
                            profile.target_opportunity_types.map((type) => (
                              <Badge key={type} variant="outline">
                                {type}
                              </Badge>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">—</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">
                          Account email
                        </p>
                        <p className="mt-1 font-medium">{email || "—"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6">
                <ExperienceSection
                  title="Leadership experience"
                  entries={profile.leadership_experiences}
                />

                <ExperienceSection
                  title="Research experience"
                  entries={profile.research_experiences}
                />

                <ExperienceSection
                  title="Volunteer experience"
                  entries={profile.volunteer_experiences}
                />

                <ExperienceSection
                  title="Work / project experience"
                  entries={profile.work_project_experiences}
                />

                <AwardsSection awards={profile.awards} />
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
