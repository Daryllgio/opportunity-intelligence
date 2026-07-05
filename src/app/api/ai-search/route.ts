import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  AI_SEARCH_TOKENS_PER_CREDIT,
  getCurrentUsageMonth,
  getPlanLimits,
} from "@/lib/billing/plans";
import { tableHasColumn } from "@/lib/utils/schema-features";
import { safeParseJson } from "@/lib/utils/safe-json";
import { withTimeout } from "@/lib/utils/timeout";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MAX_CATALOG_ROWS = 400;
const MAX_RESULTS = 12;
const MAX_QUERY_LENGTH = 500;

function createSupabaseForRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function compactRow(row: Record<string, unknown>) {
  const text = String(row.ai_summary || row.description || "")
    .replace(/\s+/g, " ")
    .slice(0, 260);
  return {
    id: row.id,
    title: row.title,
    provider: row.provider,
    type: row.type,
    summary: text,
    country: row.country,
    eligible_education_levels: row.eligible_education_levels,
    eligible_fields: row.eligible_fields,
    eligibility_criteria: row.eligibility_criteria || undefined,
    funding_amount: row.funding_amount,
    deadline: row.deadline,
    application_status: row.application_status,
  };
}

/**
 * Premium natural-language search over the verified catalog. One Flash call
 * reads the user's plain-language request plus a compact dump of every live
 * opportunity and returns the best matches with a one-line reason each —
 * every result is already link-verified, which is the whole point. Metered
 * by actual model tokens against the plan's monthly budget.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "Search is not configured." }, { status: 500 });
    }

    const supabase = createSupabaseForRequest(request);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_plan")
      .eq("id", user.id)
      .maybeSingle();

    const planLimits = getPlanLimits(profile?.subscription_plan);
    if (!planLimits.hasAiSearch) {
      return NextResponse.json(
        { error: "AI search is a Premium feature.", upgrade: true },
        { status: 403 }
      );
    }

    const body = await request.json();
    const query = String(body.query || "").trim().slice(0, MAX_QUERY_LENGTH);
    if (query.length < 3) {
      return NextResponse.json(
        { error: "Describe what you're looking for in a sentence or two." },
        { status: 400 }
      );
    }

    const service = createServiceSupabase();

    // Fail closed on cost: no metering column, no searches.
    const canMeter = await tableHasColumn(service, "user_ai_usage", "ai_search_tokens_used");
    if (!canMeter) {
      return NextResponse.json(
        { error: "AI search is almost ready. Check back soon." },
        { status: 503 }
      );
    }

    const usageMonth = getCurrentUsageMonth();
    const { data: usageRow } = await service
      .from("user_ai_usage")
      .select("id, ai_search_tokens_used")
      .eq("user_id", user.id)
      .eq("usage_month", usageMonth)
      .maybeSingle();

    const tokensUsed = Number(usageRow?.ai_search_tokens_used || 0);
    if (tokensUsed >= planLimits.aiSearchMonthlyTokens) {
      return NextResponse.json(
        {
          error: "You've used this month's AI search budget. It resets on the 1st.",
        },
        { status: 403 }
      );
    }

    const { data: rows, error: rowsError } = await service
      .from("opportunities")
      .select("*")
      .eq("is_active", true)
      .eq("is_approved", true)
      .eq("lifecycle_status", "active")
      .limit(MAX_CATALOG_ROWS);

    if (rowsError) {
      return NextResponse.json({ error: "Search is unavailable right now." }, { status: 500 });
    }

    const catalog = (rows || []).map(compactRow);
    const today = new Date().toISOString().slice(0, 10);

    const prompt = `
You are OppScore's opportunity search engine. A student describes what they
want in plain language; you pick the best matches from OUR catalog below.
Every entry is already verified, so never invent or reference anything
outside the catalog.

Today's date: ${today}

Student's request:
"""${query}"""

Rules:
- Return JSON only. No markdown, no commentary.
- Choose up to ${MAX_RESULTS} catalog ids, best match first. Fewer is fine;
  an empty list is correct when nothing genuinely fits.
- Honor every constraint the student states (field/topic, location,
  citizenship, funding amount, timeframe, type). Deadlines before today fail
  a "still open" expectation.
- Each match needs a one-line reason grounded in the student's own words.
- "interpretation": one sentence restating what you searched for, so the
  student can correct you.

Return this exact shape:
{
  "interpretation": string,
  "matches": [ { "id": string, "reason": string } ]
}

Catalog:
${JSON.stringify(catalog)}
`;

    const response = await withTimeout(
      () =>
        ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          // Flash thinks before answering and its reasoning shares this
          // budget — 4096 gets eaten by thought and truncates the JSON.
          config: { maxOutputTokens: 12288 },
        }),
      45000,
      "AI search"
    );

    const usage = response.usageMetadata;
    const totalTokens =
      (usage?.promptTokenCount || 0) +
      (usage?.candidatesTokenCount || 0) +
      (usage?.thoughtsTokenCount || 0);

    // Meter before parsing: the tokens are spent either way.
    if (usageRow?.id) {
      await service
        .from("user_ai_usage")
        .update({
          ai_search_tokens_used: tokensUsed + totalTokens,
          updated_at: new Date().toISOString(),
        })
        .eq("id", usageRow.id);
    } else {
      await service.from("user_ai_usage").insert({
        user_id: user.id,
        usage_month: usageMonth,
        ai_search_tokens_used: totalTokens,
      });
    }

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json(
        { error: "Search came back empty. Try rephrasing." },
        { status: 502 }
      );
    }

    const parsed = safeParseJson<{
      interpretation?: string;
      matches?: Array<{ id?: string; reason?: string }>;
    }>(rawText, "AI search");

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Search came back garbled. Try rephrasing." },
        { status: 502 }
      );
    }

    const rowById = new Map((rows || []).map((row) => [String(row.id), row]));
    const results = (parsed.data.matches || [])
      .filter((match) => match.id && rowById.has(String(match.id)))
      .slice(0, MAX_RESULTS)
      .map((match) => {
        const row = rowById.get(String(match.id))!;
        return {
          id: row.id,
          title: row.title,
          provider: row.provider,
          type: row.type,
          deadline: row.deadline,
          application_status: row.application_status,
          funding_amount: row.funding_amount,
          country: row.country,
          created_at: row.created_at,
          effort_level: row.effort_level,
          reward_level: row.reward_level,
          reason: String(match.reason || "").slice(0, 220),
        };
      });

    const budgetCredits = Math.floor(
      planLimits.aiSearchMonthlyTokens / AI_SEARCH_TOKENS_PER_CREDIT
    );
    const usedCredits = Math.min(
      budgetCredits,
      Math.ceil((tokensUsed + totalTokens) / AI_SEARCH_TOKENS_PER_CREDIT)
    );

    return NextResponse.json({
      interpretation: parsed.data.interpretation || null,
      results,
      usage: { usedCredits, budgetCredits },
    });
  } catch (error) {
    console.error("ai-search error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
