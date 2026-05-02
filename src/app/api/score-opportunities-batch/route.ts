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

type ExperienceSummaryRow = {
  section_key: string;
  experience_key: string;
  experience_title: string | null;
  organization: string | null;
  summary: string;
  evidence_tags: string[] | null;
  notable_metrics: string[] | null;
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


function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim();
}

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function hasOpenEligibility(items: unknown) {
  const values = normalizeList(items);

  if (values.length === 0) return true;

  return values.some((item) =>
    ["any", "all", "global", "open", "not specified", "all fields"].includes(item)
  );
}

function textMatchesList(text: unknown, list: unknown) {
  const target = normalizeText(text);
  const values = normalizeList(list);

  if (!target || values.length === 0) return true;
  if (hasOpenEligibility(list)) return true;

  return values.some((value) => target.includes(value) || value.includes(target));
}

function opportunityTypeMatches(
  profile: Record<string, unknown>,
  opportunity: Record<string, unknown>
) {
  const allowedMvpTypes = [
    "scholarship",
    "research",
    "fellowship",
    "competition",
    "leadership_program",
  ];

  const selectedTypes = normalizeList(profile.target_opportunity_types);
  const opportunityType = normalizeText(opportunity.type);

  if (!opportunityType) return false;

  if (!allowedMvpTypes.includes(opportunityType)) {
    return false;
  }

  if (selectedTypes.length === 0) return true;

  return selectedTypes.some(
    (type) =>
      type === opportunityType ||
      type.includes(opportunityType) ||
      opportunityType.includes(type)
  );
}

function regionMatches(
  profile: Record<string, unknown>,
  opportunity: Record<string, unknown>
) {
  const preferredRegions = normalizeList(profile.preferred_regions);
  const countryOfStudy = normalizeText(profile.country_of_study || profile.country);
  const nationality = normalizeText(profile.nationality);

  const opportunityCountry = normalizeText(opportunity.country);
  const eligibleCountries = normalizeList(opportunity.eligible_countries);

  if (preferredRegions.length === 0) return true;
  if (!opportunityCountry && eligibleCountries.length === 0) return true;

  const opportunityRegions = [opportunityCountry, ...eligibleCountries].filter(Boolean);

  if (
    opportunityRegions.some((region) =>
      ["any", "all", "global", "open", "not specified"].includes(region)
    )
  ) {
    return true;
  }

  return preferredRegions.some((preferred) =>
    opportunityRegions.some(
      (region) =>
        preferred.includes(region) ||
        region.includes(preferred) ||
        (countryOfStudy && region.includes(countryOfStudy)) ||
        (nationality && region.includes(nationality))
    )
  );
}

function educationMatches(
  profile: Record<string, unknown>,
  opportunity: Record<string, unknown>
) {
  return textMatchesList(
    profile.education_level || profile.student_status || profile.opportunity_level,
    opportunity.eligible_education_levels
  );
}

function fieldMatches(
  profile: Record<string, unknown>,
  opportunity: Record<string, unknown>
) {
  if (hasOpenEligibility(opportunity.eligible_fields)) return true;

  return textMatchesList(
    profile.field_of_study || profile.field_of_study_other,
    opportunity.eligible_fields
  );
}

function deadlineIsActive(opportunity: Record<string, unknown>) {
  const deadline = normalizeText(opportunity.deadline);

  if (!deadline) return true;

  const parsed = new Date(deadline);

  if (Number.isNaN(parsed.getTime())) return true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return parsed >= today;
}

function getOpportunityCriteriaText(opportunity: Record<string, unknown>) {
  const factors = Array.isArray(opportunity.competitiveness_factors)
    ? opportunity.competitiveness_factors.join(" ")
    : "";

  return normalizeText(
    [
      factors,
      opportunity.title,
      opportunity.ai_summary,
      opportunity.description,
    ].join(" ")
  );
}

function profileHasEvidence(profile: Record<string, unknown>, evidenceType: string) {
  if (evidenceType === "leadership") {
    return Boolean(profile.has_leadership) || normalizeList(profile.leadership_experiences).length > 0;
  }

  if (evidenceType === "research") {
    return Boolean(profile.has_research) || normalizeList(profile.research_experiences).length > 0;
  }

  if (evidenceType === "volunteering") {
    return Boolean(profile.has_volunteering) || normalizeList(profile.volunteer_experiences).length > 0;
  }

  if (evidenceType === "awards") {
    return Boolean(profile.has_awards) || normalizeList(profile.awards).length > 0;
  }

  if (evidenceType === "financial_need") {
    return Boolean(profile.financial_need);
  }

  if (evidenceType === "projects") {
    return normalizeList(profile.work_project_experiences).length > 0;
  }

  return false;
}

function criteriaPriorityScore(
  profile: Record<string, unknown>,
  opportunity: Record<string, unknown>
) {
  const criteriaText = getOpportunityCriteriaText(opportunity);

  let priority = 0;

  // Strong base boosts for core preference/fit matches.
  if (opportunityTypeMatches(profile, opportunity)) priority += 25;
  if (regionMatches(profile, opportunity)) priority += 15;
  if (educationMatches(profile, opportunity)) priority += 15;
  if (fieldMatches(profile, opportunity)) priority += 15;

  const criteria = [
    {
      type: "leadership",
      keywords: ["leadership", "leader", "initiative", "student leader", "community leader"],
      weight: 15,
    },
    {
      type: "research",
      keywords: ["research", "lab", "publication", "poster", "faculty mentor"],
      weight: 15,
    },
    {
      type: "volunteering",
      keywords: ["volunteer", "service", "community service", "community impact"],
      weight: 12,
    },
    {
      type: "awards",
      keywords: ["award", "honor", "honour", "scholarship", "recognition", "achievement"],
      weight: 10,
    },
    {
      type: "financial_need",
      keywords: ["financial need", "need-based", "low income", "demonstrated need"],
      weight: 10,
    },
    {
      type: "projects",
      keywords: ["project", "portfolio", "startup", "prototype", "software", "technical"],
      weight: 10,
    },
  ];

  for (const criterion of criteria) {
    const opportunityMentionsCriterion = criterion.keywords.some((keyword) =>
      criteriaText.includes(keyword)
    );

    if (!opportunityMentionsCriterion) continue;

    if (profileHasEvidence(profile, criterion.type)) {
      priority += criterion.weight;
    } else {
      priority -= Math.round(criterion.weight / 2);
    }
  }

  const gpa = Number(profile.gpa);
  const mentionsAcademicExcellence =
    criteriaText.includes("gpa") ||
    criteriaText.includes("academic excellence") ||
    criteriaText.includes("academic merit") ||
    criteriaText.includes("high academic");

  if (mentionsAcademicExcellence && !Number.isNaN(gpa)) {
    if (gpa >= 3.7) priority += 12;
    else if (gpa >= 3.3) priority += 6;
    else priority -= 8;
  }

  return priority;
}

function shouldScoreOpportunity(
  profile: Record<string, unknown>,
  opportunity: Record<string, unknown>
) {
  return (
    deadlineIsActive(opportunity) &&
    opportunityTypeMatches(profile, opportunity) &&
    regionMatches(profile, opportunity) &&
    educationMatches(profile, opportunity) &&
    fieldMatches(profile, opportunity)
  );
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
      .filter((opportunity) =>
        shouldScoreOpportunity(
          profile as Record<string, unknown>,
          opportunity as Record<string, unknown>
        )
      )
      .map((opportunity) => ({
        opportunity,
        priority: criteriaPriorityScore(
          profile as Record<string, unknown>,
          opportunity as Record<string, unknown>
        ),
      }))
      .sort((a, b) => b.priority - a.priority)
      .map((item) => item.opportunity)
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
        message: "No unscored opportunities matched this profile and preference filter.",
      });
    }

    const { data: experienceSummaryData } = await supabase
      .from("profile_experience_summaries")
      .select(
        "section_key, experience_key, experience_title, organization, summary, evidence_tags, notable_metrics"
      )
      .eq("user_id", user.id);

    const compactProfile = {
      basic_profile: compactProfileForScoring(profile as Record<string, unknown>),
      experience_summaries: groupExperienceSummaries(
        (experienceSummaryData || []) as ExperienceSummaryRow[]
      ),
    };

    const scoringOpportunities = unscored.map((opportunity) =>
      compactOpportunityForScoring(opportunity as Record<string, unknown>)
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
          profile_snapshot: compactProfile,
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
