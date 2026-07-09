/**
 * Deduplication BEFORE any AI is spent.
 *
 * A rediscovered opportunity must be recognized from what search alone gives
 * us — URL and link title — so the pipeline never pays for capture,
 * extraction, ranking, or verification on something the catalog already has.
 *
 * Three deterministic layers:
 *   1. normalized URL vs opportunities + drafts
 *   2. yearless title key + same domain ("Smith Scholarship 2025" vs "2026")
 *   3. yearless title key + canonical provider alias (NSF = National Science
 *      Foundation) when a provider is available
 *
 * Cross-year hits on an expired row don't just skip — they pull the row's
 * renewal check forward so the cycle transition runs through the renewal
 * engine (one re-extraction, verified publish, score reuse) instead of
 * minting a duplicate.
 */
import { normalizeUrl } from "@/lib/utils/url-normalizer";

type SupabaseClientLike = {
  from: (table: string) => any;
};

// Canonical names for providers that appear under many spellings. Keys and
// values are compared post-normalization (lowercase, no punctuation).
const PROVIDER_ALIASES: Record<string, string> = {
  "nsf": "national science foundation",
  "us national science foundation": "national science foundation",
  "u s national science foundation": "national science foundation",
  "nih": "national institutes of health",
  "us national institutes of health": "national institutes of health",
  "nserc": "natural sciences and engineering research council",
  "natural sciences and engineering research council of canada": "natural sciences and engineering research council",
  "sshrc": "social sciences and humanities research council",
  "cihr": "canadian institutes of health research",
  "doe": "department of energy",
  "us department of energy": "department of energy",
  "us department of state": "department of state",
  "u s department of state": "department of state",
  "state department": "department of state",
  "gates foundation": "bill and melinda gates foundation",
  "amazon": "amazon com",
  "google llc": "google",
  "google inc": "google",
  "microsoft corporation": "microsoft",
};

function squash(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical provider name: alias-resolved, org-suffix-stripped. */
export function canonicalProvider(value: unknown): string {
  let name = squash(value)
    .replace(/\b(inc|llc|ltd|corp|corporation|foundation inc|co)\b\.?$/g, "")
    .trim();
  if (PROVIDER_ALIASES[name]) return PROVIDER_ALIASES[name];
  return name;
}

/** Title key with cycle noise removed: years, "annual", ordinal cycles. */
export function yearlessTitleKey(value: unknown): string {
  return (
    String(value || "")
      .toLowerCase()
      // Year ranges before punctuation squashing ("2025-26", "2025/2026").
      .replace(/\b(19|20)\d{2}\s*[-/–]\s*(19|20)?\d{2}\b/g, " ")
      .replace(/\b(19|20)\d{2}\b/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\b\d{1,3}(st|nd|rd|th)\b/g, " ") // 47th annual
      .replace(/\bannual\b/g, " ")
      // Singular/plural noise on the generic nouns ("Scholarships" vs
      // "Scholarship").
      .replace(/\b(scholarship|fellowship|award|grant|program|competition|bursar(?:y|ie))s\b/g, "$1")
      .replace(/\bbursarie\b/g, "bursary")
      .replace(/\s+/g, " ")
      .trim()
  );
}

// Words too common in opportunity titles to identify anything.
const GENERIC_TITLE_TOKENS = new Set([
  "scholarship", "scholarships", "fellowship", "fellowships", "program",
  "programs", "award", "awards", "grant", "grants", "competition", "contest",
  "challenge", "university", "college", "national", "international",
  "student", "students", "undergraduate", "graduate", "research", "summer",
  "foundation", "institute", "school", "academy", "leadership",
]);

/** The most identifying token of a title, for a cheap ilike pre-filter. */
export function distinctiveToken(titleKey: string): string | null {
  const tokens = titleKey.split(" ").filter((t) => t.length >= 5);
  const specific = tokens.filter((t) => !GENERIC_TITLE_TOKENS.has(t));
  const pool = specific.length > 0 ? specific : tokens;
  return pool.sort((a, b) => b.length - a.length)[0] || null;
}

function domainOf(url: unknown): string {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export type KnownOpportunityMatch = {
  known: boolean;
  matchType: "url" | "title_domain" | "title_provider" | null;
  table: "opportunities" | "opportunity_drafts" | null;
  rowId: string | null;
  rowTitle: string | null;
  rowIsLive: boolean;
  renewalScheduled: boolean;
};

const NO_MATCH: KnownOpportunityMatch = {
  known: false,
  matchType: null,
  table: null,
  rowId: null,
  rowTitle: null,
  rowIsLive: false,
  renewalScheduled: false,
};

/**
 * Is this URL/title already in the catalog or draft pool? Cheap DB reads
 * only — call BEFORE capture/extraction.
 */
export async function checkKnownOpportunity({
  supabase,
  url,
  title,
  provider = null,
}: {
  supabase: SupabaseClientLike;
  url: string;
  title?: string | null;
  provider?: string | null;
}): Promise<KnownOpportunityMatch> {
  const normalizedUrl = normalizeUrl(url);

  // Layer 1 — exact normalized URL.
  if (normalizedUrl) {
    for (const table of ["opportunities", "opportunity_drafts"] as const) {
      const { data } = await supabase
        .from(table)
        .select("id, title, is_active, lifecycle_status")
        .eq("normalized_url", normalizedUrl)
        .limit(1)
        .maybeSingle();
      if (data?.id) {
        return finalizeMatch(supabase, table, data, "url");
      }
    }
  }

  // Layers 2/3 — yearless title matching. Needs a meaningful title.
  const titleKey = yearlessTitleKey(title);
  if (titleKey.length < 8) return NO_MATCH;

  // Fetch plausible rows by the title's most distinctive token, then compare
  // keys in JS. Catalog-scale friendly (hundreds of rows, indexed ilike).
  const probe = distinctiveToken(titleKey);
  if (!probe) return NO_MATCH;

  const pageDomain = domainOf(url);
  const providerKey = canonicalProvider(provider);

  for (const table of ["opportunities", "opportunity_drafts"] as const) {
    const { data: rows } = await supabase
      .from(table)
      .select("id, title, provider, normalized_url, source_url, application_destination_url, is_active, lifecycle_status")
      .ilike("title", `%${probe}%`)
      .limit(25);

    for (const row of rows || []) {
      if (yearlessTitleKey(row.title) !== titleKey) continue;
      // Identity can live on any of the row's URLs: where it was found, or —
      // most reliably — where applicants are sent. Two records sharing a
      // verified destination are the same opportunity regardless of which
      // page each was discovered on.
      const rowDomains = new Set(
        [
          domainOf(row.normalized_url),
          domainOf(row.source_url),
          domainOf(row.application_destination_url),
        ].filter(Boolean)
      );
      const domainMatches = Boolean(pageDomain && rowDomains.has(pageDomain));
      const providerMatches = Boolean(
        providerKey &&
          canonicalProvider(row.provider) &&
          canonicalProvider(row.provider) === providerKey
      );
      if (domainMatches) {
        return finalizeMatch(supabase, table, row, "title_domain");
      }
      if (providerMatches) {
        return finalizeMatch(supabase, table, row, "title_provider");
      }
    }
  }

  return NO_MATCH;
}

/**
 * Publish-time guard: is there already a LIVE row sending applicants to this
 * destination? Two records sharing a verified destination are one
 * opportunity — the second must not go live.
 */
export async function findLiveRowByDestination({
  supabase,
  destinationUrl,
  excludeId = null,
}: {
  supabase: SupabaseClientLike;
  destinationUrl: string;
  excludeId?: string | null;
}): Promise<{ id: string; title: string | null } | null> {
  const normalized = normalizeUrl(destinationUrl);
  if (!normalized) return null;
  const variants = Array.from(
    new Set([destinationUrl, normalized, `${normalized}/`])
  );

  let query = supabase
    .from("opportunities")
    .select("id, title")
    .eq("is_active", true)
    .in("application_destination_url", variants)
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);

  const { data } = await query.maybeSingle();
  return data?.id ? { id: String(data.id), title: data.title ?? null } : null;
}

async function finalizeMatch(
  supabase: SupabaseClientLike,
  table: "opportunities" | "opportunity_drafts",
  row: Record<string, any>,
  matchType: KnownOpportunityMatch["matchType"]
): Promise<KnownOpportunityMatch> {
  const isLive =
    table === "opportunities" &&
    row.is_active === true &&
    row.lifecycle_status === "active";

  // A rediscovery of an EXPIRED catalog row usually means the next cycle is
  // out. Pull its renewal check forward — the renewal engine re-reads the
  // page, verifies, republishes, and reuses scores. No duplicate, no wasted
  // fresh-discovery AI.
  let renewalScheduled = false;
  if (table === "opportunities" && !isLive && row.lifecycle_status === "expired") {
    await supabase
      .from("opportunities")
      .update({
        next_check_at: new Date().toISOString(),
        check_reason: "renewal_window",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    renewalScheduled = true;
  }

  return {
    known: true,
    matchType,
    table,
    rowId: String(row.id),
    rowTitle: row.title ? String(row.title) : null,
    rowIsLive: isLive,
    renewalScheduled,
  };
}
