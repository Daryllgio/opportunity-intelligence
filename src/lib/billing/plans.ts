export type SubscriptionPlan = "free" | "basic" | "pro" | "premium";

export type RankingRefreshLevel = "none" | "standard" | "priority";

export type PlanLimits = {
  name: string;
  price: number;

  // Internal cost-control limits. Never show these as dashboard usage meters.
  competitivenessScores: number;
  competitivenessScoresPerCategory: number;
  gapReports: number;

  // AI natural-language search (Premium): metered by actual model tokens.
  // 1 displayed "search credit" = 10,000 tokens; a typical search uses ~4-6
  // credits, so this budget is roughly 130-200 searches a month today and
  // scales down naturally as the catalog (and therefore value) grows.
  aiSearchMonthlyTokens: number;

  // Product rules.
  rankedCategoryLimit: number | "all";
  rankingRefreshLevel: RankingRefreshLevel;
  hasCompetitivenessRanking: boolean;
  hasGapReports: boolean;
  hasAiSearch: boolean;
  canSaveOpportunities: boolean;
  hasDeadlineReminders: boolean;
  hasFullDetails: boolean;
  hasFullDashboard: boolean;
};

export const AI_SEARCH_TOKENS_PER_CREDIT = 10_000;

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    name: "Free",
    price: 0,
    competitivenessScores: 0,
    competitivenessScoresPerCategory: 0,
    gapReports: 0,
    aiSearchMonthlyTokens: 0,
    rankedCategoryLimit: 0,
    rankingRefreshLevel: "none",
    hasCompetitivenessRanking: false,
    hasGapReports: false,
    hasAiSearch: false,
    canSaveOpportunities: false,
    hasDeadlineReminders: false,
    hasFullDetails: false,
    hasFullDashboard: false,
  },
  basic: {
    name: "Basic",
    price: 10,
    competitivenessScores: 100,
    competitivenessScoresPerCategory: 100,
    gapReports: 20,
    aiSearchMonthlyTokens: 0,
    rankedCategoryLimit: 1,
    rankingRefreshLevel: "standard",
    hasCompetitivenessRanking: true,
    hasGapReports: true,
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
    gapReports: 40,
    aiSearchMonthlyTokens: 0,
    rankedCategoryLimit: 2,
    rankingRefreshLevel: "standard",
    hasCompetitivenessRanking: true,
    hasGapReports: true,
    hasAiSearch: false,
    canSaveOpportunities: true,
    hasDeadlineReminders: true,
    hasFullDetails: true,
    hasFullDashboard: true,
  },
  premium: {
    name: "Premium",
    // Raised from $35 with the addition of AI search: worst-case AI cost per
    // Premium user is ~$7.90/month (scores + reports + 8M search tokens),
    // which holds the margin above 80% even at full quota burn.
    price: 40,
    competitivenessScores: 400,
    competitivenessScoresPerCategory: 100,
    gapReports: 80,
    aiSearchMonthlyTokens: 8_000_000,
    rankedCategoryLimit: 4,
    rankingRefreshLevel: "priority",
    hasCompetitivenessRanking: true,
    hasGapReports: true,
    hasAiSearch: true,
    canSaveOpportunities: true,
    hasDeadlineReminders: true,
    hasFullDetails: true,
    hasFullDashboard: true,
  },
};

export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  if (plan === "basic" || plan === "pro" || plan === "premium" || plan === "free") {
    return PLAN_LIMITS[plan];
  }

  return PLAN_LIMITS.free;
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
