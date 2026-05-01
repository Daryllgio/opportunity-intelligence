import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUsageMonth, getPlanLimits } from "@/lib/billing/plans";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

function createSupabaseForRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    }
  );
}

function cleanJsonResponse(text: string) {
  return text
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
}

function validateScore(value: unknown) {
  const score = Number(value);

  if (Number.isNaN(score)) return 0;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function validateFitLabel(value: unknown) {
  const label = String(value || "").trim();

  const allowed = ["Strong fit", "Competitive", "Developing fit", "Improve first"];

  if (allowed.includes(label)) return label;

  return "Developing fit";
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY." },
        { status: 500 }
      );
    }

    const supabase = createSupabaseForRequest(request);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to score opportunities." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const requestedLimit = Number(body.limit || 10);
    const limit = Math.max(1, Math.min(10, requestedLimit));

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Complete your profile before generating competitiveness scores." },
        { status: 400 }
      );
    }

    const plan = profile.subscription_plan || "free";
    const planLimits = getPlanLimits(plan);
    const usageMonth = getCurrentUsageMonth();

    if (planLimits.competitivenessScores <= 0) {
      return NextResponse.json(
        {
          error:
            "Competitiveness scores are available on Pro and Premium plans.",
        },
        { status: 403 }
      );
    }

    const { data: existingUsage } = await supabase
      .from("user_ai_usage")
      .select("id, competitiveness_scores_used, gap_reports_used")
      .eq("user_id", user.id)
      .eq("usage_month", usageMonth)
      .maybeSingle();

    const scoresUsed = existingUsage?.competitiveness_scores_used || 0;
    const scoresRemaining = planLimits.competitivenessScores - scoresUsed;

    if (scoresRemaining <= 0) {
      return NextResponse.json(
        {
          error: `You have used all ${planLimits.competitivenessScores} competitiveness scores for this month.`,
        },
        { status: 403 }
      );
    }

    const batchLimit = Math.min(limit, scoresRemaining);

    const { data: opportunities, error: opportunitiesError } = await supabase
      .from("opportunities")
      .select(
        "id, title, provider, type, description, ai_summary, country, eligible_countries, eligible_education_levels, eligible_fields, funding_amount, funding_type, deadline, effort_level, reward_level, competitiveness_factors"
      )
      .eq("is_active", true)
      .eq("is_approved", true)
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(50);

    if (opportunitiesError) {
      return NextResponse.json(
        { error: opportunitiesError.message },
        { status: 500 }
      );
    }

    const { data: existingScores } = await supabase
      .from("opportunity_competitiveness_scores")
      .select("opportunity_id")
      .eq("user_id", user.id);

    const alreadyScoredIds = new Set(
      (existingScores || []).map((score) => score.opportunity_id)
    );

    const unscored = (opportunities || [])
      .filter((opportunity) => !alreadyScoredIds.has(opportunity.id))
      .slice(0, batchLimit);

    if (unscored.length === 0) {
      return NextResponse.json({
        scores: [],
        usage: {
          plan,
          competitivenessScoresUsed: scoresUsed,
          competitivenessScoresLimit: planLimits.competitivenessScores,
          gapReportsUsed: existingUsage?.gap_reports_used || 0,
          gapReportsLimit: planLimits.gapReports,
        },
        message: "No unscored opportunities found.",
      });
    }

    const scoringOpportunities = unscored.map((opportunity) => ({
      id: opportunity.id,
      title: opportunity.title,
      provider: opportunity.provider,
      type: opportunity.type,
      summary: opportunity.ai_summary,
      description: opportunity.description?.slice(0, 1200),
      country: opportunity.country,
      eligible_countries: opportunity.eligible_countries,
      eligible_education_levels: opportunity.eligible_education_levels,
      eligible_fields: opportunity.eligible_fields,
      funding_amount: opportunity.funding_amount,
      deadline: opportunity.deadline,
      effort_level: opportunity.effort_level,
      reward_level: opportunity.reward_level,
      competitiveness_factors: opportunity.competitiveness_factors,
    }));

    const prompt = `
You are OppScore's opportunity competitiveness scoring engine.

Score how competitive this student is for each opportunity.

Return JSON only. No markdown. No commentary.

Important:
- Return one score object for every opportunity provided.
- Do not omit any opportunity.
- Score only realistic competitiveness and fit.
- Assume the platform has already filtered out clearly ineligible opportunities.
- overall_score must be 0-100.
- Scores above 90 should be rare.
- Use 75+ only when the student has strong evidence matching the selection criteria.
- Do not flatter.
- Do not invent experiences, grades, awards, leadership, research, or projects.

fit_label must be one of:
"Strong fit", "Competitive", "Developing fit", "Improve first"

Return this exact JSON shape:
{
  "scores": [
    {
      "opportunity_id": "uuid",
      "overall_score": number,
      "fit_label": string
    }
  ]
}

Student profile:
${JSON.stringify(profile, null, 2)}

Opportunities:
${JSON.stringify(scoringOpportunities, null, 2)}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        temperature: 0,
        topP: 0.8,
        topK: 20,
      },
    });

    const responseText = response.text;

    if (!responseText) {
      return NextResponse.json(
        { error: "Gemini did not return readable text." },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(cleanJsonResponse(responseText));
    const parsedScores = Array.isArray(parsed.scores) ? parsed.scores : [];

    const scoreRows = parsedScores
      .filter((item) =>
        unscored.some((opportunity) => opportunity.id === item.opportunity_id)
      )
      .map((item) => {
        const opportunity = unscored.find(
          (candidate) => candidate.id === item.opportunity_id
        );

        return {
          user_id: user.id,
          opportunity_id: item.opportunity_id,
          score: validateScore(item.overall_score),
          fit_label: validateFitLabel(item.fit_label),
          model_used: "gemini-2.5-pro",
          profile_snapshot: profile,
          opportunity_snapshot: opportunity,
          updated_at: new Date().toISOString(),
        };
      });

    if (scoreRows.length === 0) {
      return NextResponse.json(
        { error: "Gemini did not return valid score objects." },
        { status: 500 }
      );
    }

    const { data: savedScores, error: saveError } = await supabase
      .from("opportunity_competitiveness_scores")
      .upsert(scoreRows, {
        onConflict: "user_id,opportunity_id",
      })
      .select("*");

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    const newScoresUsed = scoresUsed + scoreRows.length;

    if (existingUsage?.id) {
      const { error: usageError } = await supabase
        .from("user_ai_usage")
        .update({
          competitiveness_scores_used: newScoresUsed,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingUsage.id);

      if (usageError) {
        return NextResponse.json({ error: usageError.message }, { status: 500 });
      }
    } else {
      const { error: usageError } = await supabase.from("user_ai_usage").insert({
        user_id: user.id,
        usage_month: usageMonth,
        competitiveness_scores_used: scoreRows.length,
        gap_reports_used: 0,
      });

      if (usageError) {
        return NextResponse.json({ error: usageError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      scores: savedScores,
      usage: {
        plan,
        competitivenessScoresUsed: newScoresUsed,
        competitivenessScoresLimit: planLimits.competitivenessScores,
        gapReportsUsed: existingUsage?.gap_reports_used || 0,
        gapReportsLimit: planLimits.gapReports,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Batch scoring failed.",
      },
      { status: 500 }
    );
  }
}
