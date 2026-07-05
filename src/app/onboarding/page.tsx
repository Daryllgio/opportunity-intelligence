"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import countriesData from "world-countries";
import { supabase } from "@/lib/supabase";
import {
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABELS,
  OPPORTUNITY_TYPE_DESCRIPTIONS,
} from "@/lib/discovery/taxonomy";
import {
  STUDY_COUNTRIES,
  regionLabelForCountry,
  regionsForCountry,
} from "@/lib/data/regions";
import { UniversityCombobox } from "@/components/ui/university-combobox";

const EDUCATION_LEVELS = [
  "High School",
  "Undergraduate",
  "Master's",
  "PhD",
  "Professional Degree",
  "Recent Graduate",
];

const EXPERIENCE_SECTIONS = [
  { key: "leadership_experiences", label: "Leadership", hint: "Clubs, teams, initiatives you led" },
  { key: "research_experiences", label: "Research", hint: "Labs, projects, publications" },
  { key: "volunteer_experiences", label: "Volunteering", hint: "Community or service work" },
  { key: "work_project_experiences", label: "Work & projects", hint: "Jobs, internships, personal projects" },
] as const;

type ExperienceDraft = Record<string, { title: string; organization: string }>;

const STEPS = ["Basics", "Education", "Experience", "Categories"];

export default function OnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1 — basics
  const [nationality, setNationality] = useState("");
  const [countryOfStudy, setCountryOfStudy] = useState("");
  const [stateOrProvince, setStateOrProvince] = useState("");

  // Step 2 — education
  const [educationLevel, setEducationLevel] = useState("");
  const [school, setSchool] = useState("");
  const [schoolOther, setSchoolOther] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  const [gpa, setGpa] = useState("");

  // Step 3 — experience (simplified single entry per section)
  const [experience, setExperience] = useState<ExperienceDraft>({});

  // Step 4 — categories
  const [categories, setCategories] = useState<string[]>([]);

  const countries = useMemo(
    () =>
      Array.from(new Set(countriesData.map((c) => c.name.common))).sort((a, b) =>
        a.localeCompare(b)
      ),
    []
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        window.location.href = "/login";
        return;
      }
      setUserId(user.id);

      // Resume where they left off if a partial profile exists.
      supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          const record = data as Record<string, unknown>;
          setNationality(data.nationality || "");
          setCountryOfStudy(data.country_of_study || "");
          setStateOrProvince(String(record.state_or_province || ""));
          setEducationLevel(data.education_level || "");
          setSchool(data.school || "");
          setSchoolOther(data.school_other || "");
          setFieldOfStudy(data.field_of_study || "");
          setGpa(data.gpa ? String(data.gpa) : "");
          setCategories(
            Array.isArray(data.target_opportunity_types)
              ? data.target_opportunity_types.filter((t: string) =>
                  (OPPORTUNITY_TYPES as readonly string[]).includes(t)
                )
              : []
          );
        });
    });
  }, []);

  async function savePartial(fields: Record<string, unknown>) {
    if (!userId) return false;
    setSaving(true);
    setError("");

    let { error: upsertError } = await supabase
      .from("profiles")
      .upsert({ id: userId, ...fields, updated_at: new Date().toISOString() });

    // Newest columns land with a hand-applied migration; never block signup
    // on their absence.
    if (upsertError && /column|schema/i.test(upsertError.message)) {
      const fallback = { ...fields };
      delete fallback.state_or_province;
      delete fallback.first_generation;
      delete fallback.demographic_tags;
      ({ error: upsertError } = await supabase
        .from("profiles")
        .upsert({ id: userId, ...fallback, updated_at: new Date().toISOString() }));
    }

    setSaving(false);
    if (upsertError) {
      setError("Could not save. Please try again.");
      return false;
    }
    return true;
  }

  async function next() {
    let ok = true;

    if (step === 0) {
      ok = await savePartial({
        nationality: nationality || null,
        country_of_study: countryOfStudy || null,
        state_or_province: stateOrProvince || null,
      });
    } else if (step === 1) {
      ok = await savePartial({
        education_level: educationLevel || null,
        school: school || null,
        school_other: school === "Other" ? schoolOther || null : null,
        field_of_study: fieldOfStudy || null,
        gpa: gpa ? Number(gpa) : null,
      });
    } else if (step === 2) {
      const fields: Record<string, unknown> = {};
      for (const section of EXPERIENCE_SECTIONS) {
        const draft = experience[section.key];
        if (draft?.title?.trim()) {
          fields[section.key] = [
            {
              title: draft.title.trim(),
              organization: draft.organization.trim() || undefined,
            },
          ];
        }
      }
      ok = Object.keys(fields).length ? await savePartial(fields) : true;
    }

    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function finish() {
    const ok = await savePartial({
      target_opportunity_types: categories,
    });
    if (!ok) return;

    // Kick off scoring so matches are ready when they land on their list.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      fetch("/api/scoring-jobs/schedule", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {});
    }

    router.push("/opportunities");
  }

  function toggleCategory(type: string) {
    setCategories((current) =>
      current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type]
    );
  }

  const inputClass =
    "h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900";
  const labelClass = "block text-sm font-medium";

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950">
      <header className="mx-auto flex h-16 max-w-2xl items-center justify-between px-6">
        <span className="text-[15px] font-semibold tracking-tight">OppScore</span>
        <Link
          href="/opportunities"
          className="text-sm text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          Skip for now
        </Link>
      </header>

      <div className="mx-auto max-w-2xl px-6 pb-24 pt-8">
        {/* Progress */}
        <div className="flex items-center gap-2">
          {STEPS.map((label, index) => (
            <div key={label} className="flex flex-1 flex-col gap-2">
              <div
                className={`h-1 rounded-full transition-colors ${
                  index <= step
                    ? "bg-primary"
                    : "bg-neutral-100 dark:bg-neutral-800"
                }`}
              />
              <span
                className={`text-xs ${
                  index === step
                    ? "font-medium text-neutral-900 dark:text-neutral-100"
                    : "text-neutral-400"
                }`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Step 1 — Basics */}
        {step === 0 && (
          <section className="mt-12">
            <h1 className="text-2xl font-semibold tracking-tight">
              Where are you from, and where do you study?
            </h1>
            <p className="mt-2 text-sm leading-6 text-neutral-500">
              Citizenship and location decide which opportunities you&apos;re
              eligible for — many are country-specific.
            </p>

            <div className="mt-8 space-y-6">
              <div>
                <label htmlFor="nationality" className={labelClass}>
                  Citizenship / nationality
                </label>
                <select
                  id="nationality"
                  value={nationality}
                  onChange={(event) => setNationality(event.target.value)}
                  className={`${inputClass} mt-2`}
                >
                  <option value="">Select a country</option>
                  {countries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="countryOfStudy" className={labelClass}>
                  Country where you study (or plan to)
                </label>
                <select
                  id="countryOfStudy"
                  value={countryOfStudy}
                  onChange={(event) => {
                    setCountryOfStudy(event.target.value);
                    setStateOrProvince("");
                  }}
                  className={`${inputClass} mt-2`}
                >
                  <option value="">Select a country</option>
                  {STUDY_COUNTRIES.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>

              {countryOfStudy && (
                <div>
                  <label htmlFor="stateOrProvince" className={labelClass}>
                    {regionLabelForCountry(countryOfStudy)}
                  </label>
                  <select
                    id="stateOrProvince"
                    value={stateOrProvince}
                    onChange={(event) => setStateOrProvince(event.target.value)}
                    className={`${inputClass} mt-2`}
                  >
                    <option value="">
                      Select your {regionLabelForCountry(countryOfStudy).toLowerCase()}
                    </option>
                    {regionsForCountry(countryOfStudy).map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-neutral-500">
                    Many scholarships are state or province specific — this
                    unlocks them for you.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Step 2 — Education */}
        {step === 1 && (
          <section className="mt-12">
            <h1 className="text-2xl font-semibold tracking-tight">
              Your education
            </h1>
            <p className="mt-2 text-sm leading-6 text-neutral-500">
              Opportunities are filtered to your level automatically — you&apos;ll
              never see programs you can&apos;t apply to.
            </p>

            <div className="mt-8 space-y-6">
              <div>
                <label htmlFor="educationLevel" className={labelClass}>
                  Education level
                </label>
                <select
                  id="educationLevel"
                  value={educationLevel}
                  onChange={(event) => setEducationLevel(event.target.value)}
                  className={`${inputClass} mt-2`}
                >
                  <option value="">Select your level</option>
                  {EDUCATION_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>

              <div className="[&_label]:text-sm [&_label]:font-medium">
                <UniversityCombobox
                  label="School or university"
                  country={countryOfStudy}
                  value={school}
                  onChange={setSchool}
                />
                {school === "Other" && (
                  <input
                    value={schoolOther}
                    onChange={(event) => setSchoolOther(event.target.value)}
                    placeholder="Type your school name"
                    className={`${inputClass} mt-2`}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="fieldOfStudy" className={labelClass}>
                    Field of study
                  </label>
                  <input
                    id="fieldOfStudy"
                    value={fieldOfStudy}
                    onChange={(event) => setFieldOfStudy(event.target.value)}
                    placeholder="e.g. Computer Science"
                    className={`${inputClass} mt-2`}
                  />
                </div>
                <div>
                  <label htmlFor="gpa" className={labelClass}>
                    GPA <span className="font-normal text-neutral-400">(optional)</span>
                  </label>
                  <input
                    id="gpa"
                    value={gpa}
                    onChange={(event) => setGpa(event.target.value)}
                    placeholder="e.g. 3.7"
                    inputMode="decimal"
                    className={`${inputClass} mt-2`}
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Step 3 — Experience */}
        {step === 2 && (
          <section className="mt-12">
            <h1 className="text-2xl font-semibold tracking-tight">
              What experience do you have?
            </h1>
            <p className="mt-2 text-sm leading-6 text-neutral-500">
              One line each is enough to start — selection committees care
              about these, so your scores do too. You can add detail later.
            </p>

            <div className="mt-8 space-y-8">
              {EXPERIENCE_SECTIONS.map((section) => (
                <div key={section.key}>
                  <p className={labelClass}>{section.label}</p>
                  <p className="text-xs text-neutral-400">{section.hint}</p>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      value={experience[section.key]?.title || ""}
                      onChange={(event) =>
                        setExperience((current) => ({
                          ...current,
                          [section.key]: {
                            title: event.target.value,
                            organization: current[section.key]?.organization || "",
                          },
                        }))
                      }
                      placeholder="What you did"
                      className={inputClass}
                    />
                    <input
                      value={experience[section.key]?.organization || ""}
                      onChange={(event) =>
                        setExperience((current) => ({
                          ...current,
                          [section.key]: {
                            title: current[section.key]?.title || "",
                            organization: event.target.value,
                          },
                        }))
                      }
                      placeholder="Where (optional)"
                      className={inputClass}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Step 4 — Categories */}
        {step === 3 && (
          <section className="mt-12">
            <h1 className="text-2xl font-semibold tracking-tight">
              What are you looking for?
            </h1>
            <p className="mt-2 text-sm leading-6 text-neutral-500">
              Pick the categories that matter most — these get scored against
              your profile first. You can browse everything regardless.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {OPPORTUNITY_TYPES.map((type) => {
                const selected = categories.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleCategory(type)}
                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
                    }`}
                  >
                    <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {OPPORTUNITY_TYPE_LABELS[type]}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-neutral-600 dark:text-neutral-400">
                      {OPPORTUNITY_TYPE_DESCRIPTIONS[type]}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              Your plan decides how many categories get automatic scoring —
              your top picks are used first.
            </p>
          </section>
        )}

        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

        {/* Controls */}
        <div className="mt-12 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || saving}
            className="text-sm text-neutral-400 hover:text-neutral-600 disabled:invisible dark:hover:text-neutral-300"
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              disabled={saving}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Continue"}
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={saving || categories.length === 0}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "See my matches"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
