"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
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
  citizenships?: string[] | null;
  country_of_study: string | null;
  state_or_province?: string | null;
  student_status: string | null;
  school: string | null;
  school_other: string | null;
  intended_school?: string | null;
  education_level: string | null;
  class_standing?: string | null;
  field_of_study: string | null;
  field_of_study_other: string | null;
  field_of_study_secondary?: string | null;
  gpa: number | null;
  gpa_scale?: string | null;
  languages: string[] | null;
  first_generation?: boolean | null;
  demographic_tags?: string[] | null;
  target_opportunity_types: string[] | null;
  leadership_experiences: ExperienceEntry[] | null;
  research_experiences: ExperienceEntry[] | null;
  volunteer_experiences: ExperienceEntry[] | null;
  work_project_experiences: ExperienceEntry[] | null;
  awards: AwardEntry[] | null;
};

function getSchool(profile: Profile | null) {
  if (!profile) return null;
  return profile.school === "Other" ? profile.school_other : profile.school;
}

function getMajor(profile: Profile | null) {
  if (!profile) return null;
  return profile.field_of_study === "Other"
    ? profile.field_of_study_other
    : profile.field_of_study;
}

function formatTypeLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{value || "-"}</dd>
    </div>
  );
}

function ExperienceList({
  title,
  entries,
}: {
  title: string;
  entries?: ExperienceEntry[] | null;
}) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="mt-8">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-4">
        {entries.map((entry, index) => (
          <li key={index} className="border-l-2 border-neutral-100 pl-4 dark:border-neutral-800">
            <p className="text-sm font-medium">{entry.title || "Untitled"}</p>
            {(entry.organization || entry.startDate) && (
              <p className="text-sm text-neutral-400">
                {entry.organization}
                {(entry.startDate || entry.endDate) &&
                  ` · ${entry.startDate || "Start"} – ${entry.endDate || "Present"}`}
              </p>
            )}
            {entry.description && (
              <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                {entry.description}
              </p>
            )}
            {entry.impact && (
              <p className="mt-1 whitespace-pre-line text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                <span className="font-medium text-neutral-800 dark:text-neutral-100">
                  Impact:
                </span>{" "}
                {entry.impact}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState<string>("Student");

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setDisplayName(
        user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Student"
      );

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      setProfile(data as Profile | null);
      setLoading(false);
    }

    load();
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {loading ? (
          <div className="space-y-4">
            <div className="h-8 w-56 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
            <div className="h-40 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
          </div>
        ) : !profile ? (
          <div className="rounded-lg border border-dashed border-neutral-200 p-10 text-center dark:border-neutral-800">
            <h1 className="text-xl font-semibold">No profile yet</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
              Your profile powers matching, scoring, and reports.
            </p>
            <Link
              href="/onboarding"
              className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Set up your profile
            </Link>
          </div>
        ) : (
          <>
            <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {displayName}
                </h1>
                <p className="mt-1 text-[15px] text-neutral-500">
                  {[getMajor(profile), profile.education_level, getSchool(profile)]
                    .filter(Boolean)
                    .join(" · ") || "Profile"}
                </p>
              </div>
              <Link
                href="/profile/edit"
                className="shrink-0 rounded-lg border border-neutral-200 px-4 py-2 text-center text-sm font-medium hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
              >
                Edit profile
              </Link>
            </header>

            <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-neutral-100 py-8 sm:grid-cols-3 dark:border-neutral-900">
              <Field
                label="Citizenship"
                value={
                  Array.from(
                    new Set(
                      [profile.nationality, ...(profile.citizenships || [])].filter(
                        Boolean
                      )
                    )
                  ).join(", ") || null
                }
              />
              <Field
                label="Studying in"
                value={
                  [profile.state_or_province, profile.country_of_study]
                    .filter(Boolean)
                    .join(", ") || null
                }
              />
              <Field label="Status" value={profile.student_status} />
              <Field
                label="Level"
                value={
                  [profile.education_level, profile.class_standing]
                    .filter(Boolean)
                    .join(" · ") || null
                }
              />
              <Field
                label="GPA"
                value={
                  profile.gpa
                    ? `${profile.gpa_scale === "percentage" ? `${profile.gpa}%` : profile.gpa.toFixed(2)}${
                        profile.gpa_scale && profile.gpa_scale !== "4.0" && profile.gpa_scale !== "percentage"
                          ? ` (${profile.gpa_scale} scale)`
                          : ""
                      }`
                    : null
                }
              />
              <Field
                label="Languages"
                value={profile.languages?.length ? profile.languages.join(", ") : null}
              />
              <Field
                label="Major"
                value={
                  [
                    profile.field_of_study === "Other"
                      ? profile.field_of_study_other
                      : profile.field_of_study,
                    profile.field_of_study_secondary,
                  ]
                    .filter(Boolean)
                    .join(" + ") || null
                }
              />
              <Field label="School" value={getSchool(profile)} />
              {profile.intended_school && (
                <Field label="Transferring to" value={profile.intended_school} />
              )}
            </dl>

            {(profile.first_generation || (profile.demographic_tags || []).length > 0) && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold">Background</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {profile.first_generation && (
                    <span className="rounded-md border border-neutral-200 px-2.5 py-1 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
                      First-generation student
                    </span>
                  )}
                  {(profile.demographic_tags || []).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-neutral-200 px-2.5 py-1 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profile.target_opportunity_types &&
              profile.target_opportunity_types.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-sm font-semibold">Looking for</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {profile.target_opportunity_types.map((type) => (
                      <span
                        key={type}
                        className="rounded-md border border-neutral-200 px-2.5 py-1 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-300"
                      >
                        {formatTypeLabel(type)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            <ExperienceList title="Leadership" entries={profile.leadership_experiences} />
            <ExperienceList title="Research" entries={profile.research_experiences} />
            <ExperienceList title="Volunteering" entries={profile.volunteer_experiences} />
            <ExperienceList
              title="Work & projects"
              entries={profile.work_project_experiences}
            />

            {profile.awards && profile.awards.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold">Awards & honors</h3>
                <ul className="mt-3 space-y-4">
                  {profile.awards.map((award, index) => (
                    <li
                      key={index}
                      className="border-l-2 border-neutral-100 pl-4 dark:border-neutral-800"
                    >
                      <p className="text-sm font-medium">{award.name || "Award"}</p>
                      <p className="text-sm text-neutral-400">
                        {[award.organization, award.year].filter(Boolean).join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
