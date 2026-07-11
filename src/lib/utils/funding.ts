/**
 * Funding-amount parsing for the scholarship funding filter.
 *
 * funding_amount is honest free text from extraction ("CA$5,000 per year,
 * renewable", "$68,000 annual stipend", "Full tuition", "Up to $12,000 over
 * 4 years"). The filter needs one comparable number per row and a
 * full-tuition flag. Multi-year awards compare by their stated TOTAL — when
 * a page says "over 4 years" the number printed is already the total; when
 * it says "per year for N years" we multiply. No currency conversion ever:
 * the number is compared as printed, whatever the currency.
 */

export type ParsedFunding = {
  /** The comparable amount (largest stated figure, totalized), or null. */
  amount: number | null;
  fullTuition: boolean;
};

const FULL_TUITION_SIGNALS = [
  "full tuition",
  "full-tuition",
  "full ride",
  "full funding",
  "fully funded",
  "covers tuition",
  "tuition waiver",
  "100% of tuition",
];

export function parseFundingAmount(raw: unknown): ParsedFunding {
  const text = String(raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return { amount: null, fullTuition: false };

  const fullTuition = FULL_TUITION_SIGNALS.some((signal) => text.includes(signal));

  // Numbers like 5,000 / 5000 / 5k / 1.5k / 12 000
  const matches = Array.from(
    text.matchAll(/(\d{1,3}(?:[, ]\d{3})+|\d+(?:\.\d+)?)(\s*k\b)?/g)
  )
    .map((match) => {
      let value = Number(match[1].replace(/[, ]/g, ""));
      if (match[2]) value *= 1000;
      return value;
    })
    .filter((value) => Number.isFinite(value) && value >= 50 && value <= 2_000_000);

  if (matches.length === 0) return { amount: null, fullTuition };

  let amount = Math.max(...matches);

  // "per year for 4 years" / "annually for up to 3 years": totalize.
  const perYearMatch = text.match(
    /(?:per year|annually|each year|\/year|a year).{0,40}?(?:for(?: up to)?|renewable(?: for up to)?)\s*(\d)\s*(?:years|yrs)/
  );
  if (perYearMatch) {
    const years = Number(perYearMatch[1]);
    if (years >= 2 && years <= 6) amount *= years;
  }

  return { amount, fullTuition };
}

export type FundingFilter = {
  /** Minimum amount, or null for no minimum. */
  min: number | null;
  /** Only full-tuition awards. */
  fullTuitionOnly: boolean;
};

/** Presets shown on the browse page when filtering scholarships. */
export const FUNDING_PRESETS: { label: string; min: number | null; full?: boolean }[] = [
  { label: "Any amount", min: null },
  { label: "$1,000+", min: 1000 },
  { label: "$5,000+", min: 5000 },
  { label: "$10,000+", min: 10000 },
  { label: "$25,000+", min: 25000 },
  { label: "Full tuition", min: null, full: true },
];

/**
 * Does a row pass the funding filter? Rows with UNPARSEABLE funding stay
 * visible under a minimum-amount filter (never wrongly hide an award whose
 * page words the amount unusually) but are excluded from the explicit
 * full-tuition preset, which promises a specific thing.
 */
export function passesFundingFilter(
  fundingAmount: unknown,
  filter: FundingFilter
): boolean {
  if (!filter.fullTuitionOnly && filter.min === null) return true;
  const parsed = parseFundingAmount(fundingAmount);

  if (filter.fullTuitionOnly) return parsed.fullTuition;

  if (parsed.fullTuition) return true; // full tuition beats any minimum
  if (parsed.amount === null) return true; // unparseable fails open
  return parsed.amount >= (filter.min || 0);
}
