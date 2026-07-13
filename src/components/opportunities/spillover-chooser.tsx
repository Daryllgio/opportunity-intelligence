"use client";

/**
 * The spillover choice — shown once (per month, dismissible) when the
 * user's scored categories can't fill their monthly quota. Two options
 * side by side, the user picks one:
 *
 *   A. Double down: unused slots keep scoring their SCORED categories
 *      (the per-category spread relaxes).
 *   B. Spill into database-access categories — equally, or with manual
 *      per-category slot counts.
 *
 * The choice persists in preferences and drives the batch scorer.
 */
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  normalizePreferences,
  preferencesFromProfile,
} from "@/lib/preferences/types";

const CATEGORY_LABELS: Record<string, string> = {
  scholarship: "Scholarships",
  grant: "Grants",
  research_program: "Research programs",
  fellowship: "Fellowships",
  competition: "Competitions",
  leadership_program: "Leadership programs",
  career_development_program: "Career development",
};

export function SpilloverChooser({
  profileRow,
  onDone,
}: {
  profileRow: Record<string, unknown> | null;
  onDone: () => void;
}) {
  const prefs = useMemo(() => preferencesFromProfile(profileRow), [profileRow]);
  const accessOptions = useMemo(() => {
    const all = Object.keys(CATEGORY_LABELS);
    const pool = prefs.access_categories.length > 0 ? prefs.access_categories : all;
    return pool.filter((category) => !prefs.scored_categories.includes(category));
  }, [prefs]);

  const [choice, setChoice] = useState<"scored" | "access" | null>(null);
  const [manual, setManual] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(target: "scored" | "access") {
    setBusy(true);
    setMessage("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const updated = normalizePreferences({
      ...prefs,
      spillover: {
        target,
        allocations:
          target === "access" && manual && Object.keys(allocations).length > 0
            ? allocations
            : null,
      },
    });

    const { error } = await supabase
      .from("profiles")
      .update({
        preferences: updated as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    setBusy(false);
    if (error) {
      setMessage("Could not save — try again from Preferences.");
      return;
    }
    setMessage("Saved. Your next scoring run uses this.");
    setTimeout(onDone, 1500);
  }

  return (
    <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-neutral-800 dark:text-neutral-200">
          Your scored categories don&apos;t have enough new opportunities to
          use your monthly scoring capacity. Where should the rest go?
        </p>
        <button
          type="button"
          onClick={onDone}
          className="shrink-0 text-sm text-neutral-400 hover:text-neutral-600"
        >
          Dismiss
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setChoice("scored")}
          className={`rounded-lg border p-3 text-left text-sm transition-colors ${
            choice === "scored"
              ? "border-primary bg-primary/5"
              : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700"
          }`}
        >
          <span className="block font-medium">Double down on my scored categories</span>
          <span className="mt-0.5 block text-xs text-neutral-500">
            Keep all capacity in{" "}
            {prefs.scored_categories.map((c) => CATEGORY_LABELS[c] || c).join(", ") || "your picks"}.
          </span>
        </button>

        <button
          type="button"
          onClick={() => setChoice("access")}
          disabled={accessOptions.length === 0}
          className={`rounded-lg border p-3 text-left text-sm transition-colors disabled:opacity-40 ${
            choice === "access"
              ? "border-primary bg-primary/5"
              : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700"
          }`}
        >
          <span className="block font-medium">Score my other categories too</span>
          <span className="mt-0.5 block text-xs text-neutral-500">
            Spread into {accessOptions.slice(0, 3).map((c) => CATEGORY_LABELS[c] || c).join(", ")}
            {accessOptions.length > 3 ? "…" : ""}.
          </span>
        </button>
      </div>

      {choice === "access" && accessOptions.length > 0 && (
        <div className="mt-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={manual}
              onChange={(event) => setManual(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-neutral-300"
            />
            Assign slots per category myself (otherwise spread equally)
          </label>
          {manual && (
            <div className="mt-2 flex flex-wrap gap-3">
              {accessOptions.map((category) => (
                <label key={category} className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
                  {CATEGORY_LABELS[category] || category}
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={allocations[category] ?? ""}
                    onChange={(event) =>
                      setAllocations((current) => ({
                        ...current,
                        [category]: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                      }))
                    }
                    className="h-8 w-16 rounded-md border border-neutral-200 bg-white px-2 dark:border-neutral-700 dark:bg-neutral-950"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={!choice || busy}
          onClick={() => choice && save(choice)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Saving…" : "Use this"}
        </button>
        {message && <p className="text-xs text-neutral-600 dark:text-neutral-400">{message}</p>}
      </div>
    </div>
  );
}
