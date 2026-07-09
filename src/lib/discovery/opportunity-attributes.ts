/**
 * Structured opportunity attributes — the facts that change whether and how
 * a student applies, beyond the core fields. Stored as one flexible jsonb
 * bag (`opportunities.attributes`) so new attribute kinds never need a
 * migration.
 *
 * Money display rule: amounts stay in their ORIGINAL currency with their
 * stated period. No conversion, ever — "CA$5,000 per year, renewable" is
 * honest; a converted total is a guess.
 */

export type OpportunityAttributes = {
  nomination_required?: boolean;
  team_based?: "individual" | "team" | "both";
  renewable?: boolean;
  renewal_terms?: string;
  funding_period?: "total" | "annual" | "monthly" | "per_semester" | "one_time";
  currency?: string; // ISO-ish code as stated: USD, CAD, ...
  recommendation_letters?: number;
  prerequisites?: string[];
  additional_deadlines?: Array<{ label: string; date: string }>;
  language_of_program?: string;
  deadline_time?: string; // "23:59" local to the provider when stated
  deadline_timezone?: string; // IANA zone or stated abbreviation
  exclusivity_note?: string;
  [key: string]: unknown; // room for kinds we didn't anticipate
};

function cleanString(value: unknown): string | undefined {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 300) : undefined;
}

function cleanBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").toLowerCase().trim();
  if (["true", "yes"].includes(text)) return true;
  if (["false", "no"].includes(text)) return false;
  return undefined;
}

function cleanIsoDate(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  return Number.isNaN(new Date(text).getTime()) ? undefined : text;
}

export function normalizeOpportunityAttributes(raw: unknown): OpportunityAttributes {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const out: OpportunityAttributes = {};

  const nomination = cleanBoolean(input.nomination_required);
  if (nomination !== undefined) out.nomination_required = nomination;

  const team = cleanString(input.team_based)?.toLowerCase();
  if (team === "individual" || team === "team" || team === "both") {
    out.team_based = team;
  }

  const renewable = cleanBoolean(input.renewable);
  if (renewable !== undefined) out.renewable = renewable;
  const renewalTerms = cleanString(input.renewal_terms);
  if (renewalTerms) out.renewal_terms = renewalTerms;

  const period = cleanString(input.funding_period)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (
    period === "total" || period === "annual" || period === "monthly" ||
    period === "per_semester" || period === "one_time"
  ) {
    out.funding_period = period;
  }

  const currency = cleanString(input.currency)?.toUpperCase();
  if (currency && /^[A-Z]{3}$/.test(currency)) out.currency = currency;

  const letters = Number(input.recommendation_letters);
  if (Number.isInteger(letters) && letters > 0 && letters <= 10) {
    out.recommendation_letters = letters;
  }

  if (Array.isArray(input.prerequisites)) {
    const prerequisites = input.prerequisites
      .map(cleanString)
      .filter((p): p is string => Boolean(p))
      .slice(0, 10);
    if (prerequisites.length) out.prerequisites = prerequisites;
  }

  if (Array.isArray(input.additional_deadlines)) {
    const rounds = input.additional_deadlines
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const label = cleanString((item as Record<string, unknown>).label);
        const date = cleanIsoDate((item as Record<string, unknown>).date);
        return label && date ? { label, date } : null;
      })
      .filter((r): r is { label: string; date: string } => r !== null)
      .slice(0, 8);
    if (rounds.length) out.additional_deadlines = rounds;
  }

  const language = cleanString(input.language_of_program);
  if (language) out.language_of_program = language;

  const time = cleanString(input.deadline_time);
  if (time && /^\d{1,2}:\d{2}/.test(time)) out.deadline_time = time.slice(0, 8);
  const timezone = cleanString(input.deadline_timezone);
  if (timezone) out.deadline_timezone = timezone.slice(0, 40);

  const exclusivity = cleanString(input.exclusivity_note);
  if (exclusivity) out.exclusivity_note = exclusivity;

  return out;
}

/** UI-ready facts, in display order. The front end renders these directly. */
export function describeAttributes(raw: unknown): string[] {
  const attributes = normalizeOpportunityAttributes(raw);
  const facts: string[] = [];

  if (attributes.nomination_required) {
    facts.push("Requires nomination from your institution");
  }
  if (attributes.team_based === "team") facts.push("Team application");
  if (attributes.team_based === "both") facts.push("Apply solo or as a team");
  if (attributes.renewable) {
    facts.push(
      attributes.renewal_terms
        ? `Renewable: ${attributes.renewal_terms}`
        : "Renewable"
    );
  }
  if (attributes.recommendation_letters) {
    facts.push(
      `${attributes.recommendation_letters} recommendation letter${
        attributes.recommendation_letters > 1 ? "s" : ""
      } required`
    );
  }
  if (attributes.prerequisites?.length) {
    facts.push(`Prerequisites: ${attributes.prerequisites.join("; ")}`);
  }
  for (const round of attributes.additional_deadlines || []) {
    facts.push(`${round.label}: ${round.date}`);
  }
  if (attributes.language_of_program) {
    facts.push(`Language: ${attributes.language_of_program}`);
  }
  if (attributes.exclusivity_note) facts.push(attributes.exclusivity_note);

  return facts;
}
