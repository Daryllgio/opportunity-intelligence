import { GoogleGenAI } from "@google/genai";
import {
  OPPORTUNITY_TYPES,
  normalizeOpportunityType,
} from "@/lib/discovery/taxonomy";
import {
  normalizeEligibilityCriteria,
  type EligibilityCriterion,
} from "@/lib/matching/eligibility";
import { isRetryableError, withRetry } from "@/lib/utils/retry";
import { withTimeout } from "@/lib/utils/timeout";
import { safeParseJson } from "@/lib/utils/safe-json";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export type DiscoveredOpportunityExtraction = {
  title: string | null;
  provider: string | null;
  type: string | null;
  description: string | null;
  ai_summary: string | null;
  country: string | null;
  eligible_countries: string[];
  eligible_education_levels: string[];
  eligible_fields: string[];
  funding_amount: string | null;
  funding_type: string | null;
  deadline: string | null;
  application_status: "open" | "closed" | "rolling" | "unknown";
  deadline_confidence: "high" | "medium" | "low" | "unknown";
  cycle_notes: string | null;
  application_url: string | null;
  source_url: string | null;
  effort_level: string | null;
  reward_level: string | null;
  competitiveness_factors: string[];
  eligibility_criteria: EligibilityCriterion[];
};

function stringOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

/** Deadlines must be real ISO dates — the model sometimes echoes the format
 * placeholder ("YYYY-07-01"), which a date column rejects. */
function isoDateOrNull(value: unknown) {
  const text = stringOrNull(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return Number.isNaN(new Date(text).getTime()) ? null : text;
}

function arrayOrEmpty(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function normalizeApplicationStatus(value: unknown) {
  const raw = String(value || "").toLowerCase().trim();

  if (["open", "closed", "rolling", "unknown"].includes(raw)) {
    return raw as "open" | "closed" | "rolling" | "unknown";
  }

  if (raw.includes("closed")) return "closed";
  if (raw.includes("rolling") || raw.includes("ongoing")) return "rolling";
  if (raw.includes("open")) return "open";

  return "unknown";
}

function normalizeDeadlineConfidence(value: unknown) {
  const raw = String(value || "").toLowerCase().trim();

  if (["high", "medium", "low", "unknown"].includes(raw)) {
    return raw as "high" | "medium" | "low" | "unknown";
  }

  return "unknown";
}

// Re-exported for existing importers; the implementation lives in taxonomy.
export { normalizeOpportunityType };

/**
 * First-pass extraction model. Benchmarked head-to-head against
 * gemini-2.5-pro on 50 real captured pages (see the Round 2 report):
 * Flash is the default; the destination VERIFIER stays on Pro regardless —
 * extraction mistakes are recoverable downstream, wrong Apply links are not.
 */
export const EXTRACTION_MODEL = "gemini-2.5-flash";

export async function extractDiscoveredOpportunity({
  pageText,
  sourceUrl,
  discoveryContext,
  model = EXTRACTION_MODEL,
}: {
  pageText: string;
  sourceUrl: string;
  discoveryContext?: {
    region?: string | null;
    opportunityType?: string | null;
    educationLevel?: string | null;
    fieldArea?: string | null;
  };
  model?: string;
}): Promise<DiscoveredOpportunityExtraction> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const prompt = `
You are OppScores' opportunity extraction engine.

Extract one student opportunity from the page text below.

The platform focuses on opportunities based in the United States and Canada for students and early-career applicants.

Supported opportunity types:
${OPPORTUNITY_TYPES.join(", ")}

Return JSON only. No markdown. No commentary.

Important rules:
- Do not invent missing facts.
- Use null or [] when information is unclear.
- Deadline should be YYYY-MM-DD when possible.
- If the opportunity is rolling/ongoing with no fixed deadline, set deadline to null and application_status to "rolling".
- If applications are clearly closed and no future deadline is visible, set deadline to null, application_status to "closed", deadline_confidence to "low", and explain in cycle_notes.
- If applications are open and a deadline is visible, set application_status to "open" and deadline_confidence to "high".
- If status is unclear, set application_status to "unknown".
- Use source_url as the current page URL unless the page clearly gives a better application URL.
- Keep type to one of the supported opportunity types.
- Do not classify general internships as opportunities unless they are structured pipeline/career development programs.
- Do not classify ordinary conferences as opportunities unless there is a clear student funding, presentation, leadership, selective, or career-development opportunity.
- DEGREE PROGRAMS ARE NOT OPPORTUNITIES. If the page is about admission to or
  enrollment in a degree (bachelor's, master's, MD, JD, MBA, PhD, honors
  college), course registration, or applying to a university itself, set
  title and type to null. We only list things students apply to ON TOP of
  their education (a scholarship FOR admitted students is fine; the admission
  itself is not).
- DIRECTORY PAGES: if the page is a listing of MANY distinct opportunities
  from different providers (a scholarship directory, a financial-aid office
  list, a fellowships index), do NOT pick one arbitrarily. Extract only when
  a single opportunity clearly dominates the page or clearly matches the
  discovery context; otherwise set title and type to null so the page can be
  handled as a hub instead of becoming a coin-flip record.
- career_development_program means a selective, cohort-based professional
  development program with its own application and defined start/end (e.g.
  MLT Career Prep, Forte MBALaunch). It is NOT a job posting, a paid course
  or bootcamp, a degree, an advising service, or generic career resources.
- For competitions, fill eligible_fields with the fields the competition is
  actually about (hackathon -> Computer Science; case competition ->
  Business Administration; essay contest on policy -> Political Science).
  Only leave eligible_fields empty when the competition is truly open to all
  fields.
- ELIGIBILITY CRITERIA: capture EVERY criterion the page states about who can
  apply, as structured entries in eligibility_criteria. Do not limit yourself
  to the known kinds — anything that determines who may apply belongs here.
  Each entry:
    - "kind": one of "citizenship", "residency", "location",
      "specific_school", "education_level", "field_of_study", "gpa_minimum",
      "age", "demographic", "financial_need", "enrollment_status",
      "grade_level" — or a short snake_case word of your own for anything
      else (e.g. "military_affiliation", "employer", "membership").
    - "requirement": the requirement as a short factual sentence, faithful to
      the page ("Open to US citizens and permanent residents", "Must be
      enrolled at the University of Toronto", "Minimum 3.5 GPA").
    - "values": normalized comparable values ("United States" not "US
      citizens"; "3.5" not "3.5 GPA"; "California" not "CA residents";
      full school names).
    - "strict": true when the page says must/required/only; false when it is
      a preference or "priority given to".
  Capture demographic eligibility factually as stated (e.g. "Open to women in
  engineering", "For first-generation college students"). Do not editorialize.
  If the page states no eligibility constraints, return [].

Discovery context:
${JSON.stringify(discoveryContext || {}, null, 2)}

Source URL:
${sourceUrl}

Return this exact JSON shape:
{
  "title": string | null,
  "provider": string | null,
  "type": string | null,
  "description": string | null,
  "ai_summary": string | null,
  "country": string | null,
  "eligible_countries": string[],
  "eligible_education_levels": string[],
  "eligible_fields": string[],
  "funding_amount": string | null,
  "funding_type": string | null,
  "deadline": string | null,
  "application_status": "open" | "closed" | "rolling" | "unknown",
  "deadline_confidence": "high" | "medium" | "low" | "unknown",
  "cycle_notes": string | null,
  "application_url": string | null,
  "source_url": string | null,
  "effort_level": string | null,
  "reward_level": string | null,
  "competitiveness_factors": string[],
  "eligibility_criteria": [
    { "kind": string, "requirement": string, "values": string[], "strict": boolean }
  ]
}

Page text:
${pageText.slice(0, 30000)}
`;

  // Generate + parse together inside the retry loop: Gemini occasionally
  // returns malformed/truncated JSON, and resampling usually fixes it.
  const parsed = await withRetry(
    async () => {
      const response = await withTimeout(
        () =>
          ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              // Pro is a thinking model: reasoning shares this budget, so it
              // must be far larger than the JSON we expect back.
              maxOutputTokens: 8192,
            },
          }),
        90000,
        "Gemini discovery extraction"
      );

      const rawText = response.text;

      if (!rawText) {
        throw new Error("Gemini did not return extraction text.");
      }

      const parsedResult = safeParseJson<Record<string, unknown>>(
        rawText,
        "Gemini discovery extraction"
      );

      if (!parsedResult.success) {
        throw new Error(parsedResult.error);
      }

      return parsedResult.data;
    },
    {
      maxRetries: 2,
      retryableErrors: (error) =>
        isRetryableError(error) ||
        (error instanceof Error &&
          (error.message.includes("Failed to parse Gemini discovery extraction") ||
            error.message.includes("Gemini did not return extraction text"))),
    }
  );

  return {
    title: stringOrNull(parsed.title),
    provider: stringOrNull(parsed.provider),
    type: normalizeOpportunityType(parsed.type),
    description: stringOrNull(parsed.description),
    ai_summary: stringOrNull(parsed.ai_summary),
    country: stringOrNull(parsed.country),
    eligible_countries: arrayOrEmpty(parsed.eligible_countries),
    eligible_education_levels: arrayOrEmpty(parsed.eligible_education_levels),
    eligible_fields: arrayOrEmpty(parsed.eligible_fields),
    funding_amount: stringOrNull(parsed.funding_amount),
    funding_type: stringOrNull(parsed.funding_type),
    deadline: isoDateOrNull(parsed.deadline),
    application_status: normalizeApplicationStatus(parsed.application_status),
    deadline_confidence: normalizeDeadlineConfidence(parsed.deadline_confidence),
    cycle_notes: stringOrNull(parsed.cycle_notes),
    application_url: stringOrNull(parsed.application_url),
    source_url: stringOrNull(parsed.source_url) || sourceUrl,
    effort_level: stringOrNull(parsed.effort_level),
    reward_level: stringOrNull(parsed.reward_level),
    competitiveness_factors: arrayOrEmpty(parsed.competitiveness_factors),
    eligibility_criteria: normalizeEligibilityCriteria(parsed.eligibility_criteria),
  };
}
