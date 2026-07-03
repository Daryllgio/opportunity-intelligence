export type SubscriptionPlan = "free" | "pro" | "premium";

export type RankingRefreshLevel = "none" | "standard" | "priority";

export type PlanLimits = {
  name: string;
  price: number;

  // Internal cost-control limits. Do not show these as dashboard usage meters.
  competitivenessScores: number;
  gapReports: number;

  // Product rules.
  rankedCategoryLimit: number | "all";
  rankingRefreshLevel: RankingRefreshLevel;
  hasCompetitivenessRanking: boolean;
  hasGapReports: boolean;
};

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    name: "Free",
    price: 0,
    competitivenessScores: 0,
    gapReports: 0,
    rankedCategoryLimit: 0,
    rankingRefreshLevel: "none",
    hasCompetitivenessRanking: false,
    hasGapReports: false,
  },
  pro: {
    name: "Pro",
    price: 20,
    competitivenessScores: 250,
    gapReports: 40,
    rankedCategoryLimit: 3,
    rankingRefreshLevel: "standard",
    hasCompetitivenessRanking: true,
    hasGapReports: true,
  },
  premium: {
    name: "Premium",
    price: 35,
    competitivenessScores: 400,
    gapReports: 80,
    rankedCategoryLimit: "all",
    rankingRefreshLevel: "priority",
    hasCompetitivenessRanking: true,
    hasGapReports: true,
  },
};

export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  if (plan === "pro" || plan === "premium" || plan === "free") {
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
