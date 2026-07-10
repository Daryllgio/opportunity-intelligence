/**
 * Permanent display-formatting rule: database strings are machine tokens
 * ("highly_selective", "all_fields", "research_program") and must NEVER
 * reach the screen raw. Every UI render of a DB-sourced string goes through
 * humanize() — current data and every future extraction alike. This is a
 * rendering-layer guarantee, not a data cleanup.
 */

/** "highly_selective" -> "highly selective"; also collapses whitespace and
 * swaps em/en dashes for plain hyphens (machine-looking artifacts). */
export function humanize(value: unknown): string {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** humanize() plus a capitalized first letter, for labels and badges. */
export function humanizeLabel(value: unknown): string {
  const text = humanize(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

/** Format a YYYY-MM-DD date string WITHOUT timezone shifting.
 *
 * `new Date("2026-11-06")` is midnight UTC — in any western-hemisphere
 * timezone that renders as November 5. This is exactly the off-by-one the
 * founder saw on Pearson. Date-only strings are calendar dates, not
 * instants: format them from their parts, never through the Date timezone
 * machinery.
 */
export function formatDateOnly(
  value: unknown,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  }
): string {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text;
  const [, year, month, day] = match;
  // Noon UTC is safely the same calendar day in every real timezone.
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}
