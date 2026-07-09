export type SubscriptionPlan = "basic" | "pro" | "premium";

export type RankingRefreshLevel = "none" | "standard" | "priority";

export type PlanLimits = {
  name: string;
  price: number;

  // Internal cost-control limits. Never show these as dashboard usage meters.
  competitivenessScores: number;
  competitivenessScoresPerCategory: number;
  competitivenessReports: number;

  // AI natural-language search (Premium): metered by actual model tokens.
  // 1 displayed "search credit" = 10,000 tokens; a typical search uses ~2-6
  // credits, so this budget is roughly 130-400 searches a month today and
  // scales down naturally as the catalog (and therefore value) grows.
  aiSearchMonthlyTokens: number;

  // Product rules.
  rankedCategoryLimit: number | "all";
  rankingRefreshLevel: RankingRefreshLevel;
  hasCompetitivenessRanking: boolean;
  hasCompetitivenessReports: boolean;
  hasAiSearch: boolean;
  canSaveOpportunities: boolean;
  hasDeadlineReminders: boolean;
  hasFullDetails: boolean;
  hasFullDashboard: boolean;
};

export const AI_SEARCH_TOKENS_PER_CREDIT = 10_000;

export const TRIAL_DAYS = 7;
export const GRACE_DAYS = 7;

/**
 * What a signed-in user WITHOUT an active plan, trial, or grace period can
 * do: browse basic info. There is no permanent free tier — the 7-day trial
 * gives full access to a chosen tier, then this is what remains. Data is
 * always preserved; access, not history, is what lapses.
 */
export const NO_PLAN_LIMITS: PlanLimits = {
  name: "No plan",
  price: 0,
  competitivenessScores: 0,
  competitivenessScoresPerCategory: 0,
  competitivenessReports: 0,
  aiSearchMonthlyTokens: 0,
  rankedCategoryLimit: 0,
  rankingRefreshLevel: "none",
  hasCompetitivenessRanking: false,
  hasCompetitivenessReports: false,
  hasAiSearch: false,
  canSaveOpportunities: false,
  hasDeadlineReminders: false,
  hasFullDetails: false,
  hasFullDashboard: false,
};

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  basic: {
    name: "Basic",
    price: 10,
    competitivenessScores: 100,
    competitivenessScoresPerCategory: 100,
    competitivenessReports: 15,
    aiSearchMonthlyTokens: 0,
    rankedCategoryLimit: 1,
    rankingRefreshLevel: "standard",
    hasCompetitivenessRanking: true,
    hasCompetitivenessReports: true,
    hasAiSearch: false,
    canSaveOpportunities: true,
    hasDeadlineReminders: true,
    hasFullDetails: true,
    hasFullDashboard: true,
  },
  pro: {
    name: "Pro",
    price: 20,
    competitivenessScores: 200,
    competitivenessScoresPerCategory: 100,
    competitivenessReports: 30,
    aiSearchMonthlyTokens: 0,
    rankedCategoryLimit: 2,
    rankingRefreshLevel: "standard",
    hasCompetitivenessRanking: true,
    hasCompetitivenessReports: true,
    hasAiSearch: false,
    canSaveOpportunities: true,
    hasDeadlineReminders: true,
    hasFullDetails: true,
    hasFullDashboard: true,
  },
  premium: {
    name: "Premium",
    // Profitability at absolute max usage (July 2026 model prices):
    //   400 scores ≈ $1.40 (Pro batch), 60 reports ≈ $1.45 (Sonnet),
    //   8M search tokens ≈ $2.60 (Flash), refresh overhead ≈ $1
    //   → ~$6.45 worst case → 84% margin at $40; typical usage >92%.
    price: 40,
    competitivenessScores: 400,
    competitivenessScoresPerCategory: 100,
    competitivenessReports: 60,
    aiSearchMonthlyTokens: 8_000_000,
    rankedCategoryLimit: 4,
    rankingRefreshLevel: "priority",
    hasCompetitivenessRanking: true,
    hasCompetitivenessReports: true,
    hasAiSearch: true,
    canSaveOpportunities: true,
    hasDeadlineReminders: true,
    hasFullDetails: true,
    hasFullDashboard: true,
  },
};

export function isPaidPlan(value: unknown): value is SubscriptionPlan {
  return value === "basic" || value === "pro" || value === "premium";
}

/**
 * Limits for a plan NAME. Prefer getPlanLimitsForProfile (billing/subscription)
 * anywhere a profile row is available — it understands trials, grace periods,
 * scheduled downgrades, and expiry. This function is for static contexts
 * (pricing page) and legacy plan strings ("free" maps to no-plan).
 */
export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  if (isPaidPlan(plan)) return PLAN_LIMITS[plan];
  return NO_PLAN_LIMITS;
}

export function getPlanLabel(plan: string | null | undefined) {
  return getPlanLimits(plan).name;
}

export function canRankCategory(
  plan: string | null | undefined,
  categoryIndex: number
) {
  const limits = getPlanLimits(plan);

  if (!limits.hasCompetitivenessRanking) return false;
  if (limits.rankedCategoryLimit === "all") return true;

  return categoryIndex < limits.rankedCategoryLimit;
}

export function getCurrentUsageMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}
