"use client";

import countriesData from "world-countries";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABELS,
  normalizeOpportunityType,
} from "@/lib/discovery/taxonomy";
import { getPlanLimits } from "@/lib/billing/plans";
import {
  STUDY_COUNTRIES,
  regionLabelForCountry,
  regionsForCountry,
} from "@/lib/data/regions";
import { UniversityCombobox } from "@/components/ui/university-combobox";

type ExperienceEntry = {
  title: string;
  organization: string;
  startDate: string;
  endDate: string;
  description: string;
  impact: string;
  link: string;
};

type AwardEntry = {
  name: string;
  organization: string;
  year: string;
  description: string;
};

/**
 * One unified experience list in the UI; entries carry a kind tag and are
 * bucketed back into the four storage arrays on save, so scoring, experience
 * summaries, and profile hashes keep working unchanged.
 */
export type ExperienceKind =
  | "leadership"
  | "research"
  | "volunteer"
  | "work_project";

type TaggedExperience = ExperienceEntry & { kind: ExperienceKind };

export const EXPERIENCE_KIND_LABELS: Record<ExperienceKind, string> = {
  leadership: "Leadership",
  research: "Research",
  volunteer: "Volunteering",
  work_project: "Work / Project",
};

const EXPERIENCE_KIND_TO_COLUMN: Record<
  ExperienceKind,
  | "leadership_experiences"
  | "research_experiences"
  | "volunteer_experiences"
  | "work_project_experiences"
> = {
  leadership: "leadership_experiences",
  research: "research_experiences",
  volunteer: "volunteer_experiences",
  work_project: "work_project_experiences",
};

type ProfileFormState = {
  nationality: string;
  citizenships: string[];
  permanent_resident_of: string;
  country_of_study: string;
  state_or_province: string;
  student_status: string;
  school: string;
  school_other: string;
  intended_school: string;
  planning_transfer: boolean;
  education_level: string;
  class_standing: string;
  field_of_study: string;
  field_of_study_other: string;
  field_of_study_secondary: string;
  undergraduate_field_of_study: string;
  gpa: string;
  gpa_scale: string;
  date_of_birth: string;
  languages: string[];
  target_opportunity_types: string[];
  subscription_plan: "free" | "pro" | "premium";
  experiences: TaggedExperience[];
  awards: AwardEntry[];
  first_generation: boolean;
  financial_need: boolean;
  has_disability: boolean;
  demographic_tags: string[];
};

const CLASS_STANDINGS = [
  "Freshman / First year",
  "Sophomore / Second year",
  "Junior / Third year",
  "Senior / Fourth year",
  "Fifth year or beyond",
];

const GPA_SCALES = [
  { value: "4.0", label: "4.0 scale" },
  { value: "4.3", label: "4.3 scale" },
  { value: "percentage", label: "Percentage" },
];

const GRADUATE_LEVELS = new Set(["Master's", "PhD", "Professional Degree"]);

// Nationality can be anywhere in the world; study country is US/Canada — the
// two markets the catalog covers.
const countries = Array.from(
  new Set(countriesData.map((country) => country.name.common))
)
  .sort((a, b) => a.localeCompare(b))
  .concat("Other");

// Optional self-identification. Only ever used to CONFIRM eligibility for
// opportunities that name a group — never to exclude anyone from anything.
const demographicOptions = [
  "First-generation college student",
  "Woman",
  "Black or African American",
  "Hispanic or Latino",
  "Indigenous or Native",
  "Asian or Pacific Islander",
  "LGBTQ+",
  "Student with a disability",
  "Veteran or military family",
  "Immigrant or refugee",
  "From a rural community",
  "Low-income household",
];

const educationLevels = [
  "High School",
  "Undergraduate",
  "Master's",
  "PhD",
  "Professional Degree",
  "Recent Graduate",
  "Other",
];

const fieldsOfStudy = [
  "Undeclared / Undecided",
  "Accounting",
  "Actuarial Science",
  "Agriculture",
  "Anthropology",
  "Architecture",
  "Art History",
  "Biochemistry",
  "Biology",
  "Biomedical Engineering",
  "Biomedical Sciences",
  "Business Administration",
  "Chemical Engineering",
  "Chemistry",
  "Civil Engineering",
  "Communications",
  "Computer Engineering",
  "Computer Science",
  "Criminology",
  "Cybersecurity",
  "Data Science",
  "Dentistry",
  "Design",
  "Economics",
  "Education",
  "Electrical Engineering",
  "Engineering",
  "English",
  "Environmental Science",
  "Finance",
  "Global Health",
  "Health Sciences",
  "History",
  "Human Resources",
  "Information Systems",
  "International Development",
  "International Relations",
  "Journalism",
  "Kinesiology",
  "Law",
  "Linguistics",
  "Management",
  "Marketing",
  "Mathematics",
  "Mechanical Engineering",
  "Medicine",
  "Neuroscience",
  "Nursing",
  "Pharmacy",
  "Philosophy",
  "Physics",
  "Political Science",
  "Psychology",
  "Public Administration",
  "Public Health",
  "Public Policy",
  "Social Work",
  "Sociology",
  "Software Engineering",
  "Statistics",
  "Urban Planning",
  "Veterinary Medicine",
  "Other",
];

const languageOptions = [
  "English",
  "French",
  "Spanish",
  "Arabic",
  "Portuguese",
  "German",
  "Italian",
  "Dutch",
  "Russian",
  "Mandarin Chinese",
  "Japanese",
  "Korean",
  "Hindi",
  "Turkish",
  "Swedish",
  "Norwegian",
  "Danish",
  "Polish",
  "Ukrainian",
  "Greek",
  "Other",
];

// Labels shown in the picker; the DB stores canonical taxonomy values so
// scoring, filtering, and the pipeline all agree on the vocabulary.
const opportunityTypeOptions = OPPORTUNITY_TYPES.map(
  (type) => OPPORTUNITY_TYPE_LABELS[type]
);

function typeLabelsToCanonical(labels: string[]): string[] {
  return Array.from(
    new Set(
      labels
        .map((label) => normalizeOpportunityType(label))
        .filter((value): value is NonNullable<typeof value> => Boolean(value))
    )
  );
}

function canonicalToTypeLabels(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => {
          const canonical = normalizeOpportunityType(value);
          return canonical ? OPPORTUNITY_TYPE_LABELS[canonical] : null;
        })
        .filter((label): label is string => Boolean(label))
    )
  );
}

const emptyExperience: ExperienceEntry = {
  title: "",
  organization: "",
  startDate: "",
  endDate: "",
  description: "",
  impact: "",
  link: "",
};

const emptyAward: AwardEntry = {
  name: "",
  organization: "",
  year: "",
  description: "",
};

const initialState: ProfileFormState = {
  nationality: "",
  citizenships: [],
  permanent_resident_of: "",
  country_of_study: "",
  state_or_province: "",
  student_status: "",
  school: "",
  school_other: "",
  intended_school: "",
  planning_transfer: false,
  education_level: "",
  class_standing: "",
  field_of_study: "",
  field_of_study_other: "",
  field_of_study_secondary: "",
  undergraduate_field_of_study: "",
  gpa: "",
  gpa_scale: "4.0",
  date_of_birth: "",
  languages: [],
  target_opportunity_types: [],
  subscription_plan: "free",
  experiences: [],
  awards: [],
  first_generation: false,
  financial_need: false,
  has_disability: false,
  demographic_tags: [],
};

function mergeExperienceBuckets(
  data: Record<string, unknown>
): TaggedExperience[] {
  const merged: TaggedExperience[] = [];
  for (const kind of Object.keys(EXPERIENCE_KIND_TO_COLUMN) as ExperienceKind[]) {
    const column = EXPERIENCE_KIND_TO_COLUMN[kind];
    const entries = (data[column] as ExperienceEntry[] | null) || [];
    for (const entry of entries) {
      merged.push({ ...entry, kind });
    }
  }
  return merged;
}

function bucketExperiences(experiences: TaggedExperience[]): {
  leadership_experiences: ExperienceEntry[];
  research_experiences: ExperienceEntry[];
  volunteer_experiences: ExperienceEntry[];
  work_project_experiences: ExperienceEntry[];
} {
  const buckets = {
    leadership_experiences: [] as ExperienceEntry[],
    research_experiences: [] as ExperienceEntry[],
    volunteer_experiences: [] as ExperienceEntry[],
    work_project_experiences: [] as ExperienceEntry[],
  };
  for (const { kind, ...entry } of experiences) {
    buckets[EXPERIENCE_KIND_TO_COLUMN[kind] || "work_project_experiences"].push(
      entry
    );
  }
  return buckets;
}

function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={compact ? "flex items-center gap-3" : "space-y-2"}>
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className={cn(
              "justify-between font-normal",
              compact ? "h-9 w-44" : "h-10 w-full"
            )}
          >
            <span className="truncate">{value || placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SearchableMultiSelect({
  label,
  selected,
  onChange,
  options,
  placeholder = "Search...",
}: {
  label: string;
  selected: string[];
  onChange: (values: string[]) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
          >
            <span>
              {selected.length > 0
                ? `${selected.length} selected`
                : "Select one or more"}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <Command>
            <CommandInput placeholder={placeholder} />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => toggle(option)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selected.includes(option) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {selected.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
            >
              {item}
              <button type="button" onClick={() => toggle(item)}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function ProfileForm() {
  const router = useRouter();
  const [form, setForm] = useState<ProfileFormState>(initialState);
  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(true);
  const [message, setMessage] = useState("");

  const regionOptions = useMemo(
    () => regionsForCountry(form.country_of_study),
    [form.country_of_study]
  );

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        setMessage(error.message);
        setFetchingProfile(false);
        return;
      }

      if (data) {
        const record = data as Record<string, unknown>;
        const stringField = (key: string) => String(record[key] || "");
        const listField = (key: string) =>
          Array.isArray(record[key]) ? (record[key] as string[]) : [];
        setForm({
          nationality: data.nationality || "",
          citizenships: listField("citizenships"),
          permanent_resident_of: listField("permanent_resident_of")[0] || "",
          country_of_study: data.country_of_study || "",
          state_or_province: stringField("state_or_province"),
          student_status: data.student_status || "",
          school: data.school || "",
          school_other: data.school_other || "",
          intended_school: stringField("intended_school"),
          planning_transfer: Boolean(record.intended_school),
          education_level: data.education_level || "",
          class_standing: stringField("class_standing"),
          field_of_study: data.field_of_study || "",
          field_of_study_other: data.field_of_study_other || "",
          field_of_study_secondary: stringField("field_of_study_secondary"),
          undergraduate_field_of_study: stringField("undergraduate_field_of_study"),
          gpa: data.gpa ? String(data.gpa) : "",
          gpa_scale: stringField("gpa_scale") || "4.0",
          date_of_birth: stringField("date_of_birth").slice(0, 10),
          languages: data.languages || [],
          target_opportunity_types: canonicalToTypeLabels(
            data.target_opportunity_types || []
          ),
          subscription_plan:
            (data.subscription_plan as "free" | "pro" | "premium" | null) ||
            "free",
          experiences: mergeExperienceBuckets(record),
          awards: (data.awards as unknown as AwardEntry[] | null) || [],
          first_generation: record.first_generation === true,
          financial_need:
            record.financial_need === true ||
            ["yes", "true", "high"].includes(
              String(record.financial_need || "").toLowerCase()
            ),
          has_disability: record.has_disability === true,
          demographic_tags: listField("demographic_tags"),
        });
      }

      setFetchingProfile(false);
    }

    loadProfile();
  }, []);

  function updateField<K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addExperience(kind: ExperienceKind) {
    updateField("experiences", [
      ...form.experiences,
      { ...emptyExperience, kind },
    ]);
  }

  function updateExperience(
    index: number,
    field: keyof TaggedExperience,
    value: string
  ) {
    const updated = [...form.experiences];
    updated[index] = { ...updated[index], [field]: value };
    updateField("experiences", updated);
  }

  function removeExperience(index: number) {
    updateField(
      "experiences",
      form.experiences.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  function addAward() {
    updateField("awards", [...form.awards, { ...emptyAward }]);
  }

  function updateAward(index: number, field: keyof AwardEntry, value: string) {
    const updated = [...form.awards];
    updated[index] = { ...updated[index], [field]: value };
    updateField("awards", updated);
  }

  function removeAward(index: number) {
    updateField(
      "awards",
      form.awards.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  async function updateProfileIntelligenceAfterSave() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return;
    }

    try {
      await fetch("/api/profile-experience-summaries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    } catch {
      // Profile saving should never fail because summarization is unavailable.
    }

    try {
      await fetch("/api/scoring-jobs/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    } catch {
      // Profile saving should never fail because scoring is unavailable.
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const gpaNumber = form.gpa ? Number(form.gpa) : null;
    const gpaMax =
      form.gpa_scale === "percentage" ? 100 : form.gpa_scale === "4.3" ? 4.3 : 4.0;

    if (
      gpaNumber !== null &&
      (Number.isNaN(gpaNumber) || gpaNumber < 0 || gpaNumber > gpaMax)
    ) {
      setMessage(
        `GPA must be between 0 and ${gpaMax} on the ${
          form.gpa_scale === "percentage" ? "percentage" : form.gpa_scale
        } scale.`
      );
      setLoading(false);
      return;
    }

    // Date of birth is required: age-restricted opportunities can't be
    // matched without it. Accept only a plausible student birth date.
    const dobOk =
      /^\d{4}-\d{2}-\d{2}$/.test(form.date_of_birth) &&
      !Number.isNaN(new Date(form.date_of_birth).getTime());
    const dobYear = dobOk ? Number(form.date_of_birth.slice(0, 4)) : 0;
    const thisYear = new Date().getUTCFullYear();
    if (!dobOk || dobYear < thisYear - 100 || dobYear > thisYear - 10) {
      setMessage(
        "Please enter your date of birth. It's used to match you with age-eligible opportunities."
      );
      setLoading(false);
      return;
    }

    const basePayload = {
      id: user.id,
      nationality: form.nationality,
      country_of_study: form.country_of_study,
      student_status: form.student_status,
      school: form.school,
      school_other: form.school_other,
      education_level: form.education_level,
      field_of_study: form.field_of_study,
      field_of_study_other: form.field_of_study_other,
      gpa: gpaNumber,
      languages: form.languages,
      target_opportunity_types: typeLabelsToCanonical(
        form.target_opportunity_types
      ),
      ...bucketExperiences(form.experiences),
      awards: form.awards,
      financial_need: form.financial_need,
      updated_at: new Date().toISOString(),
    };

    // The newest profile columns arrive with a hand-applied migration; save
    // must succeed either way, so retry without them on an unknown-column
    // error.
    const newColumns = {
      state_or_province: form.state_or_province,
      first_generation: form.first_generation,
      demographic_tags: form.demographic_tags,
      citizenships: form.citizenships,
      permanent_resident_of: form.permanent_resident_of
        ? [form.permanent_resident_of]
        : [],
      intended_school: form.planning_transfer ? form.intended_school : null,
      class_standing: form.class_standing || null,
      field_of_study_secondary: form.field_of_study_secondary || null,
      undergraduate_field_of_study: GRADUATE_LEVELS.has(form.education_level)
        ? form.undergraduate_field_of_study || null
        : null,
      gpa_scale: form.gpa_scale || "4.0",
      date_of_birth: form.date_of_birth || null,
      has_disability: form.has_disability || null,
    };

    let { error } = await supabase
      .from("profiles")
      .upsert({ ...basePayload, ...newColumns });

    if (error && /column|schema/i.test(error.message)) {
      ({ error } = await supabase.from("profiles").upsert(basePayload));
    }

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Profile saved successfully. Scheduling opportunity evaluations...");

    updateProfileIntelligenceAfterSave().finally(() => {
      router.push("/profile");
      router.refresh();
    });
  }

  if (fetchingProfile) {
    return (
      <div className="mt-10">
        <p className="text-sm text-neutral-400">Loading profile...</p>
      </div>
    );
  }

  const planLimits = getPlanLimits(form.subscription_plan);
  const maxRankedCategories =
    planLimits.rankedCategoryLimit === "all"
      ? opportunityTypeOptions.length
      : planLimits.rankedCategoryLimit;

  const opportunityPreferenceHelp = planLimits.hasCompetitivenessRanking
    ? `Your plan includes automatic matching in ${maxRankedCategories} categor${
        maxRankedCategories === 1 ? "y" : "ies"
      }. Your top picks are matched first.`
    : "Pick your preferred categories now. Upgrade any time to unlock automatic matching.";

  function updateOpportunityPreferences(values: string[]) {
    // Hard cap at the plan's category limit — here, at onboarding, and
    // server-side at scoring time. A Premium user picking a 5th category
    // used to silently succeed and then silently not be scored for it;
    // refusing the selection is the honest behavior.
    if (values.length > maxRankedCategories) {
      setMessage(
        `Your plan includes ${maxRankedCategories} categor${
          maxRankedCategories === 1 ? "y" : "ies"
        }. Remove one before adding another.`
      );
      return;
    }
    setMessage("");
    updateField("target_opportunity_types", values);
  }

  function renderExperienceSection() {
    return (
      <section className="space-y-5 border-t border-neutral-100 pt-10 dark:border-neutral-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionTitle
            title="Experience"
            description="Leadership, research, volunteering, work, and projects all live here. Line breaks and bullet points you type are kept exactly as written."
          />
          <Button type="button" variant="outline" onClick={() => addExperience("leadership")}>
            + Add experience
          </Button>
        </div>

        {form.experiences.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing added yet. Experience is the strongest signal for your match
            scores.
          </p>
        )}

        {form.experiences.map((entry, index) => (
          <div
            key={index}
            className="space-y-4 rounded-xl border border-neutral-200 p-4 sm:p-5 dark:border-neutral-800"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SearchableSelect
                label="Type"
                value={EXPERIENCE_KIND_LABELS[entry.kind]}
                onChange={(label) => {
                  const kind = (Object.keys(EXPERIENCE_KIND_LABELS) as ExperienceKind[]).find(
                    (key) => EXPERIENCE_KIND_LABELS[key] === label
                  );
                  if (kind) updateExperience(index, "kind", kind);
                }}
                options={Object.values(EXPERIENCE_KIND_LABELS)}
                compact
              />
              <Button
                type="button"
                variant="ghost"
                className="text-neutral-500 hover:text-red-600"
                onClick={() => removeExperience(index)}
              >
                Remove
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                placeholder="Role or title"
                value={entry.title}
                onChange={(event) =>
                  updateExperience(index, "title", event.target.value)
                }
              />
              <Input
                placeholder="Organization"
                value={entry.organization}
                onChange={(event) =>
                  updateExperience(index, "organization", event.target.value)
                }
              />
              <Input
                placeholder="Start date"
                value={entry.startDate}
                onChange={(event) =>
                  updateExperience(index, "startDate", event.target.value)
                }
              />
              <Input
                placeholder="End date or Present"
                value={entry.endDate}
                onChange={(event) =>
                  updateExperience(index, "endDate", event.target.value)
                }
              />
            </div>

            <Textarea
              placeholder={"What did you do? Bullet points welcome:\n• Organized weekly tutoring for 30 students\n• Grew club membership from 12 to 45"}
              value={entry.description}
              rows={4}
              onChange={(event) =>
                updateExperience(index, "description", event.target.value)
              }
            />

            <Textarea
              placeholder="Impact or results. Example: Led 12 members, raised $2,000, served 300 students."
              value={entry.impact}
              rows={2}
              onChange={(event) =>
                updateExperience(index, "impact", event.target.value)
              }
            />

            <Input
              placeholder="Optional link"
              value={entry.link}
              onChange={(event) =>
                updateExperience(index, "link", event.target.value)
              }
            />
          </div>
        ))}
      </section>
    );
  }

  return (
    <div className="mt-10">
        <form onSubmit={handleSubmit} className="space-y-12">
          <section className="space-y-4">
            <SectionTitle
              title="Academic profile"
              description="Add the academic details used to match you with relevant opportunities."
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SearchableSelect
                label="Nationality"
                value={form.nationality}
                onChange={(value) => updateField("nationality", value)}
                options={countries}
                searchPlaceholder="Search nationality..."
              />

              <SearchableMultiSelect
                label="Other citizenships (optional)"
                selected={form.citizenships.filter((c) => c !== form.nationality)}
                onChange={(values) => updateField("citizenships", values)}
                options={countries.filter((c) => c !== "Other")}
                placeholder="Search country..."
              />

              <SearchableSelect
                label="Permanent resident of (green card / PR status)"
                value={form.permanent_resident_of === "none" ? "I have no permanent residency" : form.permanent_resident_of}
                onChange={(value) =>
                  updateField(
                    "permanent_resident_of",
                    value === "I have no permanent residency" ? "none" : value
                  )
                }
                options={["I have no permanent residency", ...countries.filter((c) => c !== "Other")]}
                searchPlaceholder="Search country..."
              />

              <SearchableSelect
                label="Country of study"
                value={form.country_of_study}
                onChange={(value) => {
                  updateField("country_of_study", value);
                  updateField("state_or_province", "");
                  updateField("school", "");
                  updateField("school_other", "");
                }}
                options={STUDY_COUNTRIES}
                searchPlaceholder="Search country..."
              />

              <SearchableSelect
                label={regionLabelForCountry(form.country_of_study)}
                value={form.state_or_province}
                onChange={(value) => updateField("state_or_province", value)}
                options={regionOptions}
                placeholder={
                  form.country_of_study
                    ? `Select your ${regionLabelForCountry(form.country_of_study).toLowerCase()}`
                    : "Select country first"
                }
                searchPlaceholder="Search..."
              />

              <SearchableSelect
                label="Student status"
                value={form.student_status}
                onChange={(value) => updateField("student_status", value)}
                options={["Domestic student", "International student"]}
              />

              <UniversityCombobox
                country={form.country_of_study}
                value={form.school}
                onChange={(value) => updateField("school", value)}
              />

              {form.school === "Other" && (
                <div className="space-y-2 md:col-span-2">
                  <Label>Enter school / university name</Label>
                  <Input
                    value={form.school_other}
                    onChange={(event) =>
                      updateField("school_other", event.target.value)
                    }
                    placeholder="Type your school or university name"
                  />
                </div>
              )}

              <SearchableSelect
                label="Education level"
                value={form.education_level}
                onChange={(value) => updateField("education_level", value)}
                options={educationLevels}
              />

              {form.education_level === "Undergraduate" && (
                <SearchableSelect
                  label="Class standing"
                  value={form.class_standing}
                  onChange={(value) => updateField("class_standing", value)}
                  options={CLASS_STANDINGS}
                  placeholder="Select your year"
                />
              )}

              {GRADUATE_LEVELS.has(form.education_level) && (
                <SearchableSelect
                  label="Undergraduate field (for matching)"
                  value={form.undergraduate_field_of_study}
                  onChange={(value) =>
                    updateField("undergraduate_field_of_study", value)
                  }
                  options={fieldsOfStudy}
                  searchPlaceholder="Search field..."
                />
              )}

              <SearchableSelect
                label="Field of study / major"
                value={form.field_of_study}
                onChange={(value) => updateField("field_of_study", value)}
                options={fieldsOfStudy}
                searchPlaceholder="Search major..."
              />

              <SearchableSelect
                label="Second major / minor (optional)"
                value={form.field_of_study_secondary}
                onChange={(value) =>
                  updateField(
                    "field_of_study_secondary",
                    value === form.field_of_study_secondary ? "" : value
                  )
                }
                options={fieldsOfStudy.filter((f) => f !== "Other")}
                placeholder="None"
                searchPlaceholder="Search field..."
              />

              {form.field_of_study === "Other" && (
                <div className="space-y-2 md:col-span-2">
                  <Label>Enter field of study / major</Label>
                  <Input
                    value={form.field_of_study_other}
                    onChange={(event) =>
                      updateField("field_of_study_other", event.target.value)
                    }
                    placeholder="Type your field of study"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>GPA</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={form.gpa_scale === "percentage" ? 100 : form.gpa_scale === "4.3" ? 4.3 : 4}
                    value={form.gpa}
                    onChange={(event) => updateField("gpa", event.target.value)}
                    placeholder={form.gpa_scale === "percentage" ? "Example: 86" : "Example: 3.70"}
                    className="flex-1"
                  />
                  <select
                    value={form.gpa_scale}
                    onChange={(event) => updateField("gpa_scale", event.target.value)}
                    className="h-10 rounded-md border border-neutral-200 bg-white px-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
                    aria-label="GPA scale"
                  >
                    {GPA_SCALES.map((scale) => (
                      <option key={scale.value} value={scale.value}>
                        {scale.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Date of birth</Label>
                <Input
                  type="date"
                  required
                  value={form.date_of_birth}
                  onChange={(event) => updateField("date_of_birth", event.target.value)}
                />
                <p className="text-xs text-neutral-500">
                  Used to match you with age-eligible opportunities.
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.planning_transfer}
                    onChange={(event) =>
                      updateField("planning_transfer", event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 rounded border-neutral-300 accent-[var(--primary)]"
                  />
                  <span className="text-sm text-neutral-800 dark:text-neutral-200">
                    I&apos;m planning to transfer to another school
                    <span className="block text-neutral-500">
                      We&apos;ll match you against your intended school&apos;s
                      opportunities too.
                    </span>
                  </span>
                </label>
                {form.planning_transfer && (
                  <UniversityCombobox
                    label="Intended school"
                    country={form.country_of_study}
                    value={form.intended_school}
                    onChange={(value) => updateField("intended_school", value)}
                  />
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle
              title="Preferences"
              description="Set default preferences for the opportunities you want to see first."
            />

            <div className="space-y-5">
              <SearchableMultiSelect
                label="Languages"
                selected={form.languages}
                onChange={(values) => updateField("languages", values)}
                options={languageOptions}
                placeholder="Search language..."
              />

              <SearchableMultiSelect
                label="Opportunity preferences"
                selected={form.target_opportunity_types}
                onChange={updateOpportunityPreferences}
                options={opportunityTypeOptions}
                placeholder="Search opportunity type..."
              />

              <p className="text-sm text-muted-foreground">
                {opportunityPreferenceHelp}
              </p>
            </div>
          </section>

          <section className="space-y-5 border-t border-neutral-100 pt-10 dark:border-neutral-900">
            <SectionTitle
              title="Background"
              description="Optional. Some opportunities are created for specific groups; sharing here only ever unlocks more matches. It is never used to exclude you from anything."
            />

            <div className="space-y-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.first_generation}
                  onChange={(event) =>
                    updateField("first_generation", event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300 accent-[var(--primary)]"
                />
                <span className="text-sm text-neutral-800 dark:text-neutral-200">
                  I am a first-generation college student
                  <span className="block text-neutral-500">
                    Neither of my parents completed a four-year degree.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.financial_need}
                  onChange={(event) =>
                    updateField("financial_need", event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300 accent-[var(--primary)]"
                />
                <span className="text-sm text-neutral-800 dark:text-neutral-200">
                  I want to see need-based opportunities
                  <span className="block text-neutral-500">
                    Surfaces awards that consider financial need.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.has_disability}
                  onChange={(event) =>
                    updateField("has_disability", event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300 accent-[var(--primary)]"
                />
                <span className="text-sm text-neutral-800 dark:text-neutral-200">
                  I identify as a student with a disability
                  <span className="block text-neutral-500">
                    Only used to surface disability-specific opportunities.
                    Never shared, never used to exclude you from anything.
                  </span>
                </span>
              </label>

              <SearchableMultiSelect
                label="Groups you identify with (optional)"
                selected={form.demographic_tags}
                onChange={(values) => updateField("demographic_tags", values)}
                options={demographicOptions}
                placeholder="Search..."
              />
            </div>
          </section>

          {renderExperienceSection()}

          <section className="space-y-5 border-t border-neutral-100 pt-10 dark:border-neutral-900">
            <div className="flex items-start justify-between gap-4">
              <SectionTitle
                title="Awards & honors"
                description="Add scholarships, prizes, honors, recognitions, or competitions won."
              />

              <Button type="button" variant="outline" onClick={addAward}>
                + Add
              </Button>
            </div>

            {form.awards.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No awards added yet.
              </p>
            )}

            {form.awards.map((entry, index) => (
              <div
                key={index}
                className="space-y-4 border-l-2 border-neutral-100 pl-4 dark:border-neutral-800"
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    placeholder="Award name"
                    value={entry.name}
                    onChange={(event) =>
                      updateAward(index, "name", event.target.value)
                    }
                  />

                  <Input
                    placeholder="Organization"
                    value={entry.organization}
                    onChange={(event) =>
                      updateAward(index, "organization", event.target.value)
                    }
                  />

                  <Input
                    placeholder="Year"
                    value={entry.year}
                    onChange={(event) =>
                      updateAward(index, "year", event.target.value)
                    }
                  />
                </div>

                <Textarea
                  placeholder="Description"
                  value={entry.description}
                  onChange={(event) =>
                    updateAward(index, "description", event.target.value)
                  }
                />

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => removeAward(index)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </section>

          {message && <p className="text-sm text-muted-foreground">{message}</p>}

          <Button type="submit" size="lg" disabled={loading} className="px-8">
            {loading ? "Saving profile..." : "Save profile"}
          </Button>
        </form>
    </div>
  );
}
