/**
 * Subscription state machine — no Stripe checkout yet, but every state and
 * transition the checkout will drive is real now:
 *
 *   none ──startTrial──▶ trialing ──(7 days)──▶ expired
 *                             │ payment attached (future Stripe)
 *                             ▼
 *   active ──payment failure──▶ grace ──(7 days)──▶ expired
 *      │                            │ payment fixed
 *      │◀───────────────────────────┘
 *      └─ downgrade requested ─▶ pending_plan applies at month end
 *
 * Expiry stops ACCESS, never data: profiles, scores, saved items, and
 * reports are preserved so a returning subscriber resumes where they left
 * off. All reads degrade gracefully until the migration adds the columns —
 * legacy rows (no subscription_status) keep their old subscription_plan
 * behavior so nothing regresses on deploy.
 */
import {
  GRACE_DAYS,
  NO_PLAN_LIMITS,
  PLAN_LIMITS,
  TRIAL_DAYS,
  getPlanLimits,
  isPaidPlan,
  type PlanLimits,
  type SubscriptionPlan,
} from "@/lib/billing/plans";

type SupabaseClientLike = {
  from: (table: string) => any;
};

export type SubscriptionState = {
  status: "none" | "trialing" | "active" | "grace" | "expired" | "legacy";
  /** The plan whose limits currently apply (null = browse-only). */
  effectivePlan: SubscriptionPlan | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  pendingPlan: SubscriptionPlan | null;
  planChangeEffectiveAt: string | null;
  /** True when a lazy persistence pass should write a due transition. */
  transitionDue: boolean;
};

function firstOfNextMonthUtc(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  ).toISOString();
}

export function getSubscriptionState(
  profile: Record<string, unknown> | null | undefined,
  now = new Date()
): SubscriptionState {
  const base: SubscriptionState = {
    status: "none",
    effectivePlan: null,
    trialEndsAt: null,
    graceEndsAt: null,
    pendingPlan: null,
    planChangeEffectiveAt: null,
    transitionDue: false,
  };
  if (!profile) return base;

  const status = String(profile.subscription_status || "");
  const plan = isPaidPlan(profile.subscription_plan)
    ? profile.subscription_plan
    : null;

  // Legacy rows: the status column hasn't been migrated/backfilled yet.
  // Honor the old subscription_plan directly so nothing regresses.
  if (!status || status === "none") {
    if (plan) {
      return { ...base, status: "legacy", effectivePlan: plan };
    }
    return base;
  }

  const trialEndsAt = profile.trial_ends_at ? String(profile.trial_ends_at) : null;
  const graceEndsAt = profile.grace_ends_at ? String(profile.grace_ends_at) : null;
  const pendingPlan = isPaidPlan(profile.pending_plan) ? profile.pending_plan : null;
  const planChangeEffectiveAt = profile.plan_change_effective_at
    ? String(profile.plan_change_effective_at)
    : null;

  if (status === "trialing") {
    const trialPlan = isPaidPlan(profile.trial_plan) ? profile.trial_plan : plan;
    if (trialEndsAt && new Date(trialEndsAt) > now && trialPlan) {
      return {
        ...base,
        status: "trialing",
        effectivePlan: trialPlan,
        trialEndsAt,
      };
    }
    return { ...base, status: "expired", trialEndsAt, transitionDue: true };
  }

  if (status === "grace") {
    if (graceEndsAt && new Date(graceEndsAt) > now && plan) {
      return { ...base, status: "grace", effectivePlan: plan, graceEndsAt };
    }
    return { ...base, status: "expired", graceEndsAt, transitionDue: true };
  }

  if (status === "active" && plan) {
    // Scheduled downgrade: higher-tier advantages persist until month end.
    if (
      pendingPlan &&
      planChangeEffectiveAt &&
      new Date(planChangeEffectiveAt) <= now
    ) {
      return {
        ...base,
        status: "active",
        effectivePlan: pendingPlan,
        pendingPlan,
        planChangeEffectiveAt,
        transitionDue: true,
      };
    }
    return {
      ...base,
      status: "active",
      effectivePlan: plan,
      pendingPlan,
      planChangeEffectiveAt,
    };
  }

  if (status === "expired") return { ...base, status: "expired" };

  return base;
}

/** The limits that actually apply to this profile right now. */
export function getPlanLimitsForProfile(
  profile: Record<string, unknown> | null | undefined,
  now = new Date()
): PlanLimits {
  const state = getSubscriptionState(profile, now);
  return state.effectivePlan ? PLAN_LIMITS[state.effectivePlan] : NO_PLAN_LIMITS;
}

/**
 * Persist any transition that has become due (trial/grace expiry, scheduled
 * downgrade). Called lazily from hot paths (presence beacon, scoring) so the
 * DB converges without needing its own cron. Safe pre-migration: update
 * failures are swallowed.
 */
export async function resolvePlanTransitions(
  supabase: SupabaseClientLike,
  profile: Record<string, unknown>,
  now = new Date()
): Promise<void> {
  const state = getSubscriptionState(profile, now);
  if (!state.transitionDue) return;

  try {
    if (state.status === "expired") {
      await supabase
        .from("profiles")
        .update({
          subscription_status: "expired",
          updated_at: now.toISOString(),
        })
        .eq("id", profile.id);
      return;
    }
    // Due downgrade: flip the plan, clear the schedule.
    if (state.status === "active" && state.pendingPlan) {
      await supabase
        .from("profiles")
        .update({
          subscription_plan: state.pendingPlan,
          pending_plan: null,
          plan_change_effective_at: null,
          updated_at: now.toISOString(),
        })
        .eq("id", profile.id);
    }
  } catch {
    // Lazy persistence; the state computation is authoritative either way.
  }
}

export async function startTrial(
  supabase: SupabaseClientLike,
  userId: string,
  plan: SubscriptionPlan,
  now = new Date()
): Promise<{ ok: boolean; error?: string; trialEndsAt?: string }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return { ok: false, error: "Profile not found." };

  // One trial per account, ever.
  if (profile.trial_started_at) {
    return { ok: false, error: "This account has already used its free trial." };
  }
  const state = getSubscriptionState(profile, now);
  if (state.status === "active" || state.status === "grace") {
    return { ok: false, error: "This account already has a subscription." };
  }

  const trialEndsAt = new Date(
    now.getTime() + TRIAL_DAYS * 86400000
  ).toISOString();

  const { error } = await supabase
    .from("profiles")
    .update({
      subscription_status: "trialing",
      subscription_plan: plan,
      trial_plan: plan,
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEndsAt,
      updated_at: now.toISOString(),
    })
    .eq("id", userId);

  if (error) {
    return {
      ok: false,
      error: /column|schema/i.test(error.message)
        ? "Trials activate once the pending database migration is applied."
        : "Could not start the trial.",
    };
  }
  return { ok: true, trialEndsAt };
}

/** Future Stripe webhook target: a failed charge opens the grace window. */
export async function recordPaymentFailure(
  supabase: SupabaseClientLike,
  userId: string,
  now = new Date()
) {
  const graceEndsAt = new Date(now.getTime() + GRACE_DAYS * 86400000).toISOString();
  await supabase
    .from("profiles")
    .update({
      subscription_status: "grace",
      grace_ends_at: graceEndsAt,
      updated_at: now.toISOString(),
    })
    .eq("id", userId);
  return { graceEndsAt };
}

/** Downgrades keep the higher tier until the current month ends. */
export async function requestPlanChange(
  supabase: SupabaseClientLike,
  userId: string,
  targetPlan: SubscriptionPlan,
  now = new Date()
): Promise<{ ok: boolean; effectiveAt?: string; immediate?: boolean; error?: string }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return { ok: false, error: "Profile not found." };

  const state = getSubscriptionState(profile, now);
  const currentPrice = state.effectivePlan
    ? PLAN_LIMITS[state.effectivePlan].price
    : 0;
  const targetPrice = PLAN_LIMITS[targetPlan].price;

  // Upgrades apply immediately (more value now); downgrades at month end.
  if (targetPrice >= currentPrice) {
    const { error } = await supabase
      .from("profiles")
      .update({
        subscription_plan: targetPlan,
        pending_plan: null,
        plan_change_effective_at: null,
        updated_at: now.toISOString(),
      })
      .eq("id", userId);
    return error ? { ok: false, error: "Could not change plan." } : { ok: true, immediate: true };
  }

  const effectiveAt = firstOfNextMonthUtc(now);
  const { error } = await supabase
    .from("profiles")
    .update({
      pending_plan: targetPlan,
      plan_change_effective_at: effectiveAt,
      updated_at: now.toISOString(),
    })
    .eq("id", userId);
  return error
    ? { ok: false, error: "Could not schedule the downgrade." }
    : { ok: true, effectiveAt, immediate: false };
}

export { getPlanLimits };
