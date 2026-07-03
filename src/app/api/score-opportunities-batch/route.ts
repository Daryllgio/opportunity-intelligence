import { GoogleGenAI } from "@google/genai";
import { withRetry } from "@/lib/utils/retry";
import { withTimeout } from "@/lib/utils/timeout";
import { safeParseJson } from "@/lib/utils/safe-json";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUsageMonth, getPlanLimits } from "@/lib/billing/plans";
import {
  buildOpportunityContentHash,
  buildOpportunityCriteriaHash,
  buildProfileScoringHash,
} from "@/lib/scoring/hashes";
import {
  allocateScoringSlots,
  buildExperienceTokens,
  criteriaPriorityScore,
  getRankedCategories,
  shouldScoreOpportunity,
  type ExperienceSummaryLike,
} from "@/lib/scoring/priority";
import { normalizeOpportunityType } from "@/lib/discovery/taxonomy";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SCORING_MODEL = "gemini-2.5-pro";
const GEMINI_CHUNK_SIZE = 20;

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

function createServiceSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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

type ParsedCompetitivenessScore = {
  opportunity_id: string;
  overall_score: number;
  fit_label: string;
};

type ExperienceSummaryRow = ExperienceSummaryLike & {
  experience_key: string;
  raw_content_hash: string | null;
};

function groupExperienceSummaries(rows: ExperienceSummaryRow[]) {
  const grouped: Record<string, unknown[]> = {
    leadership: [],
    research: [],
    volunteering: [],
    work_projects: [],
    awards: [],
  };

  for (const row of rows) {
    if (!grouped[row.section_key]) {
      grouped[row.section_key] = [];
    }

    grouped[row.section_key].push({
      title: row.experience_title,
      organization: row.organization,
      summary: row.summary,
      evidence_tags: row.evidence_tags || [],
      notable_metrics: row.notable_metrics || [],
    });
  }

  return grouped;
}

function compactProfileForScoring(profile: Record<string, unknown>) {
  return {
    education_level: profile.education_level,
    student_status: profile.student_status,
    opportunity_level: profile.opportunity_level,
    field_of_study: profile.field_of_study,
    field_of_study_other: profile.field_of_study_other,
    country_of_study: profile.country_of_study,
    nationality: profile.nationality,
    gpa: profile.gpa,
    target_opportunity_types: profile.target_opportunity_types,
    preferred_regions: profile.preferred_regions,
    financial_need: profile.financial_need,
  };
}

function compactOpportunityForScoring(opportunity: Record<string, unknown>) {
  return {
    id: opportunity.id,
    title: opportunity.title,
    provider: opportunity.provider,
    type: opportunity.type,
    country: opportunity.country,
    eligible_countries: opportunity.eligible_countries,
    eligible_education_levels: opportunity.eligible_education_levels,
    eligible_fields: opportunity.eligible_fields,
    funding_amount: opportunity.funding_amount,
    funding_type: opportunity.funding_type,
    deadline: opportunity.deadline,
    effort_level: opportunity.effort_level,
    reward_level: opportunity.reward_level,
    competitiveness_factors: opportunity.competitiveness_factors,
    summary: opportunity.ai_summary,
    description: String(opportunity.description || "").slice(0, 700),
  };
}

async function fetchAllActiveOpportunities(supabase: SupabaseClient) {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("opportunities")
      .select(
        "id, title, provider, type, description, ai_summary, country, eligible_countries, eligible_education_levels, eligible_fields, funding_amount, funding_type, deadline, effort_level, reward_level, competitiveness_factors, application_status"
      )
      .eq("is_active", true)
      .eq("is_approved", true)
      .eq("lifecycle_status", "active")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

async function scoreChunkWithGemini({
  compactProfile,
  chunk,
}: {
  compactProfile: Record<string, unknown>;
  chunk: Record<string, unknown>[];
}): Promise<ParsedCompetitivenessScore[]> {
  const scoringOpportunities = chunk.map((opportunity) =>
    compactOpportunityForScoring(opportunity)
  );

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
This contains basic structured profile fields and saved summaries of individual experiences grouped by category.
Use the experience summaries as the main evidence for leadership, research, volunteering, work/projects, and awards.

${JSON.stringify(compactProfile, null, 2)}

Opportunities:
${JSON.stringify(scoringOpportunities, null, 2)}
`;

  const parsed = await withRetry(
    async () => {
      const response = await withTimeout(
        () =>
          ai.models.generateContent({
            model: SCORING_MODEL,
            contents: prompt,
            config: {
              temperature: 0,
              topP: 0.8,
              topK: 20,
              maxOutputTokens: 4096,
            },
          }),
        120000,
        "Gemini batch scoring"
      );

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Gemini did not return readable text.");
      }

      const parsedResult = safeParseJson<Record<string, unknown>>(
        responseText,
        "Gemini batch scoring"
      );
      if (!parsedResult.success) {
        throw new Error(parsedResult.error);
      }
      return parsedResult.data;
    },
    {
      maxRetries: 2,
      retryableErrors: (error) =>
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("503") ||
          error.message.includes("500") ||
          error.message.includes("timed out") ||
          error.message.includes("Failed to parse") ||
          error.message.includes("did not return readable text")),
    }
  );

  return Array.isArray(parsed.scores)
    ? (parsed.scores as ParsedCompetitivenessScore[])
    : [];
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const isCronRequest =
      body.cronUserId &&
      body.cronSecret &&
      process.env.CRON_SECRET &&
      body.cronSecret === process.env.CRON_SECRET;

    const supabase = isCronRequest
      ? createServiceSupabase()
      : createSupabaseForRequest(request);

    let userId = "";

    if (isCronRequest) {
      userId = String(body.cronUserId);
    } else {
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

      userId = user.id;
    }

    const scoreAllEligible = Boolean(body.scoreAllEligible);
    const requestedLimit = Number(body.limit || 10);

    // Limited mode is for admin/dev testing; scoreAllEligible is the
    // production path and may use the user's full remaining plan capacity.
    const limit = scoreAllEligible
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.min(10, requestedLimit));

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
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
        { error: "Competitiveness scores are available on paid plans." },
        { status: 403 }
      );
    }

    const { data: existingUsage } = await supabase
      .from("user_ai_usage")
      .select("id, competitiveness_scores_used, gap_reports_used")
      .eq("user_id", userId)
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

    const batchLimit = scoreAllEligible
      ? scoresRemaining
      : Math.min(limit, scoresRemaining);

    // Every active opportunity competes for a slot — not just the first page.
    const opportunities = await fetchAllActiveOpportunities(
      supabase as SupabaseClient
    );

    const { data: existingScores } = await supabase
      .from("opportunity_competitiveness_scores")
      .select(
        "opportunity_id, profile_scoring_hash, opportunity_content_hash, opportunity_criteria_hash, score_status, last_scored_at, opportunity_snapshot"
      )
      .eq("user_id", userId);

    const { data: experienceSummaryData } = await supabase
      .from("profile_experience_summaries")
      .select(
        "section_key, experience_key, experience_title, organization, raw_content_hash, summary, evidence_tags, notable_metrics"
      )
      .eq("user_id", userId);

    const experienceSummaries =
      (experienceSummaryData || []) as ExperienceSummaryRow[];

    const currentProfileScoringHash = buildProfileScoringHash({
      profile: profile as Record<string, unknown>,
      experienceSummaries,
    });

    const existingScoreMap = new Map(
      (existingScores || []).map((score) => [score.opportunity_id, score])
    );

    // Per-category monthly caps: count scores already produced this month.
    const monthStart = `${usageMonth}-01`;
    const categoryUsedThisMonth: Record<string, number> = {};
    for (const score of existingScores || []) {
      if (!score.last_scored_at || score.last_scored_at < monthStart) continue;
      const snapshotType = normalizeOpportunityType(
        (score.opportunity_snapshot as Record<string, unknown> | null)?.type
      );
      if (!snapshotType) continue;
      categoryUsedThisMonth[snapshotType] =
        (categoryUsedThisMonth[snapshotType] || 0) + 1;
    }

    const rankedCategories = getRankedCategories(
      profile as Record<string, unknown>,
      planLimits
    );

    const perCategoryRemaining: Record<string, number> = {};
    for (const category of rankedCategories) {
      perCategoryRemaining[category] = Math.max(
        0,
        planLimits.competitivenessScoresPerCategory -
          (categoryUsedThisMonth[category] || 0)
      );
    }

    const experienceTokens = buildExperienceTokens(experienceSummaries);

    const candidates = opportunities
      .filter((opportunity) => {
        const existing = existingScoreMap.get(String(opportunity.id));
        if (!existing) return true;
        const currentOpportunityHash = buildOpportunityContentHash(opportunity);
        return (
          existing.score_status !== "current" ||
          existing.profile_scoring_hash !== currentProfileScoringHash ||
          existing.opportunity_content_hash !== currentOpportunityHash
        );
      })
      .filter((opportunity) =>
        shouldScoreOpportunity(
          profile as Record<string, unknown>,
          opportunity,
          rankedCategories
        )
      )
      .map((opportunity) => ({
        opportunity,
        priority: criteriaPriorityScore({
          profile: profile as Record<string, unknown>,
          opportunity,
          rankedCategories,
          experienceTokens,
        }),
      }));

    const unscored = allocateScoringSlots({
      candidates,
      totalRemaining: batchLimit,
      perCategoryRemaining,
    });

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
        message:
          "No unscored opportunities matched this profile and preference filter.",
      });
    }

    const compactProfile = {
      basic_profile: compactProfileForScoring(profile as Record<string, unknown>),
      experience_summaries: groupExperienceSummaries(experienceSummaries),
    };

    // Score in chunks so output size stays reliable regardless of batch size.
    const parsedScores: ParsedCompetitivenessScore[] = [];
    for (let i = 0; i < unscored.length; i += GEMINI_CHUNK_SIZE) {
      const chunk = unscored.slice(i, i + GEMINI_CHUNK_SIZE);
      try {
        const chunkScores = await scoreChunkWithGemini({ compactProfile, chunk });
        parsedScores.push(...chunkScores);
      } catch (error) {
        console.error(
          "Scoring chunk failed:",
          error instanceof Error ? error.message : error
        );
        // Continue with remaining chunks — partial progress is preserved.
      }
    }

    const unscoredIds = new Set(unscored.map((o) => String(o.id)));

    const scoringCounts = parsedScores.reduce(
      (counts, item) => {
        if (!unscoredIds.has(String(item.opportunity_id))) return counts;
        if (existingScoreMap.has(item.opportunity_id)) counts.refreshed += 1;
        else counts.created += 1;
        return counts;
      },
      { created: 0, refreshed: 0 }
    );

    const scoreRows = parsedScores
      .filter((item) => unscoredIds.has(String(item.opportunity_id)))
      .map((item) => {
        const opportunity = unscored.find(
          (candidate) => String(candidate.id) === item.opportunity_id
        )!;

        return {
          user_id: userId,
          opportunity_id: item.opportunity_id,
          score: validateScore(item.overall_score),
          fit_label: validateFitLabel(item.fit_label),
          model_used: SCORING_MODEL,
          profile_snapshot: compactProfile,
          opportunity_snapshot: opportunity,
          profile_scoring_hash: currentProfileScoringHash,
          opportunity_content_hash: buildOpportunityContentHash(opportunity),
          opportunity_criteria_hash: buildOpportunityCriteriaHash(opportunity),
          score_status: "current",
          stale_reason: null,
          last_scored_at: new Date().toISOString(),
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
        user_id: userId,
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
      counts: {
        total: savedScores?.length || 0,
        created: scoringCounts.created,
        refreshed: scoringCounts.refreshed,
      },
      usage: {
        plan,
        competitivenessScoresUsed: newScoresUsed,
        competitivenessScoresLimit: planLimits.competitivenessScores,
        gapReportsUsed: existingUsage?.gap_reports_used || 0,
        gapReportsLimit: planLimits.gapReports,
      },
    });
  } catch (error) {
    console.error(
      "score-opportunities-batch error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Batch scoring failed." },
      { status: 500 }
    );
  }
}
