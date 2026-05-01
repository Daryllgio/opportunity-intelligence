import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

type ExtractedOpportunity = {
  title: string;
  provider: string | null;
  type:
    | "scholarship"
    | "research"
    | "funded_conference"
    | "fellowship"
    | "grant"
    | "competition"
    | "leadership_program"
    | "professional_development";
  description: string;
  ai_summary: string;
  country: string;
  eligible_countries: string[];
  eligible_education_levels: string[];
  eligible_fields: string[];
  funding_amount: string | null;
  funding_type: string | null;
  deadline: string | null;
  application_url: string | null;
  effort_level: "Low" | "Medium" | "High";
  reward_level: "Low" | "Medium" | "High";
  competitiveness_factors: string[];
  hard_requirements: string[];
  soft_preferences: string[];
  extraction_confidence: "low" | "medium" | "high";
};

function cleanJsonResponse(text: string) {
  return text
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
}

function validateExtractedOpportunity(data: Partial<ExtractedOpportunity>) {
  return {
    title: data.title || "Extracted Opportunity Draft",
    provider: data.provider || null,
    type: data.type || "scholarship",
    description: data.description || "",
    ai_summary: data.ai_summary || "",
    country: data.country || "Global",
    eligible_countries: Array.isArray(data.eligible_countries)
      ? data.eligible_countries
      : ["Any"],
    eligible_education_levels: Array.isArray(data.eligible_education_levels)
      ? data.eligible_education_levels
      : ["Any"],
    eligible_fields: Array.isArray(data.eligible_fields)
      ? data.eligible_fields
      : ["Any"],
    funding_amount: data.funding_amount || null,
    funding_type: data.funding_type || null,
    deadline: data.deadline || null,
    application_url: data.application_url || null,
    effort_level: data.effort_level || "Medium",
    reward_level: data.reward_level || "Medium",
    competitiveness_factors: Array.isArray(data.competitiveness_factors)
      ? data.competitiveness_factors
      : ["General profile strength"],
    hard_requirements: Array.isArray(data.hard_requirements)
      ? data.hard_requirements
      : [],
    soft_preferences: Array.isArray(data.soft_preferences)
      ? data.soft_preferences
      : [],
    extraction_confidence: data.extraction_confidence || "medium",
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Missing GEMINI_API_KEY. Add your Gemini API key to .env.local and restart npm run dev.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const rawText = body.rawText;
    const sourceUrl = body.sourceUrl || "";

    if (!rawText || typeof rawText !== "string" || rawText.trim().length < 50) {
      return NextResponse.json(
        { error: "Opportunity text is required and must be detailed enough." },
        { status: 400 }
      );
    }

    const prompt = `
You are an opportunity intelligence extraction engine for OppScore.

Read the messy webpage text and extract ONE opportunity into clean structured JSON.

Return JSON only. No markdown. No commentary.

Rules:
- Do not include labels like "Page title", "Meta description", "Headings", or "Page text" in the description.
- Ignore navigation, legal text, cookie text, ads, unrelated links, and page chrome.
- The description should be clean, human-readable, and written for a student deciding whether to apply.
- The ai_summary should be 1-2 concise student-facing sentences for a card preview.
- Make eligibility as specific as the source allows. Include country, education level, field, citizenship/residency, year of study, and other hard requirements when clearly stated.
- Do not guess eligibility. If unclear, use "Any" or "Not specified".
- Funding amount should be exact when stated. Preserve important structures like "$10,000/year + $7,500/year living expenses" when available.
- Deadline must be YYYY-MM-DD or null.
- Type must be one of:
  scholarship, research, funded_conference, fellowship, grant, competition, leadership_program, professional_development.
- Effort level and reward level must be Low, Medium, or High.
- Competitiveness factors should describe what the selection committee actually values, not generic traits.
- Hard requirements should include strict eligibility requirements.
- Soft preferences should include qualities that improve competitiveness but are not strict eligibility rules.
- Extraction confidence must be low, medium, or high.
- Before returning JSON, internally verify that the title, summary, eligibility, funding, and competitiveness factors are accurate and not copied from irrelevant page text.

Return this exact JSON shape:
{
  "title": string,
  "provider": string | null,
  "type": string,
  "description": string,
  "ai_summary": string,
  "country": string,
  "eligible_countries": string[],
  "eligible_education_levels": string[],
  "eligible_fields": string[],
  "funding_amount": string | null,
  "funding_type": string | null,
  "deadline": string | null,
  "application_url": string | null,
  "effort_level": "Low" | "Medium" | "High",
  "reward_level": "Low" | "Medium" | "High",
  "competitiveness_factors": string[],
  "hard_requirements": string[],
  "soft_preferences": string[],
  "extraction_confidence": "low" | "medium" | "high"
}

Source URL:
${sourceUrl || "Not provided"}

Raw webpage/opportunity text:
${rawText.slice(0, 12000)}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
      config: {
        temperature: 0,
        topP: 0.8,
        topK: 20,
      },
    });

    const text = response.text;

    if (!text) {
      return NextResponse.json(
        { error: "Gemini did not return readable text." },
        { status: 500 }
      );
    }

    const cleaned = cleanJsonResponse(text);
    const parsed = JSON.parse(cleaned);

    const extracted = validateExtractedOpportunity({
      ...parsed,
      application_url: parsed.application_url || sourceUrl || null,
    });

    return NextResponse.json({ extracted });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gemini extraction failed. Try fallback extraction or Claude.",
      },
      { status: 500 }
    );
  }
}
