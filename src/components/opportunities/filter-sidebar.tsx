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
  const activeCountry = searchParams.get("country") || "";
  const activeDeadlineTo = searchParams.get("deadline_to") || "";

  const checkbox =
    "flex cursor-pointer items-center gap-2 py-1 text-sm text-neutral-600 dark:text-neutral-300";

  return (
    <div className="text-sm">
      <FilterGroup title="Opportunity type">
        <div className="space-y-0.5">
          {OPPORTUNITY_TYPES.map((option) => (
            <label key={option.value} className={checkbox}>
              <input
                type="checkbox"
                checked={activeTypes.includes(option.value)}
                onChange={() => toggleCsv("type", option.value)}
                className="h-4 w-4 rounded border-neutral-300 accent-neutral-600 focus:ring-neutral-400"
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
                className={`rounded-md border px-3 py-1 text-xs transition-colors ${
                  isActive
                    ? "border-neutral-400 bg-neutral-100 text-neutral-900 dark:border-neutral-500 dark:bg-neutral-800 dark:text-neutral-100"
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
          className="mt-4 w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Show results
        </button>
      )}
    </div>
  );
}
