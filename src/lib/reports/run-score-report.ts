/**
 * Competitiveness ("gap") report core — in-process, callable from the API
 * route and test harnesses alike. Claude Sonnet writes the report when
 * ANTHROPIC_API_KEY is present; Gemini Pro is the automatic fallback, so the
 * feature works in every environment. Cached reports never re-charge quota
 * or credits; overflow credits carry a user past the monthly plan limit.
 */
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { withRetry } from "@/lib/utils/retry";
import { withTimeout } from "@/lib/utils/timeout";
import { safeParseJson } from "@/lib/utils/safe-json";
import { getCurrentUsageMonth } from "@/lib/billing/plans";
import {
  getPlanLimitsForProfile,
  getSubscriptionState,
} from "@/lib/billing/subscription";
import { consumeCredit } from "@/lib/billing/credits";
import { createClient } from "@supabase/supabase-js";

type SupabaseClientLike = { from: (table: string) => any };

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Reports run on Claude Sonnet. THE single config switch for the report
// model: set REPORT_CLAUDE_MODEL to change it platform-wide (the Sonnet 5
// vs 4.6 head-to-head on real founder reports chose the default below).
// Gemini Pro remains the automatic fallback wherever the Anthropic key is
// absent.
export const CLAUDE_GAP_REPORT_MODEL =
  process.env.REPORT_CLAUDE_MODEL || "claude-sonnet-5";
const GEMINI_FALLBACK_MODEL = "gemini-2.5-pro";

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export type ScoreReportResult =
  | {
      ok: false;
      status: number;
      error: string;
      overflowAvailable?: boolean;
      purchasePath?: string;
    }
  | {
      ok: true;
      report: Record<string, unknown>;
      cached: boolean;
      usedOverflowCredit: boolean;
      usage: Record<string, unknown>;
    };

function validateScore(value: unknown) {
  const score = Number(value);
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function arrayOrEmpty(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

async function generateWithClaude(prompt: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: CLAUDE_GAP_REPORT_MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );

  return textBlock?.text || "";
}

async function generateWithGemini(prompt: string): Promise<string> {
  const response = await gemini.models.generateContent({
    model: GEMINI_FALLBACK_MODEL,
    contents: prompt,
    config: {
      temperature: 0,
      topP: 0.8,
      topK: 20,
      // Gemini Pro THINKS inside this same budget — 2048 was consumed
      // entirely by reasoning, returning empty text every time.
      maxOutputTokens: 8192,
    },
  });

  return response.text || "";
}

export async function generateGapReport(prompt: string) {
  const useClaude = Boolean(process.env.ANTHROPIC_API_KEY);
  const modelUsed = useClaude ? CLAUDE_GAP_REPORT_MODEL : GEMINI_FALLBACK_MODEL;

  const text = await withRetry(
    () =>
      withTimeout(
        () => (useClaude ? generateWithClaude(prompt) : generateWithGemini(prompt)),
        60000,
        "Competitiveness report generation"
      ),
    {
      maxRetries: 2,
      retryableErrors: (error) =>
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("500") ||
          error.message.includes("503") ||
          error.message.includes("529") ||
          error.message.includes("overloaded") ||
          error.message.includes("timed out")),
    }
  );

  return { text, modelUsed };
}


export function buildGapReportPrompt(
  profileContext: Record<string, unknown>,
  opportunity: Record<string, unknown>
): string {
  return `
You are OppScore's admissions, scholarship, and fellowship competitiveness evaluator.

Compare ONE student profile to ONE opportunity and produce a student-facing competitiveness and gap report.

Return JSON only. No markdown. No commentary.

Scoring rules:
- overall_score must be 0-100.
- Score realistic competitiveness and fit, not just basic eligibility.
- If the student is clearly ineligible, score should usually be below 35.
- If eligible but weak fit, score 35-55.
- If eligible and reasonable fit, score 56-75.
- If strong alignment with selection criteria, score 76-90.
- Scores above 90 should be rare and require exceptional alignment.
- Be honest and specific. Do not flatter.
- If profile information is missing, mention it as a gap.
- Do not invent experiences the student did not provide.

fit_label must be one of:
"Strong fit", "Competitive", "Developing fit", "Improve first", "Likely ineligible"

eligibility_status must be one of:
"Eligible", "Likely eligible", "Unclear", "Likely ineligible", "Ineligible"

Return this exact JSON shape:
{
  "overall_score": number,
  "fit_label": string,
  "eligibility_status": string,
  "strengths": string[],
  "gaps": string[],
  "recommended_actions": string[],
  "ai_explanation": string
}

For recommended_actions, write them as "How to position your profile" guidance, not generic tasks.
Focus on how the student should present existing experiences, coursework, projects, background, goals, or achievements in the application.

Do NOT give unrealistic advice like "get research experience," "win awards," "start a nonprofit," or "become a leader" unless the opportunity deadline is far away.
Do NOT focus mainly on completing the OppScore profile unless profile incompleteness is the dominant reason for the low score.
Do NOT write generic advice that could apply to any opportunity.

Good positioning guidance examples:
- Lead with the strongest existing experience that matches this opportunity's selection criteria.
- Quantify impact where possible using numbers, scope, people served, outcomes, or responsibilities.
- Connect the student's existing work to the opportunity's mission.
- Explain weaker areas directly instead of ignoring them.
- Avoid leading with unrelated achievements.
- Use coursework, class projects, independent projects, or lived experience only when they genuinely support the opportunity fit.

Student profile context:
This includes basic profile fields, saved individual experience summaries, fuller raw experience details, and the existing competitiveness score if available. Use the experience summaries and raw experiences to keep the gap report consistent with the competitiveness ranking.

${JSON.stringify(profileContext, null, 2)}

Opportunity:
${JSON.stringify(opportunity, null, 2)}
`;
}

export async function runScoreReport({
  supabase,
  userId,
  opportunityId,
}: {
  /** A client authorized for this user's rows (user-scoped or service). */
  supabase: SupabaseClientLike;
  userId: string;
  opportunityId: string;
}): Promise<ScoreReportResult> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY) {
    return { ok: false, status: 500, error: "Report generation is not configured." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      ok: false,
      status: 400,
      error: "Complete your profile before generating a score report.",
    };
  }

  const planLimits = getPlanLimitsForProfile(profile as Record<string, unknown>);
  const plan = getSubscriptionState(profile as Record<string, unknown>).effectivePlan || "none";
  const usageMonth = getCurrentUsageMonth();

  if (planLimits.competitivenessReports <= 0) {
    return {
      ok: false,
      status: 403,
      error:
        "Competitiveness reports come with Pro and Premium. Upgrade to generate this one.",
    };
  }

  const { data: existingUsage } = await supabase
    .from("user_ai_usage")
    .select("id, gap_reports_used, competitiveness_scores_used")
    .eq("user_id", userId)
    .eq("usage_month", usageMonth)
    .maybeSingle();

  const gapReportsUsed = existingUsage?.gap_reports_used || 0;

  // Cached reports were already paid for — re-reading one must never touch
  // quota or credits, so this check comes before ALL spend logic.
  const { data: existingReport } = await supabase
    .from("opportunity_score_reports")
    .select(
      "id, overall_score, fit_label, eligibility_status, strengths, gaps, recommended_actions, ai_explanation, model_used, updated_at"
    )
    .eq("user_id", userId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  if (existingReport) {
    return {
      ok: true,
      report: existingReport,
      cached: true,
      usedOverflowCredit: false,
      usage: {
        plan,
        gapReportsUsed,
        gapReportsLimit: planLimits.competitivenessReports,
        competitivenessScoresUsed: existingUsage?.competitiveness_scores_used || 0,
        competitivenessScoresLimit: planLimits.competitivenessScores,
      },
    };
  }

  let usedOverflowCredit = false;

  if (gapReportsUsed >= planLimits.competitivenessReports) {
    // Plan quota exhausted: pay-per-use overflow credits keep the user
    // moving. Credit ledger writes are service-role territory (RLS blocks
    // users from spending balances directly), so mint a service client here
    // regardless of which client the caller passed.
    const serviceClient = createServiceClient();
    usedOverflowCredit = await consumeCredit(
      serviceClient,
      userId,
      "competitiveness_report",
      opportunityId
    );
    if (!usedOverflowCredit) {
      return {
        ok: false,
        status: 403,
        error: `You've used all ${planLimits.competitivenessReports} competitiveness reports this month.`,
        overflowAvailable: true,
        purchasePath: "/api/billing/credits",
      };
    }
  }

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", opportunityId)
    .eq("is_active", true)
    .eq("is_approved", true)
    .maybeSingle();

  if (opportunityError || !opportunity) {
    return { ok: false, status: 404, error: "Opportunity not found or not available." };
  }

  const { data: experienceSummaryData } = await supabase
    .from("profile_experience_summaries")
    .select(
      "section_key, experience_key, experience_title, organization, summary, evidence_tags, notable_metrics"
    )
    .eq("user_id", userId);

  const { data: competitivenessScore } = await supabase
    .from("opportunity_competitiveness_scores")
    .select("score, fit_label, profile_snapshot, opportunity_snapshot")
    .eq("user_id", userId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  // Privacy boundary: same allowlist as batch scoring — demographic
  // self-identification, disability status, and date of birth never go to
  // AI; they are matched deterministically in the eligibility module.
  const profileContext = {
    basic_profile: {
      education_level: profile.education_level,
      class_standing: profile.class_standing || undefined,
      student_status: profile.student_status,
      opportunity_level: profile.opportunity_level,
      field_of_study: profile.field_of_study,
      field_of_study_other: profile.field_of_study_other,
      field_of_study_secondary: profile.field_of_study_secondary || undefined,
      country_of_study: profile.country_of_study,
      nationality: profile.nationality,
      gpa: profile.gpa,
      gpa_scale: profile.gpa_scale || "4.0",
      target_opportunity_types: profile.target_opportunity_types,
      preferred_regions: profile.preferred_regions,
      financial_need: profile.financial_need,
    },
    experience_summaries: experienceSummaryData || [],
    full_experiences: {
      leadership_experiences: profile.leadership_experiences,
      research_experiences: profile.research_experiences,
      volunteer_experiences: profile.volunteer_experiences,
      work_project_experiences: profile.work_project_experiences,
      awards: profile.awards,
    },
    existing_competitiveness_score: competitivenessScore || null,
  };

  const prompt = buildGapReportPrompt(profileContext, opportunity);


  const { text: responseText, modelUsed } = await generateGapReport(prompt);

  if (!responseText) {
    return {
      ok: false,
      status: 502,
      error: "The report generator did not return readable text.",
    };
  }

  const parsedResult = safeParseJson<Record<string, unknown>>(
    responseText,
    "Competitiveness report"
  );

  if (!parsedResult.success) {
    return {
      ok: false,
      status: 502,
      error: "The report generator returned malformed output. Please try again.",
    };
  }

  const parsed = parsedResult.data;

  const report = {
    user_id: userId,
    opportunity_id: opportunityId,
    overall_score: validateScore(parsed.overall_score),
    fit_label: parsed.fit_label || "Developing fit",
    eligibility_status: parsed.eligibility_status || "Unclear",
    strengths: arrayOrEmpty(parsed.strengths),
    gaps: arrayOrEmpty(parsed.gaps),
    recommended_actions: arrayOrEmpty(parsed.recommended_actions),
    ai_explanation: parsed.ai_explanation || "",
    model_used: modelUsed,
    profile_snapshot: profileContext,
    opportunity_snapshot: opportunity,
    updated_at: new Date().toISOString(),
  };

  const { data: savedReport, error: saveError } = await supabase
    .from("opportunity_score_reports")
    .upsert(report, { onConflict: "user_id,opportunity_id" })
    .select("*")
    .single();

  if (saveError) {
    console.error("gap report save error:", saveError.message);
    return { ok: false, status: 500, error: "Could not save the report. Please try again." };
  }

  // Overflow reports were paid with a credit — they never touch the
  // monthly plan quota.
  if (!usedOverflowCredit) {
    if (existingUsage?.id) {
      const { error: usageError } = await supabase
        .from("user_ai_usage")
        .update({
          gap_reports_used: gapReportsUsed + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingUsage.id);
      if (usageError) console.error("report usage update error:", usageError.message);
    } else {
      const { error: usageError } = await supabase.from("user_ai_usage").insert({
        user_id: userId,
        usage_month: usageMonth,
        gap_reports_used: 1,
        competitiveness_scores_used: 0,
      });
      if (usageError) console.error("report usage insert error:", usageError.message);
    }
  }

  return {
    ok: true,
    report: savedReport,
    cached: false,
    usedOverflowCredit,
    usage: {
      plan,
      gapReportsUsed: usedOverflowCredit ? gapReportsUsed : gapReportsUsed + 1,
      gapReportsLimit: planLimits.competitivenessReports,
      competitivenessScoresUsed: existingUsage?.competitiveness_scores_used || 0,
      competitivenessScoresLimit: planLimits.competitivenessScores,
    },
  };
}
