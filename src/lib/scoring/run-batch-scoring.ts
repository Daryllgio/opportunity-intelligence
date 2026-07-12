/**
 * Batch competitiveness scoring — the core, callable directly.
 *
 * This used to live only inside the API route, and the cron job runner
 * self-fetched it over HTTP. On Vercel that fetch can hit deployment
 * protection and receive an HTML page instead of JSON — which is exactly
 * how nightly scoring silently failed for days ("Unexpected token '<'").
 * The job runner now calls this function in-process; the route is a thin
 * auth wrapper around the same code.
 */
import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withRetry } from "@/lib/utils/retry";
import { withTimeout } from "@/lib/utils/timeout";
import { safeParseJson } from "@/lib/utils/safe-json";
import { getCurrentUsageMonth } from "@/lib/billing/plans";
import {
  getPlanLimitsForProfile,
  getSubscriptionState,
} from "@/lib/billing/subscription";
import { profileScoringGate } from "@/lib/scoring/profile-gate";
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
import { normalizeOpportunityType, OPPORTUNITY_TYPES } from "@/lib/discovery/taxonomy";
import { preferencesFromProfile } from "@/lib/preferences/types";
import { tier1Eligibility } from "@/lib/matching/tier1";
import { resolveEligibilityTier2 } from "@/lib/matching/tier2-eligibility";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SCORING_MODEL = "gemini-2.5-pro";
const GEMINI_CHUNK_SIZE = 20;

export type BatchScoringResult =
  | {
      ok: false;
      status: number;
      error: string;
      missingFields?: string[];
    }
  | {
      ok: true;
      scores: unknown[];
      counts: { total: number; created: number; refreshed: number };
      usage: {
        plan: string;
        competitivenessScoresUsed: number;
        competitivenessScoresLimit: number;
        gapReportsUsed: number;
        gapReportsLimit: number;
      };
      message?: string;
    };

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
    class_standing: profile.class_standing || undefined,
    student_status: profile.student_status,
    opportunity_level: profile.opportunity_level,
    field_of_study: profile.field_of_study,
    field_of_study_other: profile.field_of_study_other,
    field_of_study_secondary: profile.field_of_study_secondary || undefined,
    country_of_study: profile.country_of_study,
    state_or_province: profile.state_or_province || undefined,
    nationality: profile.nationality,
    gpa: profile.gpa,
    gpa_scale: profile.gpa_scale || "4.0",
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
    eligibility_criteria: opportunity.eligibility_criteria || undefined,
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
      // select * so new matching columns (eligibility_criteria, ...) flow into
      // scoring without a code change — and without breaking before the
      // migration that adds them is applied.
      .select("*")
      .eq("is_active", true)
      .eq("is_approved", true)
      .eq("lifecycle_status", "active")
      // Visibility parity with browse: never score what users never see.
      .or("application_status.is.null,application_status.in.(open,rolling,unknown)")
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

Score against EACH opportunity's OWN selection criteria — never a generic
"how impressive is this student" measure:
- Read competitiveness_factors, eligibility_criteria, and the description to
  understand what THIS opportunity actually selects on.
- A student with little or no experience is HIGHLY competitive for
  opportunities that don't select on experience: need-based aid, essay
  contests, first-generation programs, entrance awards, lottery-style or
  beginner-oriented pipeline programs. Meeting the stated bar IS
  competitiveness there.
- The same student scores LOW for experience-heavy selective programs
  (research fellowships, prestigious leadership cohorts).
- Experience QUALITY moves scores, not existence: judge depth from the
  summaries — duration (two years beats three weeks), responsibility,
  concrete outcomes and metrics. A boolean "has research" is worth little;
  sustained contribution with measurable results is worth a lot.
- GPA is on the stated gpa_scale ("percentage" means 0-100; "4.3" is a
  Canadian scale). Never treat an 85 on the percentage scale as impossible.

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
              // Pro's thinking shares this budget with the ~20 score
              // objects; 4096 risked silent chunk truncation.
              maxOutputTokens: 16384,
            },
          }),
        120000,
        "Gemini batch scoring"
      );

      const rawText = response.text;
      if (!rawText) {
        throw new Error("Gemini did not return readable text.");
      }

      const parsedResult = safeParseJson<{ scores?: unknown }>(
        rawText,
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

/**
 * Run batch scoring for one user. `supabase` must be a service-role client;
 * callers are responsible for having authenticated the user.
 */
export async function runBatchScoringForUser({
  supabase,
  userId,
  scoreAllEligible = true,
  requestedLimit = 10,
}: {
  supabase: SupabaseClient;
  userId: string;
  scoreAllEligible?: boolean;
  requestedLimit?: number;
}): Promise<BatchScoringResult> {
  if (!process.env.GEMINI_API_KEY) {
    return { ok: false, status: 500, error: "Missing GEMINI_API_KEY." };
  }

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
    return {
      ok: false,
      status: 400,
      error: "Complete your profile before generating competitiveness scores.",
    };
  }

  const gate = profileScoringGate(profile as Record<string, unknown>);
  if (!gate.complete) {
    return {
      ok: false,
      status: 400,
      error: `Complete your profile to unlock scores. Missing: ${gate.missing.join(", ")}.`,
      missingFields: gate.missing,
    };
  }

  const planLimits = getPlanLimitsForProfile(profile as Record<string, unknown>);
  const plan =
    getSubscriptionState(profile as Record<string, unknown>).effectivePlan || "none";
  const usageMonth = getCurrentUsageMonth();

  if (planLimits.competitivenessScores <= 0) {
    return {
      ok: false,
      status: 403,
      error: "Competitiveness scores are available on paid plans.",
    };
  }

  const { data: existingUsage } = await supabase
    .from("user_ai_usage")
    .select("id, competitiveness_scores_used, gap_reports_used")
    .eq("user_id", userId)
    .eq("usage_month", usageMonth)
    .maybeSingle();

  const scoresUsed = existingUsage?.competitiveness_scores_used || 0;
  const scoresRemaining = Math.max(
    0,
    planLimits.competitivenessScores - scoresUsed
  );

  // Quota buys COVERAGE: the first scoring of an opportunity for this user.
  // Keeping existing scores fresh after profile edits or opportunity
  // updates is the platform's job — hash-gated so only genuine changes
  // rescore, and capped per run so a single pass stays bounded.
  const REFRESH_BATCH_CAP = 50;

  const batchLimit = scoreAllEligible
    ? scoresRemaining
    : Math.min(limit, scoresRemaining);

  // Every active opportunity competes for a slot — not just the first page.
  const opportunities = await fetchAllActiveOpportunities(supabase);

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

  const newCandidates = candidates.filter(
    (candidate) => !existingScoreMap.has(String(candidate.opportunity.id))
  );
  const refreshCandidates = candidates.filter((candidate) =>
    existingScoreMap.has(String(candidate.opportunity.id))
  );

  // New coverage spends quota and respects per-category caps; refreshes of
  // already-covered opportunities are free but bounded per run.
  const newlyChosen = allocateScoringSlots({
    candidates: newCandidates,
    totalRemaining: batchLimit,
    perCategoryRemaining,
  });

  // SPILLOVER: when the chosen scored categories can't fill the user's paid
  // capacity (strict eligibility + sub-type exclusion can leave a thin set),
  // the unused slots spill into the user's database-ACCESS categories —
  // still eligibility-gated, still preference-gated, still relevance-ranked.
  // Paid capacity never sits idle just because a niche category ran dry.
  let spilledChosen: typeof newlyChosen = [];
  const spillBudget = Math.min(batchLimit - newlyChosen.length, scoresRemaining - newlyChosen.length);
  if (spillBudget > 0) {
    const preferences = preferencesFromProfile(profile as Record<string, unknown>);
    const spillCategories = (
      preferences.access_categories.length > 0
        ? preferences.access_categories
        : OPPORTUNITY_TYPES.map(String)
    ).filter((category: string) => !rankedCategories.includes(category));

    if (spillCategories.length > 0) {
      const chosenIds = new Set(
        newlyChosen.map((c) => String((c.opportunity as Record<string, unknown>).id))
      );
      const spillCandidates = opportunities
        .filter((opportunity) => !chosenIds.has(String(opportunity.id)))
        .filter((opportunity) => !existingScoreMap.has(String(opportunity.id)))
        .filter((opportunity) =>
          shouldScoreOpportunity(
            profile as Record<string, unknown>,
            opportunity,
            spillCategories
          )
        )
        .map((opportunity) => ({
          opportunity,
          priority: criteriaPriorityScore({
            profile: profile as Record<string, unknown>,
            opportunity,
            rankedCategories: spillCategories,
            experienceTokens,
          }),
        }));

      const spillPerCategory: Record<string, number> = {};
      for (const category of spillCategories) {
        spillPerCategory[category] = planLimits.competitivenessScoresPerCategory;
      }
      spilledChosen = allocateScoringSlots({
        candidates: spillCandidates,
        totalRemaining: spillBudget,
        perCategoryRemaining: spillPerCategory,
      });
    }
  }

  const refreshChosen = allocateScoringSlots({
    candidates: refreshCandidates,
    totalRemaining: REFRESH_BATCH_CAP,
    perCategoryRemaining: {},
  });
  let unscored = [...newlyChosen, ...spilledChosen, ...refreshChosen];

  // Tier-2 eligibility gate on the rows about to spend Pro tokens: the
  // cached Flash resolver settles what the deterministic rules couldn't.
  // A confirmed-ineligible row must never be scored — the user would see a
  // score on an award they cannot win, and the platform pays twice (Flash
  // here is ~1/50th the cost of the Pro scoring call it prevents).
  try {
    const uncertainRows = unscored
      .map((candidate) => candidate.opportunity as Record<string, unknown>)
      .filter((opportunity) => {
        const tier1 = tier1Eligibility({
          profile: profile as Record<string, unknown>,
          opportunity,
        });
        return tier1.decision === "uncertain" && tier1.uncertainChecks.length > 0;
      });
    if (uncertainRows.length > 0) {
      const tier2 = await resolveEligibilityTier2({
        supabase,
        profile: profile as Record<string, unknown>,
        rows: uncertainRows,
        maxAiCalls: 6,
      });
      unscored = unscored.filter(
        (candidate) =>
          tier2.decisions.get(
            String((candidate.opportunity as Record<string, unknown>).id)
          )?.decision !== "ineligible"
      );
    }
  } catch {
    // Resolver trouble never blocks scoring — Tier 1 already passed these.
  }

  if (unscored.length === 0) {
    if (scoresRemaining <= 0 && newCandidates.length > 0) {
      return {
        ok: false,
        status: 403,
        error: `You have used all ${planLimits.competitivenessScores} competitiveness scores for this month.`,
      };
    }
    return {
      ok: true,
      scores: [],
      counts: { total: 0, created: 0, refreshed: 0 },
      usage: {
        plan,
        competitivenessScoresUsed: scoresUsed,
        competitivenessScoresLimit: planLimits.competitivenessScores,
        gapReportsUsed: existingUsage?.gap_reports_used || 0,
        gapReportsLimit: planLimits.competitivenessReports,
      },
      message:
        "No unscored opportunities matched this profile and preference filter.",
    };
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

  // The model occasionally emits the same opportunity_id twice; keep the
  // first so counts stay honest and the upsert never sees a duplicate key.
  const seenScoreIds = new Set<string>();
  const dedupedScores = parsedScores.filter((item) => {
    const id = String(item.opportunity_id);
    if (seenScoreIds.has(id)) return false;
    seenScoreIds.add(id);
    return true;
  });
  parsedScores.length = 0;
  parsedScores.push(...dedupedScores);

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
    return {
      ok: false,
      status: 502,
      error: "The scoring model did not return valid score objects.",
    };
  }

  const { data: savedScores, error: saveError } = await supabase
    .from("opportunity_competitiveness_scores")
    .upsert(scoreRows, { onConflict: "user_id,opportunity_id" })
    .select("*");

  if (saveError) {
    console.error("batch scoring save:", saveError.message);
    return { ok: false, status: 500, error: "Scoring failed. Please try again." };
  }

  // Only new coverage consumes quota; refreshes are the platform's cost.
  const newScoresUsed = scoresUsed + scoringCounts.created;

  if (existingUsage?.id) {
    const { error: usageError } = await supabase
      .from("user_ai_usage")
      .update({
        competitiveness_scores_used: newScoresUsed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingUsage.id);
    if (usageError) console.error("batch scoring usage:", usageError.message);
  } else {
    const { error: usageError } = await supabase.from("user_ai_usage").insert({
      user_id: userId,
      usage_month: usageMonth,
      // created only — refreshes never touch quota (was scoreRows.length,
      // which overcounted refreshes on a user's first run of the month).
      competitiveness_scores_used: scoringCounts.created,
      gap_reports_used: 0,
    });
    if (usageError) console.error("batch scoring usage:", usageError.message);
  }

  return {
    ok: true,
    scores: savedScores || [],
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
      gapReportsLimit: planLimits.competitivenessReports,
    },
  };
}
