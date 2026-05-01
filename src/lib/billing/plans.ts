export type SubscriptionPlan = "free" | "pro" | "premium";

export type PlanLimits = {
  name: string;
  price: number;
  competitivenessScores: number;
  gapReports: number;
  savedOpportunities: number | "unlimited";
};

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    name: "Free",
    price: 0,
    competitivenessScores: 0,
    gapReports: 0,
    savedOpportunities: 10,
  },
  pro: {
    name: "Pro",
    price: 20,
    competitivenessScores: 250,
    gapReports: 40,
    savedOpportunities: "unlimited",
  },
  premium: {
    name: "Premium",
    price: 35,
    competitivenessScores: 400,
    gapReports: 90,
    savedOpportunities: "unlimited",
  },
};

export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  if (plan === "pro" || plan === "premium" || plan === "free") {
    return PLAN_LIMITS[plan];
  }

  return PLAN_LIMITS.free;
}

export function getCurrentUsageMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}
