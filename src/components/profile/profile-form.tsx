"use client";

import countriesData from "world-countries";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

type ProfileFormState = {
  nationality: string;
  country_of_study: string;
  student_status: string;
  school: string;
  school_other: string;
  education_level: string;
  field_of_study: string;
  field_of_study_other: string;
  gpa: string;
  languages: string[];
  target_opportunity_types: string[];
  subscription_plan: "free" | "pro" | "premium";
  leadership_experiences: ExperienceEntry[];
  research_experiences: ExperienceEntry[];
  volunteer_experiences: ExperienceEntry[];
  work_project_experiences: ExperienceEntry[];
  awards: AwardEntry[];
};

const countries = Array.from(
  new Set(countriesData.map((country) => country.name.common))
)
  .sort((a, b) => a.localeCompare(b))
  .concat("Other");

const universitiesByCountry: Record<string, string[]> = {
  Canada: [
    "Carleton University",
    "University of Toronto",
    "University of British Columbia",
    "McGill University",
    "University of Waterloo",
    "University of Alberta",
    "University of Calgary",
    "University of Ottawa",
    "York University",
    "Western University",
    "Queen's University",
    "McMaster University",
    "Simon Fraser University",
    "Concordia University",
    "Dalhousie University",
    "Other",
  ],
  "United States": [
    "Harvard University",
    "Stanford University",
    "Massachusetts Institute of Technology",
    "University of California, Berkeley",
    "University of California, Los Angeles",
    "University of Michigan",
    "New York University",
    "Columbia University",
    "University of Maryland, Baltimore County",
    "University of Maryland, College Park",
    "Howard University",
    "Johns Hopkins University",
    "Other",
  ],
  "United Kingdom": [
    "University of Oxford",
    "University of Cambridge",
    "Imperial College London",
    "University College London",
    "King's College London",
    "University of Edinburgh",
    "University of Manchester",
    "University of Warwick",
    "Other",
  ],
  Cameroon: [
    "University of Buea",
    "University of Yaoundé I",
    "University of Yaoundé II",
    "University of Douala",
    "University of Dschang",
    "Catholic University of Cameroon",
    "ICT University",
    "Other",
  ],
  Nigeria: [
    "University of Lagos",
    "University of Ibadan",
    "Covenant University",
    "University of Nigeria",
    "Ahmadu Bello University",
    "Obafemi Awolowo University",
    "Other",
  ],
  Ghana: [
    "University of Ghana",
    "Kwame Nkrumah University of Science and Technology",
    "University of Cape Coast",
    "Ashesi University",
    "Other",
  ],
};

const fallbackUniversities = [
  "University of Toronto",
  "Harvard University",
  "University of Oxford",
  "University of Cambridge",
  "Stanford University",
  "Massachusetts Institute of Technology",
  "University of British Columbia",
  "McGill University",
  "University of Waterloo",
  "Carleton University",
  "University of Lagos",
  "University of Ghana",
  "University of Buea",
  "Other",
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

const opportunityTypeOptions = [
  "Scholarships",
  "Research Opportunities",
  "Funded Conferences",
  "Fellowships",
  "Grants",
  "Competitions",
  "Leadership Programs",
  "Professional Development",
];

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
  country_of_study: "",
  student_status: "",
  school: "",
  school_other: "",
  education_level: "",
  field_of_study: "",
  field_of_study_other: "",
  gpa: "",
  languages: [],
  target_opportunity_types: [],
  subscription_plan: "free",
  leadership_experiences: [],
  research_experiences: [],
  volunteer_experiences: [],
  work_project_experiences: [],
  awards: [],
};

function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
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
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
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

  const schoolOptions = useMemo(() => {
    return universitiesByCountry[form.country_of_study] || fallbackUniversities;
  }, [form.country_of_study]);

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
        setForm({
          nationality: data.nationality || "",
          country_of_study: data.country_of_study || "",
          student_status: data.student_status || "",
          school: data.school || "",
          school_other: data.school_other || "",
          education_level: data.education_level || "",
          field_of_study: data.field_of_study || "",
          field_of_study_other: data.field_of_study_other || "",
          gpa: data.gpa ? String(data.gpa) : "",
          languages: data.languages || [],
          target_opportunity_types: data.target_opportunity_types || [],
          subscription_plan:
            (data.subscription_plan as "free" | "pro" | "premium" | null) ||
            "free",
          leadership_experiences:
            (data.leadership_experiences as unknown as ExperienceEntry[] | null) ||
            [],
          research_experiences:
            (data.research_experiences as unknown as ExperienceEntry[] | null) ||
            [],
          volunteer_experiences:
            (data.volunteer_experiences as unknown as ExperienceEntry[] | null) ||
            [],
          work_project_experiences:
            (data.work_project_experiences as unknown as
              | ExperienceEntry[]
              | null) || [],
          awards: (data.awards as unknown as AwardEntry[] | null) || [],
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

  function addExperience(
    key:
      | "leadership_experiences"
      | "research_experiences"
      | "volunteer_experiences"
      | "work_project_experiences"
  ) {
    updateField(key, [...form[key], { ...emptyExperience }]);
  }

  function updateExperience(
    key:
      | "leadership_experiences"
      | "research_experiences"
      | "volunteer_experiences"
      | "work_project_experiences",
    index: number,
    field: keyof ExperienceEntry,
    value: string
  ) {
    const updated = [...form[key]];
    updated[index] = { ...updated[index], [field]: value };
    updateField(key, updated);
  }

  function removeExperience(
    key:
      | "leadership_experiences"
      | "research_experiences"
      | "volunteer_experiences"
      | "work_project_experiences",
    index: number
  ) {
    updateField(
      key,
      form[key].filter((_, itemIndex) => itemIndex !== index)
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

    if (
      gpaNumber !== null &&
      (Number.isNaN(gpaNumber) || gpaNumber < 0 || gpaNumber > 4)
    ) {
      setMessage("GPA must be between 0 and 4.00 for now.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("profiles").upsert({
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
      target_opportunity_types: form.target_opportunity_types,
      leadership_experiences: form.leadership_experiences,
      research_experiences: form.research_experiences,
      volunteer_experiences: form.volunteer_experiences,
      work_project_experiences: form.work_project_experiences,
      awards: form.awards,
      updated_at: new Date().toISOString(),
    });

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
      <Card className="mt-8">
        <CardContent className="p-6">
          <p className="text-muted-foreground">Loading profile...</p>
        </CardContent>
      </Card>
    );
  }

  const maxRankedCategories =
    form.subscription_plan === "premium"
      ? opportunityTypeOptions.length
      : form.subscription_plan === "pro"
        ? 2
        : 0;

  const opportunityPreferenceHelp =
    form.subscription_plan === "premium"
      ? "Premium includes profile-based matching across all opportunity categories."
      : form.subscription_plan === "pro"
        ? "Pro includes profile-based matching for up to 2 opportunity categories."
        : "Free users can browse opportunities. Upgrade to unlock profile-based matching.";

  function updateOpportunityPreferences(values: string[]) {
    if (maxRankedCategories === 0) {
      updateField("target_opportunity_types", []);
      return;
    }

    updateField("target_opportunity_types", values.slice(0, maxRankedCategories));
  }

  function renderExperienceSection(
    title: string,
    description: string,
    key:
      | "leadership_experiences"
      | "research_experiences"
      | "volunteer_experiences"
      | "work_project_experiences"
  ) {
    return (
      <section className="space-y-4 rounded-2xl border p-5">
        <div className="flex items-start justify-between gap-4">
          <SectionTitle title={title} description={description} />
          <Button
            type="button"
            variant="outline"
            onClick={() => addExperience(key)}
          >
            + Add
          </Button>
        </div>

        {form[key].length === 0 && (
          <p className="text-sm text-muted-foreground">No entries added yet.</p>
        )}

        {form[key].map((entry, index) => (
          <div
            key={index}
            className="space-y-4 rounded-xl border bg-muted/20 p-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                placeholder="Role / title"
                value={entry.title}
                onChange={(event) =>
                  updateExperience(key, index, "title", event.target.value)
                }
              />

              <Input
                placeholder="Organization"
                value={entry.organization}
                onChange={(event) =>
                  updateExperience(
                    key,
                    index,
                    "organization",
                    event.target.value
                  )
                }
              />

              <Input
                placeholder="Start date"
                value={entry.startDate}
                onChange={(event) =>
                  updateExperience(key, index, "startDate", event.target.value)
                }
              />

              <Input
                placeholder="End date or Present"
                value={entry.endDate}
                onChange={(event) =>
                  updateExperience(key, index, "endDate", event.target.value)
                }
              />
            </div>

            <Textarea
              placeholder="Describe what you did."
              value={entry.description}
              onChange={(event) =>
                updateExperience(key, index, "description", event.target.value)
              }
            />

            <Textarea
              placeholder="Impact or results, if any. Example: Led 12 members, raised $2,000, served 300 students."
              value={entry.impact}
              onChange={(event) =>
                updateExperience(key, index, "impact", event.target.value)
              }
            />

            <Input
              placeholder="Optional link"
              value={entry.link}
              onChange={(event) =>
                updateExperience(key, index, "link", event.target.value)
              }
            />

            <Button
              type="button"
              variant="outline"
              onClick={() => removeExperience(key, index)}
            >
              Remove
            </Button>
          </div>
        ))}
      </section>
    );
  }

  return (
    <Card className="mt-8">
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="space-y-4">
            <SectionTitle
              title="Academic profile"
              description="Add the academic details used to match you with relevant opportunities."
            />

            <div className="grid gap-4 md:grid-cols-2">
              <SearchableSelect
                label="Nationality"
                value={form.nationality}
                onChange={(value) => updateField("nationality", value)}
                options={countries}
                searchPlaceholder="Search nationality..."
              />

              <SearchableSelect
                label="Country of study"
                value={form.country_of_study}
                onChange={(value) => {
                  updateField("country_of_study", value);
                  updateField("school", "");
                  updateField("school_other", "");
                }}
                options={countries}
                searchPlaceholder="Search country..."
              />

              <SearchableSelect
                label="Student status"
                value={form.student_status}
                onChange={(value) => updateField("student_status", value)}
                options={["Domestic student", "International student"]}
              />

              <SearchableSelect
                label="School / university"
                value={form.school}
                onChange={(value) => updateField("school", value)}
                options={schoolOptions}
                placeholder={
                  form.country_of_study
                    ? "Select your school"
                    : "Select country first"
                }
                searchPlaceholder="Search school..."
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

              <SearchableSelect
                label="Field of study / major"
                value={form.field_of_study}
                onChange={(value) => updateField("field_of_study", value)}
                options={fieldsOfStudy}
                searchPlaceholder="Search major..."
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
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="4"
                  value={form.gpa}
                  onChange={(event) => updateField("gpa", event.target.value)}
                  placeholder="Example: 3.70"
                />
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

          {renderExperienceSection(
            "Leadership experience",
            "Add clubs, organizations, student leadership, nonprofit leadership, or team roles.",
            "leadership_experiences"
          )}

          {renderExperienceSection(
            "Research experience",
            "Add labs, papers, projects, posters, research assistant roles, or academic work.",
            "research_experiences"
          )}

          {renderExperienceSection(
            "Volunteer experience",
            "Add community service, mentoring, outreach, nonprofit, or social impact work.",
            "volunteer_experiences"
          )}

          {renderExperienceSection(
            "Work / project experience",
            "Add jobs, internships, startups, projects, freelance work, or technical builds.",
            "work_project_experiences"
          )}

          <section className="space-y-4 rounded-2xl border p-5">
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
                className="space-y-4 rounded-xl border bg-muted/20 p-4"
              >
                <div className="grid gap-4 md:grid-cols-2">
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

          <Button type="submit" disabled={loading}>
            {loading ? "Saving profile..." : "Save profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
