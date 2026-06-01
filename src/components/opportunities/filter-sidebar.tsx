"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";

export const OPPORTUNITY_TYPES = [
  { value: "scholarship", label: "Scholarships" },
  { value: "research_program", label: "Research Programs" },
  { value: "fellowship", label: "Fellowships" },
  { value: "grant", label: "Grants" },
  { value: "competition", label: "Competitions" },
  { value: "leadership_program", label: "Leadership Programs" },
  { value: "career_development_program", label: "Career Development" },
  { value: "pipeline_program", label: "Pipeline Programs" },
];

export const EDUCATION_LEVELS = [
  { value: "high_school", label: "High School" },
  { value: "undergraduate", label: "Undergraduate" },
  { value: "transfer_student", label: "Transfer Student" },
  { value: "masters", label: "Master's" },
  { value: "phd", label: "PhD" },
  { value: "professional_student", label: "Professional School" },
  { value: "recent_graduate", label: "Recent Graduate" },
];

export const APPLICATION_STATUSES = [
  { value: "open", label: "Open" },
  { value: "rolling", label: "Rolling" },
  { value: "closed", label: "Closed" },
];

export const SORT_OPTIONS = [
  { value: "deadline_asc", label: "Deadline (soonest)" },
  { value: "newest", label: "Newest first" },
  { value: "reward_high", label: "Highest reward" },
  { value: "effort_low", label: "Lowest effort" },
];

export const DEADLINE_PRESETS = [
  { value: "30", label: "Next 30 days" },
  { value: "90", label: "Next 90 days" },
  { value: "180", label: "Next 6 months" },
];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-neutral-200 py-4 dark:border-neutral-800">
      <h3 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </h3>
      {children}
    </div>
  );
}

export function FilterSidebar({ onApply }: { onApply?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const csvValues = (key: string) =>
    (searchParams.get(key) || "").split(",").filter(Boolean);

  const toggleCsv = (key: string, value: string) =>
    updateParams((params) => {
      const set = new Set((params.get(key) || "").split(",").filter(Boolean));
      if (set.has(value)) set.delete(value);
      else set.add(value);
      if (set.size) params.set(key, Array.from(set).join(","));
      else params.delete(key);
    });

  const setParam = (key: string, value: string | null) =>
    updateParams((params) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });

  const applyDeadlinePreset = (days: string) =>
    updateParams((params) => {
      const now = new Date();
      const end = new Date();
      end.setDate(end.getDate() + Number(days));
      params.set("deadline_from", isoDate(now));
      params.set("deadline_to", isoDate(end));
    });

  const activeTypes = csvValues("type");
  const activeEducation = csvValues("education");
  const activeStatus = searchParams.get("status") || "";
  const activeSort = searchParams.get("sort") || "deadline_asc";
  const activeCountry = searchParams.get("country") || "";
  const activeField = searchParams.get("field") || "";
  const activeDeadlineTo = searchParams.get("deadline_to") || "";

  const checkbox =
    "flex cursor-pointer items-center gap-2 py-1 text-sm text-neutral-600 dark:text-neutral-300";

  return (
    <div className="text-sm">
      <FilterGroup title="Sort by">
        <select
          value={activeSort}
          onChange={(event) => setParam("sort", event.target.value)}
          className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup title="Opportunity type">
        <div className="space-y-0.5">
          {OPPORTUNITY_TYPES.map((option) => (
            <label key={option.value} className={checkbox}>
              <input
                type="checkbox"
                checked={activeTypes.includes(option.value)}
                onChange={() => toggleCsv("type", option.value)}
                className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
              />
              {option.label}
            </label>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Education level">
        <div className="space-y-0.5">
          {EDUCATION_LEVELS.map((option) => (
            <label key={option.value} className={checkbox}>
              <input
                type="checkbox"
                checked={activeEducation.includes(option.value)}
                onChange={() => toggleCsv("education", option.value)}
                className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
              />
              {option.label}
            </label>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Application status">
        <div className="space-y-0.5">
          <label className={checkbox}>
            <input
              type="radio"
              name="status"
              checked={activeStatus === ""}
              onChange={() => setParam("status", null)}
              className="h-4 w-4 border-neutral-300 text-indigo-600 focus:ring-indigo-500"
            />
            Any
          </label>
          {APPLICATION_STATUSES.map((option) => (
            <label key={option.value} className={checkbox}>
              <input
                type="radio"
                name="status"
                checked={activeStatus === option.value}
                onChange={() => setParam("status", option.value)}
                className="h-4 w-4 border-neutral-300 text-indigo-600 focus:ring-indigo-500"
              />
              {option.label}
            </label>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Country">
        <input
          type="text"
          defaultValue={activeCountry}
          placeholder="e.g. United States"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setParam("country", (event.target as HTMLInputElement).value.trim() || null);
            }
          }}
          onBlur={(event) => setParam("country", event.target.value.trim() || null)}
          className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </FilterGroup>

      <FilterGroup title="Field of study">
        <input
          type="text"
          defaultValue={activeField}
          placeholder="e.g. Engineering"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setParam("field", (event.target as HTMLInputElement).value.trim() || null);
            }
          }}
          onBlur={(event) => setParam("field", event.target.value.trim() || null)}
          className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </FilterGroup>

      <FilterGroup title="Deadline">
        <div className="flex flex-wrap gap-2">
          {DEADLINE_PRESETS.map((preset) => {
            const isActive =
              activeDeadlineTo ===
              (() => {
                const end = new Date();
                end.setDate(end.getDate() + Number(preset.value));
                return isoDate(end);
              })();
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => applyDeadlinePreset(preset.value)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  isActive
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          {(searchParams.get("deadline_from") ||
            searchParams.get("deadline_to")) && (
            <button
              type="button"
              onClick={() =>
                updateParams((params) => {
                  params.delete("deadline_from");
                  params.delete("deadline_to");
                })
              }
              className="rounded-full px-3 py-1 text-xs text-neutral-500 hover:text-neutral-700"
            >
              Clear
            </button>
          )}
        </div>
      </FilterGroup>

      {onApply && (
        <button
          type="button"
          onClick={onApply}
          className="mt-4 w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Show results
        </button>
      )}
    </div>
  );
}
