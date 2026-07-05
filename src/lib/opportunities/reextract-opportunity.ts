import { GoogleGenAI } from "@google/genai";
import {
  OPPORTUNITY_TYPES,
  normalizeOpportunityType,
} from "@/lib/discovery/taxonomy";
import {
  normalizeEligibilityCriteria,
  type EligibilityCriterion,
} from "@/lib/matching/eligibility";
import { withRetry } from "@/lib/utils/retry";
import { withTimeout } from "@/lib/utils/timeout";
import { safeParseJson } from "@/lib/utils/safe-json";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export type ReextractedOpportunity = {
  title?: string | null;
  provider?: string | null;
  type?: string | null;
  description?: string | null;
  ai_summary?: string | null;
  country?: string | null;
  eligible_countries?: string[] | null;
  eligible_education_levels?: string[] | null;
  eligible_fields?: string[] | null;
  funding_amount?: string | null;
  funding_type?: string | null;
  deadline?: string | null;
  application_url?: string | null;
  effort_level?: string | null;
  reward_level?: string | null;
  competitiveness_factors?: string[] | null;
  eligibility_criteria?: EligibilityCriterion[];
};

function arrayOrEmpty(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function stringOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

export async function reextractOpportunityFromPage({
  pageText,
  existingOpportunity,
}: {
  pageText: string;
  existingOpportunity: Record<string, unknown>;
}): Promise<ReextractedOpportunity> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const prompt = `
You are OppScore's opportunity re-extraction assistant.

Your job is to re-extract structured opportunity information from a current source page.

Return JSON only. No markdown. No commentary.

Important:
- Preserve the meaning of the source page.
- Do not invent missing requirements.
- If a field is not clearly available, return null or [].
- Use the existing opportunity as context, but trust the current page text if it clearly changed.
- Deadline should be ISO date format YYYY-MM-DD when possible.
- type must be one of:
  ${OPPORTUNITY_TYPES.map((type) => `"${type}"`).join(", ")}
- eligibility_criteria: capture EVERY criterion the page states about who can
  apply. Each entry: {"kind": one of "citizenship", "residency", "location",
  "specific_school", "education_level", "field_of_study", "gpa_minimum",
  "age", "demographic", "financial_need", "enrollment_status", "grade_level"
  or a short snake_case word of your own; "requirement": short factual
  sentence; "values": normalized values ("United States" not "US citizens",
  "3.5" not "3.5 GPA"); "strict": true when must/required/only}.

Return this JSON shape:
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
  "application_url": string | null,
  "effort_level": string | null,
  "reward_level": string | null,
  "competitiveness_factors": string[],
  "eligibility_criteria": [
    { "kind": string, "requirement": string, "values": string[], "strict": boolean }
  ]
}

Existing opportunity:
${JSON.stringify(existingOpportunity, null, 2)}

Current page text:
${pageText.slice(0, 25000)}
`;

  const response = await withRetry(
    () =>
      withTimeout(
        () =>
          ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              maxOutputTokens: 4096,
            },
          }),
        60000,
        "Gemini re-extraction"
      ),
    { maxRetries: 2 }
  );

  const rawText = response.text;

  if (!rawText) {
    throw new Error("Gemini did not return readable extraction text.");
  }

  const parsedResult = safeParseJson<Record<string, unknown>>(
    rawText,
    "Gemini re-extraction"
  );

  if (!parsedResult.success) {
    throw new Error(parsedResult.error);
  }

  const parsed = parsedResult.data;

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
    deadline: stringOrNull(parsed.deadline),
    application_url: stringOrNull(parsed.application_url),
    effort_level: stringOrNull(parsed.effort_level),
    reward_level: stringOrNull(parsed.reward_level),
    competitiveness_factors: arrayOrEmpty(parsed.competitiveness_factors),
    eligibility_criteria: normalizeEligibilityCriteria(parsed.eligibility_criteria),
  };
}
