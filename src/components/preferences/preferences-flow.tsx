"use client";

/**
 * The preferences flow — what the student wants to see, as a conditional
 * conversation. Sections appear only when the answers above them make them
 * relevant: pick competitions and the competition sub-question appears; skip
 * them and it never exists. Nothing overwhelming, nothing out of context.
 *
 * Two distinct selections drive everything:
 *   1. SCORED categories (AI competitiveness scoring) — bounded by plan.
 *   2. ACCESS categories (browsable database) — unbounded, empty = all.
 * Then, conditionally: sub-types per branching category, next-level opt-in
 * (with degree type / field / country / target schools), and transfer intent.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getPlanLimitsForProfile } from "@/lib/billing/subscription";
import { SearchableMultiSelect } from "@/components/ui/searchable-select";
import { fieldOptionsForNextLevel } from "@/lib/data/fields-of-study";
import {
  CATEGORY_SUBTYPES,
  DEFAULT_PREFERENCES,
  NEXT_LEVEL_TYPE_OPTIONS,
  categoryHasSubtypes,
  nextLevelChoicesFor,
  normalizePreferences,
  preferencesFromProfile,
  type NextLevelType,
  type StudentPreferences,
} from "@/lib/preferences/types";

const CATEGORY_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "scholarship", label: "Scholarships", hint: "money for school" },
  { value: "grant", label: "Grants", hint: "project & study funding" },
  { value: "research_program", label: "Research programs", hint: "labs, REUs, summer research" },
  { value: "fellowship", label: "Fellowships", hint: "funded cohort experiences" },
  { value: "competition", label: "Competitions", hint: "hackathons, cases, contests" },
  { value: "leadership_program", label: "Leadership programs", hint: "summits, civic programs" },
  { value: "career_development_program", label: "Career development", hint: "mentorship, insight weeks" },
];

function Chip({
  selected,
  onClick,
  children,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        selected
          ? "border-primary bg-primary/5 text-neutral-900 dark:text-neutral-100"
          : "border-neutral-200 text-neutral-700 hover:border-neutral-300 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700"
      }`}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-neutral-100 pt-8 dark:border-neutral-900">
      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </h2>
      {description && (
        <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-500">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function PreferencesFlow({
  compact = false,
  onSaved,
}: {
  /** Compact mode (onboarding): categories + sub-types only. */
  compact?: boolean;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [prefs, setPrefs] = useState<StudentPreferences>({ ...DEFAULT_PREFERENCES });
  const [schoolInput, setSchoolInput] = useState("");
  const [transferSchoolInput, setTransferSchoolInput] = useState("");
  const [showRareNextLevels, setShowRareNextLevels] = useState(false);

  useEffect(() => {
    async function load() {
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
      setProfile((profileData as Record<string, unknown>) || null);
      setPrefs(preferencesFromProfile(profileData as Record<string, unknown>));
      setLoading(false);
    }
    load();
  }, []);

  const planLimits = getPlanLimitsForProfile(profile);
  const scoredCap =
    planLimits.rankedCategoryLimit === "all"
      ? CATEGORY_OPTIONS.length
      : Math.max(1, Number(planLimits.rankedCategoryLimit) || 1);

  const nextLevelChoices = nextLevelChoicesFor(String(profile?.education_level || ""));
  const visibleNextLevelOptions = NEXT_LEVEL_TYPE_OPTIONS.filter((option) =>
    nextLevelChoices.prominent.includes(option.value) ||
    (showRareNextLevels && nextLevelChoices.more.includes(option.value)) ||
    // A previously saved rare choice always stays visible and deselectable.
    prefs.next_level.types.includes(option.value)
  );

  const selectedWithSubtypes = useMemo(
    () =>
      Array.from(
        new Set([...prefs.scored_categories, ...prefs.access_categories])
      ).filter(categoryHasSubtypes),
    [prefs.scored_categories, prefs.access_categories]
  );

  function update(mutate: (draft: StudentPreferences) => void) {
    setPrefs((current) => {
      const draft = normalizePreferences(JSON.parse(JSON.stringify(current)));
      mutate(draft);
      return draft;
    });
  }

  function toggleScored(category: string) {
    update((draft) => {
      if (draft.scored_categories.includes(category)) {
        draft.scored_categories = draft.scored_categories.filter((c) => c !== category);
      } else if (draft.scored_categories.length < scoredCap) {
        draft.scored_categories.push(category);
      }
    });
  }

  function toggleAccess(category: string) {
    update((draft) => {
      draft.access_categories = draft.access_categories.includes(category)
        ? draft.access_categories.filter((c) => c !== category)
        : [...draft.access_categories, category];
    });
  }

  function toggleSubtype(category: string, subtype: string) {
    update((draft) => {
      const current = draft.subtypes[category] || [];
      const next = current.includes(subtype)
        ? current.filter((s) => s !== subtype)
        : [...current, subtype];
      if (next.length) draft.subtypes[category] = next;
      else delete draft.subtypes[category];
    });
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      preferences: normalizePreferences(prefs) as unknown as Record<string, unknown>,
      // Compatibility: scoring's legacy fallback and older surfaces read
      // these profile fields; preferences own them now but both stay true.
      target_opportunity_types: prefs.scored_categories,
      intended_school: prefs.transfer.planning ? prefs.transfer.school : null,
      updated_at: new Date().toISOString(),
    };

    let { error } = await supabase.from("profiles").update(payload).eq("id", user.id);
    if (error && /column|schema/i.test(error.message)) {
      // preferences column not migrated yet — save what exists today.
      const { preferences: _pending, ...fallback } = payload;
      ({ error } = await supabase.from("profiles").update(fallback).eq("id", user.id));
      if (!error) {
        setMessage(
          "Saved. (Full preferences activate once the pending database migration is applied.)"
        );
      }
    }

    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (!message) setMessage("Preferences saved.");

    // Fresh preferences change what gets scored — schedule a refresh.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      fetch("/api/scoring-jobs/schedule", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {});
    }
    onSaved?.();
  }

  if (loading) {
    return <p className="mt-8 text-sm text-neutral-400">Loading preferences…</p>;
  }

  return (
    <div className="space-y-8">
      {/* ── 1. Scored categories ── */}
      <section>
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          What should we score for you?
        </h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-500">
          AI competitiveness scores rank these against your profile. Your plan
          includes {scoredCap} scored categor{scoredCap === 1 ? "y" : "ies"} —
          {" "}{prefs.scored_categories.length} of {scoredCap} picked.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CATEGORY_OPTIONS.map((option) => {
            const selected = prefs.scored_categories.includes(option.value);
            return (
              <Chip
                key={option.value}
                selected={selected}
                disabled={!selected && prefs.scored_categories.length >= scoredCap}
                onClick={() => toggleScored(option.value)}
              >
                <span className="block font-medium">{option.label}</span>
                <span className="mt-0.5 block text-xs text-neutral-500">{option.hint}</span>
              </Chip>
            );
          })}
        </div>
      </section>

      {/* ── 2. Access categories ── */}
      <Section
        title="What else do you want in your database?"
        description="Browsable even without scores. Leave everything unselected to keep access to all categories."
      >
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.filter(
            (option) => !prefs.scored_categories.includes(option.value)
          ).map((option) => (
            <Chip
              key={option.value}
              selected={prefs.access_categories.includes(option.value)}
              onClick={() => toggleAccess(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </Section>

      {/* ── 3. Conditional sub-types, only for selected branching categories ── */}
      {selectedWithSubtypes.map((category) => {
        const options = CATEGORY_SUBTYPES[category] || [];
        const label = CATEGORY_OPTIONS.find((o) => o.value === category)?.label || category;
        const chosen = prefs.subtypes[category] || [];
        return (
          <Section
            key={category}
            title={`Which kinds of ${label.toLowerCase()}?`}
            description="Pick any that interest you — leave all unselected for every kind."
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {options.map((option) => (
                <Chip
                  key={option.value}
                  selected={chosen.includes(option.value)}
                  onClick={() => toggleSubtype(category, option.value)}
                >
                  <span className="block font-medium">{option.label}</span>
                  {option.hint && (
                    <span className="mt-0.5 block text-xs text-neutral-500">{option.hint}</span>
                  )}
                </Chip>
              ))}
            </div>
          </Section>
        );
      })}

      {!compact && (
        <>
          {/* ── 4. Next level (adapts to the student's current level:
                 a high schooler is asked about college, an undergrad about
                 graduate school, a master's student about PhD/professional —
                 nobody sees options that make no sense for them) ── */}
          <Section
            title={nextLevelChoices.question}
            description="Opportunities a level above yours only appear if you ask for them."
          >
            <div className="flex gap-2">
              <Chip
                selected={!prefs.next_level.interested}
                onClick={() => update((d) => void (d.next_level.interested = false))}
              >
                No — my level only
              </Chip>
              <Chip
                selected={prefs.next_level.interested}
                onClick={() => update((d) => void (d.next_level.interested = true))}
              >
                Yes — show me what&apos;s next
              </Chip>
            </div>

            {prefs.next_level.interested && (
              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    Which kind?
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {visibleNextLevelOptions.map((option) => (
                      <Chip
                        key={option.value}
                        selected={prefs.next_level.types.includes(option.value)}
                        onClick={() =>
                          update((d) => {
                            d.next_level.types = d.next_level.types.includes(option.value)
                              ? d.next_level.types.filter((t) => t !== option.value)
                              : [...d.next_level.types, option.value];
                          })
                        }
                      >
                        {option.label}
                      </Chip>
                    ))}
                    {nextLevelChoices.more.length > 0 && !showRareNextLevels && (
                      <button
                        type="button"
                        onClick={() => setShowRareNextLevels(true)}
                        className="rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-500 hover:border-neutral-400 dark:border-neutral-700"
                      >
                        More options
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-w-md">
                  <SearchableMultiSelect
                    label="In which field? (up to 2 — may differ from your major)"
                    selected={prefs.next_level.fields}
                    onChange={(values) =>
                      update((d) => void (d.next_level.fields = values.slice(0, 2)))
                    }
                    options={fieldOptionsForNextLevel(prefs.next_level.types)}
                    placeholder="Search field..."
                    maxSelected={2}
                  />
                </div>

                <div>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    Where?
                  </p>
                  <div className="mt-2 flex gap-2">
                    {(["us", "canada", "either"] as const).map((country) => (
                      <Chip
                        key={country}
                        selected={prefs.next_level.country === country}
                        onClick={() => update((d) => void (d.next_level.country = country))}
                      >
                        {country === "us" ? "United States" : country === "canada" ? "Canada" : "Either"}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    Target schools <span className="font-normal text-neutral-400">(up to 5 — we prioritize their opportunities)</span>
                  </p>
                  <div className="mt-2 flex max-w-md gap-2">
                    <input
                      value={schoolInput}
                      onChange={(event) => setSchoolInput(event.target.value)}
                      placeholder="e.g. McGill University"
                      className="h-10 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-900"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          const value = schoolInput.trim();
                          if (value) {
                            update((d) => {
                              if (
                                !d.next_level.target_schools.includes(value) &&
                                d.next_level.target_schools.length < 5
                              ) {
                                d.next_level.target_schools.push(value);
                              }
                            });
                            setSchoolInput("");
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const value = schoolInput.trim();
                        if (value) {
                          update((d) => {
                            if (
                              !d.next_level.target_schools.includes(value) &&
                              d.next_level.target_schools.length < 5
                            ) {
                              d.next_level.target_schools.push(value);
                            }
                          });
                          setSchoolInput("");
                        }
                      }}
                      className="rounded-lg border border-neutral-200 px-3 text-sm dark:border-neutral-800"
                    >
                      Add
                    </button>
                  </div>
                  {prefs.next_level.target_schools.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {prefs.next_level.target_schools.map((school) => (
                        <button
                          key={school}
                          type="button"
                          onClick={() =>
                            update((d) => {
                              d.next_level.target_schools = d.next_level.target_schools.filter(
                                (s) => s !== school
                              );
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2.5 py-1 text-sm text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-300"
                        >
                          {school} <span aria-hidden>✕</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Section>

          {/* ── 5. Transfer ── */}
          <Section
            title="Planning to transfer schools?"
            description="We surface and prioritize your destination school's opportunities."
          >
            <div className="flex gap-2">
              <Chip
                selected={!prefs.transfer.planning}
                onClick={() =>
                  update((d) => {
                    d.transfer = { planning: false, country: null, school: null, schools: [] };
                  })
                }
              >
                No
              </Chip>
              <Chip
                selected={prefs.transfer.planning}
                onClick={() => update((d) => void (d.transfer.planning = true))}
              >
                Yes
              </Chip>
            </div>
            {prefs.transfer.planning && (
              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  {(["us", "canada"] as const).map((country) => (
                    <Chip
                      key={country}
                      selected={prefs.transfer.country === country}
                      onClick={() => update((d) => void (d.transfer.country = country))}
                    >
                      {country === "us" ? "United States" : "Canada"}
                    </Chip>
                  ))}
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    Destination schools{" "}
                    <span className="font-normal text-neutral-400">
                      (up to 3 — {prefs.transfer.schools.length}/3)
                    </span>
                  </p>
                  <div className="mt-2 flex max-w-md gap-2">
                    <input
                      value={transferSchoolInput}
                      onChange={(event) => setTransferSchoolInput(event.target.value)}
                      placeholder="e.g. University of Toronto"
                      disabled={prefs.transfer.schools.length >= 3}
                      className="h-10 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-900"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          const value = transferSchoolInput.trim();
                          if (value && prefs.transfer.schools.length < 3) {
                            update((d) => {
                              if (!d.transfer.schools.includes(value)) {
                                d.transfer.schools.push(value);
                                d.transfer.school = d.transfer.schools[0];
                              }
                            });
                            setTransferSchoolInput("");
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={prefs.transfer.schools.length >= 3}
                      onClick={() => {
                        const value = transferSchoolInput.trim();
                        if (value && prefs.transfer.schools.length < 3) {
                          update((d) => {
                            if (!d.transfer.schools.includes(value)) {
                              d.transfer.schools.push(value);
                              d.transfer.school = d.transfer.schools[0];
                            }
                          });
                          setTransferSchoolInput("");
                        }
                      }}
                      className="rounded-lg border border-neutral-200 px-3 text-sm disabled:opacity-50 dark:border-neutral-800"
                    >
                      Add
                    </button>
                  </div>
                  {prefs.transfer.schools.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {prefs.transfer.schools.map((school) => (
                        <button
                          key={school}
                          type="button"
                          onClick={() =>
                            update((d) => {
                              d.transfer.schools = d.transfer.schools.filter((s) => s !== school);
                              d.transfer.school = d.transfer.schools[0] || null;
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2.5 py-1 text-sm text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-300"
                        >
                          {school} <span aria-hidden>✕</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Section>

        </>
      )}

      <div className="flex items-center gap-4 border-t border-neutral-100 pt-6 dark:border-neutral-900">
        <button
          type="button"
          onClick={save}
          disabled={saving || prefs.scored_categories.length === 0}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
        {prefs.scored_categories.length === 0 && (
          <p className="text-sm text-neutral-400">Pick at least one scored category.</p>
        )}
        {message && <p className="text-sm text-neutral-600 dark:text-neutral-300">{message}</p>}
      </div>
    </div>
  );
}
