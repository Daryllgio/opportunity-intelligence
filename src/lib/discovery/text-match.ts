/**
 * Shared text/token matching helpers for the discovery pipeline.
 *
 * These were previously copy-pasted across source-quality, the destination
 * ranker, and the official-source lookup with subtle drift. This is now the
 * single implementation.
 */

export function normalizeMatchText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenSet(value: unknown, minLength = 3) {
  return new Set(
    normalizeMatchText(value)
      .split(" ")
      .filter((token) => token.length >= minLength)
  );
}

/**
 * Overlap ratio between two token sets, relative to the smaller set.
 * Returns 0..1. Note: this can NOT match multi-word names against
 * concatenated domain labels ("gwags foundation" vs "gwagsfoundation") —
 * use `providerMatchesDomain` in domain-policy for that.
 */
export function tokenOverlap(left: unknown, right: unknown) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);

  if (!leftTokens.size || !rightTokens.size) return 0;

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }

  return shared / Math.min(leftTokens.size, rightTokens.size);
}

export function hasAnySignal(text: unknown, signals: string[]) {
  const normalized = normalizeMatchText(text);
  return signals.some((signal) => normalized.includes(normalizeMatchText(signal)));
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** True when a YYYY-MM-DD (or raw) deadline appears in the text in any common form. */
export function deadlineAppearsInText(
  deadline: string | null | undefined,
  text: string
) {
  if (!deadline) return false;

  const raw = String(deadline).trim();
  if (!raw) return false;

  const normalizedText = normalizeMatchText(text);

  if (normalizedText.includes(normalizeMatchText(raw))) return true;

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const [, year, month, day] = match;
  const monthName = MONTH_NAMES[Number(month) - 1];
  const dayNumber = Number(day);

  if (!monthName || !dayNumber || !year) return false;

  const paddedDay = String(dayNumber).padStart(2, "0");

  return [
    `${monthName} ${dayNumber} ${year}`,
    `${monthName} ${dayNumber}`,
    `${monthName} ${paddedDay} ${year}`,
    `${monthName} ${paddedDay}`,
  ].some((pattern) => normalizedText.includes(pattern));
}
