/**
 * Demand-driven school discovery — the demand side.
 *
 * THE PRINCIPLE: discovery follows demand. 2,400+ universities × every level
 * × every field would cost a fortune and serve nobody; instead, a
 * (school × level × field) slice enters the queue only when a real user's
 * profile or preferences ask for it:
 *   - their own school + current level + major(s),
 *   - their transfer destination schools (+ level + fields),
 *   - their graduate/next-level target schools (+ degree type + fields),
 * and each slice is scoped to the categories that user actually selected —
 * plus a general (all-fields) slice per school+level, because schools run
 * plenty of "any student at this level" awards.
 *
 * The queue is deduplicated by demand_key: the second Carleton CS undergrad
 * costs nothing (their registration just merges categories and the
 * reconciliation sweep recounts user_count). No new demand = the daytime
 * cron does nothing = cost ~0.
 */
import { preferencesFromProfile } from "@/lib/preferences/types";
import type { NextLevelType } from "@/lib/preferences/types";

type SupabaseClientLike = { from: (table: string) => any };
type Row = Record<string, unknown>;

export type DemandSlice = {
  school: string;
  country: string | null;
  level: string;
  field: string | null; // null = the general/all-fields slice
  categories: string[];
};

const ALL_CATEGORIES = [
  "scholarship", "fellowship", "research_program", "grant",
  "competition", "leadership_program", "career_development_program",
];

function normalizeKeyPart(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function demandKeyFor(slice: Pick<DemandSlice, "school" | "level" | "field">): string {
  return [
    normalizeKeyPart(slice.school),
    normalizeKeyPart(slice.level),
    normalizeKeyPart(slice.field) || "general",
  ].join("|");
}

function canonicalLevelFromProfile(educationLevel: unknown): string {
  const level = String(educationLevel || "").toLowerCase();
  if (level.includes("high")) return "high_school";
  if (level.includes("master")) return "masters";
  if (level.includes("phd") || level.includes("doctor")) return "phd";
  if (level.includes("mba")) return "mba";
  if (level.includes("law")) return "jd";
  if (level.includes("medic")) return "md";
  if (level.includes("professional")) return "professional";
  return "undergraduate";
}

const NEXT_LEVEL_TO_DEMAND_LEVEL: Record<NextLevelType, string> = {
  undergraduate: "undergraduate",
  masters: "masters",
  masters_other: "masters",
  phd: "phd",
  mba: "mba",
  jd: "jd",
  md: "md",
  professional_other: "professional",
};

function cleanField(value: unknown): string | null {
  const field = String(value ?? "").trim();
  if (!field) return null;
  const lower = field.toLowerCase();
  if (lower === "other" || lower.includes("undeclared") || lower.includes("undecided")) {
    return null;
  }
  return field.slice(0, 80);
}

/**
 * Every (school × level × field) slice this user's profile + preferences
 * imply, scoped to their selected categories. Deterministic and cheap —
 * safe to re-derive for reconciliation.
 */
export function deriveDemandSlices(profile: Row): DemandSlice[] {
  const preferences = preferencesFromProfile(profile);
  const categories = Array.from(
    new Set([...preferences.scored_categories, ...preferences.access_categories])
  );
  const effectiveCategories = categories.length > 0 ? categories : ALL_CATEGORIES;

  const country =
    String(profile.country_of_study || "").toLowerCase().includes("canada")
      ? "canada"
      : String(profile.country_of_study || "").toLowerCase().includes("united")
        ? "us"
        : null;

  const slices: DemandSlice[] = [];
  const seen = new Set<string>();
  const push = (slice: DemandSlice) => {
    if (!slice.school || slice.school.length < 3) return;
    const key = demandKeyFor(slice);
    if (seen.has(key)) return;
    seen.add(key);
    slices.push(slice);
  };

  // 1. The user's own school, current level, own field(s) + the general slice.
  const ownSchool = String(
    (profile.school === "Other" ? profile.school_other : profile.school) || ""
  ).trim();
  if (ownSchool) {
    const level = canonicalLevelFromProfile(profile.education_level);
    const ownFields = [
      cleanField(profile.field_of_study),
      cleanField(profile.field_of_study_secondary),
    ].filter((field): field is string => Boolean(field));
    for (const field of ownFields) {
      push({ school: ownSchool, country, level, field, categories: effectiveCategories });
    }
    push({ school: ownSchool, country, level, field: null, categories: effectiveCategories });
  }

  // 2. Transfer destinations: same level, user's own fields (capped at 3
  //    schools by preferences normalization).
  if (preferences.transfer.planning) {
    const level = canonicalLevelFromProfile(profile.education_level);
    const transferCountry = preferences.transfer.country || country;
    const fields = [cleanField(profile.field_of_study)].filter(
      (field): field is string => Boolean(field)
    );
    for (const school of preferences.transfer.schools) {
      for (const field of fields) {
        push({ school, country: transferCountry, level, field, categories: effectiveCategories });
      }
      push({ school, country: transferCountry, level, field: null, categories: effectiveCategories });
    }
  }

  // 3. Next-level targets: each target school × each chosen degree type ×
  //    the (≤2) chosen fields, plus the general slice.
  if (preferences.next_level.interested) {
    const nextCountry =
      preferences.next_level.country === "either"
        ? country
        : preferences.next_level.country;
    const fields = preferences.next_level.fields
      .map(cleanField)
      .filter((field): field is string => Boolean(field));
    const levels = Array.from(
      new Set(preferences.next_level.types.map((type) => NEXT_LEVEL_TO_DEMAND_LEVEL[type]))
    );
    for (const school of preferences.next_level.target_schools) {
      for (const level of levels) {
        for (const field of fields) {
          push({ school, country: nextCountry, level, field, categories: effectiveCategories });
        }
        push({ school, country: nextCountry, level, field: null, categories: effectiveCategories });
      }
    }
  }

  return slices;
}

/**
 * Ensure every slice exists in the queue. Idempotent: existing rows only
 * merge categories (a new category re-opens an exhausted row — there is
 * genuinely new ground to search). Never double-counts users; the sweep
 * owns user_count.
 */
export async function registerSchoolDemand({
  supabase,
  profile,
}: {
  supabase: SupabaseClientLike;
  profile: Row;
}): Promise<{ registered: number; merged: number }> {
  const slices = deriveDemandSlices(profile);
  let registered = 0;
  let merged = 0;

  for (const slice of slices) {
    const key = demandKeyFor(slice);
    const { data: existing, error } = await supabase
      .from("school_demand")
      .select("id, categories, status")
      .eq("demand_key", key)
      .maybeSingle();

    if (error) {
      // Table missing (migration pending): registration silently no-ops;
      // the reconciliation sweep picks everything up once it exists.
      return { registered, merged };
    }

    if (!existing) {
      await supabase.from("school_demand").insert({
        demand_key: key,
        school: slice.school,
        country: slice.country,
        level: slice.level,
        field: slice.field,
        categories: slice.categories,
      });
      registered += 1;
      continue;
    }

    const currentCategories = new Set<string>((existing.categories as string[]) || []);
    const newCategories = slice.categories.filter((c) => !currentCategories.has(c));
    if (newCategories.length > 0) {
      await supabase
        .from("school_demand")
        .update({
          categories: [...currentCategories, ...newCategories],
          // New categories = new ground: an exhausted row re-enters the queue.
          status: existing.status === "exhausted" ? "pending" : existing.status,
          consecutive_empty_passes: 0,
          next_pass_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      merged += 1;
    }
  }

  return { registered, merged };
}

/**
 * Authoritative reconciliation: re-derive demand from EVERY profile,
 * recount user_count per slice, insert anything registration missed, and
 * retire slices nobody wants anymore (user_count 0 → no further passes).
 * Runs at the top of each daytime cron — cheap (pure DB work), and it makes
 * the queue self-healing regardless of which write path missed what.
 */
export async function reconcileSchoolDemand({
  supabase,
}: {
  supabase: SupabaseClientLike;
}): Promise<{ slices: number; inserted: number; retired: number }> {
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*");
  if (profilesError) throw new Error(profilesError.message);

  const counts = new Map<string, { slice: DemandSlice; users: number }>();
  for (const profile of profiles || []) {
    for (const slice of deriveDemandSlices(profile)) {
      const key = demandKeyFor(slice);
      const entry = counts.get(key);
      if (entry) {
        entry.users += 1;
        for (const category of slice.categories) {
          if (!entry.slice.categories.includes(category)) {
            entry.slice.categories.push(category);
          }
        }
      } else {
        counts.set(key, { slice: { ...slice, categories: [...slice.categories] }, users: 1 });
      }
    }
  }

  const { data: existingRows, error: demandError } = await supabase
    .from("school_demand")
    .select("id, demand_key, categories, status, user_count");
  if (demandError) throw new Error(demandError.message);

  const existingByKey = new Map<string, Row>(
    ((existingRows || []) as Row[]).map((row) => [String(row.demand_key), row])
  );

  let inserted = 0;
  let retired = 0;
  const nowIso = new Date().toISOString();

  for (const [key, { slice, users }] of counts) {
    const existing = existingByKey.get(key);
    if (!existing) {
      await supabase.from("school_demand").insert({
        demand_key: key,
        school: slice.school,
        country: slice.country,
        level: slice.level,
        field: slice.field,
        categories: slice.categories,
        user_count: users,
      });
      inserted += 1;
      continue;
    }
    const mergedCategories = Array.from(
      new Set([...((existing.categories as string[]) || []), ...slice.categories])
    );
    const categoriesGrew =
      mergedCategories.length > ((existing.categories as string[]) || []).length;
    if (existing.user_count !== users || categoriesGrew) {
      await supabase
        .from("school_demand")
        .update({
          user_count: users,
          categories: mergedCategories,
          status:
            categoriesGrew && existing.status === "exhausted"
              ? "pending"
              : existing.status,
          ...(categoriesGrew ? { consecutive_empty_passes: 0, next_pass_at: nowIso } : {}),
          updated_at: nowIso,
        })
        .eq("id", existing.id);
    }
  }

  // Slices no profile implies anymore: freeze (never delete — the found
  // opportunities stay; we just stop spending passes).
  for (const row of existingRows || []) {
    if (!counts.has(String(row.demand_key)) && row.user_count !== 0) {
      await supabase
        .from("school_demand")
        .update({ user_count: 0, status: "exhausted", updated_at: nowIso })
        .eq("id", row.id);
      retired += 1;
    }
  }

  return { slices: counts.size, inserted, retired };
}
