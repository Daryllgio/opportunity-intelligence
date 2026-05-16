import { createHash } from "crypto";

export type OpportunityLifecycleStatus = "draft" | "active" | "expired" | "archived";

export type OpportunityCheckReason =
  | "new_opportunity"
  | "pre_deadline_verification"
  | "renewal_window"
  | "rolling_recheck"
  | "manual_recheck"
  | "no_recurring_check_needed";

export type OpportunityRecord = Record<string, unknown>;

function normalizeString(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/www\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: unknown) {
  return normalizeString(value).replace(/\s+/g, "-");
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize).sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b))
    );
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableNormalize(record[key]);
        return acc;
      }, {});
  }

  if (typeof value === "string") {
    return value.replace(/\s+/g, " ").trim();
  }

  return value ?? null;
}

function hashObject(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableNormalize(value)))
    .digest("hex");
}

function parseDate(value: unknown) {
  if (!value) return null;

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function getDomain(value: unknown) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return normalizeString(raw).split("/")[0] || "";
  }
}

export function buildOpportunityCanonicalKey(opportunity: OpportunityRecord) {
  const title = slugify(opportunity.title);
  const provider = slugify(opportunity.provider);
  const applicationDomain = getDomain(opportunity.application_url);
  const sourceDomain = getDomain(opportunity.source_url);

  const domain = applicationDomain || sourceDomain;

  return [title, provider, domain].filter(Boolean).join("__");
}

export function buildOpportunityContentFingerprint(opportunity: OpportunityRecord) {
  return {
    title: opportunity.title,
    provider: opportunity.provider,
    type: opportunity.type,
    description: opportunity.description,
    ai_summary: opportunity.ai_summary,
    country: opportunity.country,
    funding_amount: opportunity.funding_amount,
    funding_type: opportunity.funding_type,
    deadline: opportunity.deadline,
    application_url: opportunity.application_url,
  };
}

export function buildOpportunityCriteriaFingerprint(opportunity: OpportunityRecord) {
  return {
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
  };
}

export function buildOpportunityContentHash(opportunity: OpportunityRecord) {
  return hashObject(buildOpportunityContentFingerprint(opportunity));
}

export function buildOpportunityCriteriaHash(opportunity: OpportunityRecord) {
  return hashObject(buildOpportunityCriteriaFingerprint(opportunity));
}

export function inferCycleYear(opportunity: OpportunityRecord) {
  const deadline = parseDate(opportunity.deadline);

  if (deadline) return deadline.getUTCFullYear();

  return new Date().getUTCFullYear();
}

export function inferApplicationCycle(opportunity: OpportunityRecord) {
  const deadline = parseDate(opportunity.deadline);

  if (!deadline) return "Rolling";

  return String(deadline.getUTCFullYear());
}

export function isOpportunityExpired(opportunity: OpportunityRecord, now = new Date()) {
  const deadline = parseDate(opportunity.deadline);

  if (!deadline) return false;

  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  const deadlineDay = new Date(deadline);
  deadlineDay.setUTCHours(0, 0, 0, 0);

  return deadlineDay < today;
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function computeNextLifecycleCheck(opportunity: OpportunityRecord, now = new Date()) {
  const deadline = parseDate(opportunity.deadline);

  if (!deadline) {
    return {
      next_check_at: addDays(now, 75).toISOString(),
      check_reason: "rolling_recheck" as OpportunityCheckReason,
    };
  }

  if (isOpportunityExpired(opportunity, now)) {
    const nextCycleDeadline = new Date(deadline);
    nextCycleDeadline.setUTCFullYear(nextCycleDeadline.getUTCFullYear() + 1);

    const renewalWindowStart = addDays(nextCycleDeadline, -90);

    return {
      next_check_at: renewalWindowStart.toISOString(),
      check_reason: "renewal_window" as OpportunityCheckReason,
    };
  }

  const preDeadlineCheck = addDays(deadline, -14);

  if (preDeadlineCheck > now) {
    return {
      next_check_at: preDeadlineCheck.toISOString(),
      check_reason: "pre_deadline_verification" as OpportunityCheckReason,
    };
  }

  return {
    next_check_at: deadline.toISOString(),
    check_reason: "pre_deadline_verification" as OpportunityCheckReason,
  };
}

export function buildLifecycleFields(opportunity: OpportunityRecord, now = new Date()) {
  const expired = isOpportunityExpired(opportunity, now);
  const nextCheck = computeNextLifecycleCheck(opportunity, now);

  return {
    lifecycle_status: expired ? "expired" : "active",
    is_active: !expired,
    application_cycle: inferApplicationCycle(opportunity),
    cycle_year: inferCycleYear(opportunity),
    canonical_key: buildOpportunityCanonicalKey(opportunity),
    content_hash: buildOpportunityContentHash(opportunity),
    criteria_hash: buildOpportunityCriteriaHash(opportunity),
    expired_at: expired ? now.toISOString() : null,
    last_checked_at: now.toISOString(),
    next_check_at: nextCheck.next_check_at,
    check_reason: nextCheck.check_reason,
  };
}
