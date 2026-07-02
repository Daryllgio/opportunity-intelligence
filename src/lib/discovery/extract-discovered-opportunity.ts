import { GoogleGenAI } from "@google/genai";
import {
  OPPORTUNITY_TYPES,
  normalizeOpportunityType,
} from "@/lib/discovery/taxonomy";
import { withRetry } from "@/lib/utils/retry";
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
};

function stringOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
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

export async function extractDiscoveredOpportunity({
  pageText,
  sourceUrl,
  discoveryContext,
}: {
  pageText: string;
  sourceUrl: string;
  discoveryContext?: {
    region?: string | null;
    opportunityType?: string | null;
    educationLevel?: string | null;
    fieldArea?: string | null;
  };
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
  "competitiveness_factors": string[]
}

Page text:
${pageText.slice(0, 30000)}
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
        "Gemini discovery extraction"
      ),
    { maxRetries: 2 }
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
    application_status: normalizeApplicationStatus(parsed.application_status),
    deadline_confidence: normalizeDeadlineConfidence(parsed.deadline_confidence),
    cycle_notes: stringOrNull(parsed.cycle_notes),
    application_url: stringOrNull(parsed.application_url),
    source_url: stringOrNull(parsed.source_url) || sourceUrl,
    effort_level: stringOrNull(parsed.effort_level),
    reward_level: stringOrNull(parsed.reward_level),
    competitiveness_factors: arrayOrEmpty(parsed.competitiveness_factors),
  };
}
