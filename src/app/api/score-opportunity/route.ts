import { GoogleGenAI } from "@google/genai";
import { withRetry } from "@/lib/utils/retry";
import { withTimeout } from "@/lib/utils/timeout";
import { safeParseJson } from "@/lib/utils/safe-json";
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
        { error: "You must be logged in to generate a score report." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const opportunityId = body.opportunityId;

    if (!opportunityId) {
      return NextResponse.json(
        { error: "opportunityId is required." },
        { status: 400 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Complete your profile before generating a score report." },
        { status: 400 }
      );
    }

    const plan = profile.subscription_plan || "free";
    const planLimits = getPlanLimits(plan);
    const usageMonth = getCurrentUsageMonth();

    if (planLimits.gapReports <= 0) {
      return NextResponse.json(
        {
          error:
            "AI gap reports are available on Pro and Premium plans. Upgrade to generate this report.",
        },
        { status: 403 }
      );
    }

    const { data: existingUsage } = await supabase
      .from("user_ai_usage")
      .select("id, gap_reports_used, competitiveness_scores_used")
      .eq("user_id", user.id)
      .eq("usage_month", usageMonth)
      .maybeSingle();

    const gapReportsUsed = existingUsage?.gap_reports_used || 0;

    if (gapReportsUsed >= planLimits.gapReports) {
      return NextResponse.json(
        {
          error: `You have used all ${planLimits.gapReports} gap reports for this month.`,
        },
        { status: 403 }
      );
    }

    const { data: existingReport } = await supabase
      .from("opportunity_score_reports")
      .select("id, overall_score, fit_label, eligibility_status, strengths, gaps, recommended_actions, ai_explanation, model_used, updated_at")
      .eq("user_id", user.id)
      .eq("opportunity_id", opportunityId)
      .maybeSingle();

    if (existingReport) {
      return NextResponse.json({
        report: existingReport,
        usage: {
          plan,
          gapReportsUsed,
          gapReportsLimit: planLimits.gapReports,
          competitivenessScoresUsed:
            existingUsage?.competitiveness_scores_used || 0,
          competitivenessScoresLimit: planLimits.competitivenessScores,
        },
      });
    }

    const { data: opportunity, error: opportunityError } = await supabase
      .from("opportunities")
      .select("*")
      .eq("id", opportunityId)
      .eq("is_active", true)
      .eq("is_approved", true)
      .maybeSingle();

    if (opportunityError || !opportunity) {
      return NextResponse.json(
        { error: "Opportunity not found or not available." },
        { status: 404 }
      );
    }

    const { data: experienceSummaryData } = await supabase
      .from("profile_experience_summaries")
      .select(
        "section_key, experience_key, experience_title, organization, summary, evidence_tags, notable_metrics"
      )
      .eq("user_id", user.id);

    const { data: competitivenessScore } = await supabase
      .from("opportunity_competitiveness_scores")
      .select("score, fit_label, profile_snapshot, opportunity_snapshot")
      .eq("user_id", user.id)
      .eq("opportunity_id", opportunityId)
      .maybeSingle();

    const profileContext = {
      basic_profile: {
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

    const prompt = `
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

    const response = await withRetry(
      () =>
        withTimeout(
          () =>
            ai.models.generateContent({
              model: "gemini-2.5-pro",
              contents: prompt,
              config: {
                temperature: 0,
                topP: 0.8,
                topK: 20,
                maxOutputTokens: 2048,
              },
            }),
          30000,
          "Gemini gap report"
        ),
      { maxRetries: 2 }
    );

    const responseText = response.text;

    if (!responseText) {
      return NextResponse.json(
        { error: "Gemini did not return readable text." },
        { status: 500 }
      );
    }

    const parsedResult = safeParseJson<Record<string, unknown>>(
      responseText,
      "Gemini gap report"
    );

    if (!parsedResult.success) {
      return NextResponse.json(
        { error: "Gemini returned malformed output." },
        { status: 502 }
      );
    }

    const parsed = parsedResult.data;

    const report = {
      user_id: user.id,
      opportunity_id: opportunityId,
      overall_score: validateScore(parsed.overall_score),
      fit_label: parsed.fit_label || "Developing fit",
      eligibility_status: parsed.eligibility_status || "Unclear",
      strengths: arrayOrEmpty(parsed.strengths),
      gaps: arrayOrEmpty(parsed.gaps),
      recommended_actions: arrayOrEmpty(parsed.recommended_actions),
      ai_explanation: parsed.ai_explanation || "",
      model_used: "gemini-2.5-pro",
      profile_snapshot: profileContext,
      opportunity_snapshot: opportunity,
      updated_at: new Date().toISOString(),
    };

    const { data: savedReport, error: saveError } = await supabase
      .from("opportunity_score_reports")
      .upsert(report, {
        onConflict: "user_id,opportunity_id",
      })
      .select("*")
      .single();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    if (existingUsage?.id) {
      const { error: usageError } = await supabase
        .from("user_ai_usage")
        .update({
          gap_reports_used: gapReportsUsed + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingUsage.id);

      if (usageError) {
        return NextResponse.json({ error: usageError.message }, { status: 500 });
      }
    } else {
      const { error: usageError } = await supabase
        .from("user_ai_usage")
        .insert({
          user_id: user.id,
          usage_month: usageMonth,
          gap_reports_used: 1,
          competitiveness_scores_used: 0,
        });

      if (usageError) {
        return NextResponse.json({ error: usageError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      report: savedReport,
      usage: {
        plan,
        gapReportsUsed: gapReportsUsed + 1,
        gapReportsLimit: planLimits.gapReports,
        competitivenessScoresUsed:
          existingUsage?.competitiveness_scores_used || 0,
        competitivenessScoresLimit: planLimits.competitivenessScores,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Score report generation failed.",
      },
      { status: 500 }
    );
  }
}
