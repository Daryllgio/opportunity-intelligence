/**
 * Operational integrity: the platform notices its own drift.
 *
 * - Suspicious accounts (possible sharing) get flagged, never blocked.
 * - Exhausted campaigns decelerate instead of burning search quota nightly.
 * - Junk campaigns (whatever they add gets rejected) retire.
 * - Coverage gaps between what USERS need and what the CATALOG has become
 *   new targeted campaigns automatically.
 * - Peak application season runs discovery harder.
 */

type SupabaseClientLike = {
  from: (table: string) => any;
};

// ---------------------------------------------------------------------------
// Suspicious activity: repetitive profile swapping smells like account
// sharing (several people using one subscription with their own profiles).
// Every scoring-relevant profile change creates a profile_refresh job (hash
// -diffed, debounced), so job frequency is an honest, cheap proxy.
// ---------------------------------------------------------------------------

const SWAP_WINDOW_DAYS = 7;
const SWAP_THRESHOLD = 8;

export async function flagSuspiciousProfiles(supabase: SupabaseClientLike) {
  const summary = { checked: 0, flagged: 0, errors: [] as string[] };
  const windowStart = new Date(
    Date.now() - SWAP_WINDOW_DAYS * 86400000
  ).toISOString();

  const { data: jobs, error } = await supabase
    .from("user_scoring_jobs")
    .select("user_id")
    .eq("job_type", "profile_refresh")
    .gte("created_at", windowStart);

  if (error) {
    summary.errors.push(error.message);
    return summary;
  }

  const countByUser = new Map<string, number>();
  for (const job of jobs || []) {
    countByUser.set(job.user_id, (countByUser.get(job.user_id) || 0) + 1);
  }

  for (const [userId, count] of countByUser) {
    summary.checked++;
    if (count < SWAP_THRESHOLD) continue;
    // Flag, don't block — and don't re-stamp existing flags.
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, integrity_flag")
      .eq("id", userId)
      .maybeSingle();
    if (!profile || profile.integrity_flag) continue;
    await supabase
      .from("profiles")
      .update({
        integrity_flag: `possible_account_sharing: ${count} scoring-relevant profile changes in ${SWAP_WINDOW_DAYS} days`,
        integrity_flagged_at: new Date().toISOString(),
      })
      .eq("id", userId);
    summary.flagged++;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Campaign health.
// ---------------------------------------------------------------------------

const EXHAUSTED_RUN_COUNT = 3; // consecutive zero-yield runs
const EXHAUSTED_BACKOFF_DAYS = 21;
const JUNK_MIN_PAGES = 5;
const JUNK_REJECT_RATE = 0.95;

/**
 * Campaigns whose recent runs add nothing aren't junk — the catalog already
 * has their results. Retiring them would lose future coverage, so they
 * decelerate instead: three zero-yield runs push the next run out 3 weeks.
 */
export async function decelerateExhaustedCampaigns(supabase: SupabaseClientLike) {
  const summary = { decelerated: 0, errors: [] as string[] };

  const { data: logs, error } = await supabase
    .from("discovery_run_logs")
    .select("campaign_id, pages_added, created_at")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    summary.errors.push(error.message);
    return summary;
  }

  const recentByCampaign = new Map<string, number[]>();
  for (const log of logs || []) {
    if (!log.campaign_id) continue;
    const list = recentByCampaign.get(log.campaign_id) || [];
    if (list.length < EXHAUSTED_RUN_COUNT) list.push(Number(log.pages_added || 0));
    recentByCampaign.set(log.campaign_id, list);
  }

  const backoffUntil = new Date(
    Date.now() + EXHAUSTED_BACKOFF_DAYS * 86400000
  ).toISOString();

  for (const [campaignId, yields] of recentByCampaign) {
    if (yields.length < EXHAUSTED_RUN_COUNT) continue;
    if (yields.some((added) => added > 0)) continue;

    const { data: campaign } = await supabase
      .from("discovery_campaigns")
      .select("id, next_run_at, status")
      .eq("id", campaignId)
      .maybeSingle();
    if (!campaign || campaign.status !== "active") continue;
    // Already backed off past the horizon? Leave it.
    if (
      campaign.next_run_at &&
      new Date(campaign.next_run_at) > new Date(Date.now() + 14 * 86400000)
    ) {
      continue;
    }
    await supabase
      .from("discovery_campaigns")
      .update({ next_run_at: backoffUntil, updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    summary.decelerated++;
  }

  return summary;
}

/**
 * True decay: a campaign that still ADDS pages but everything it adds gets
 * rejected downstream is feeding the pipeline junk — retire it.
 */
export async function retireJunkCampaigns(supabase: SupabaseClientLike) {
  const summary = { examined: 0, retired: 0, errors: [] as string[] };

  const { data: campaigns, error } = await supabase
    .from("discovery_campaigns")
    .select("id, query, status")
    .eq("status", "active")
    .limit(1000);

  if (error) {
    summary.errors.push(error.message);
    return summary;
  }

  for (const campaign of campaigns || []) {
    if (!campaign.query) continue;
    const { data: pages } = await supabase
      .from("discovered_pages")
      .select("discovery_status")
      .eq("discovery_query", campaign.query)
      .limit(200);
    const total = (pages || []).length;
    if (total < JUNK_MIN_PAGES) continue;
    summary.examined++;
    const rejected = (pages || []).filter(
      (page: { discovery_status: string | null }) =>
        page.discovery_status === "rejected"
    ).length;
    if (rejected / total >= JUNK_REJECT_RATE) {
      // 'inactive' is the table's retire vocabulary; the reason lives in
      // last_error so it is auditable and reversible.
      const { data: updated, error: updateError } = await supabase
        .from("discovery_campaigns")
        .update({
          status: "inactive",
          last_error: `retired_as_junk: ${rejected}/${total} discovered pages rejected`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaign.id)
        .select("id");
      if (!updateError && updated && updated.length > 0) summary.retired++;
      else if (updateError) summary.errors.push(updateError.message);
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Blind spots: what users need that the catalog doesn't have.
// ---------------------------------------------------------------------------

export async function generateGapCampaigns(supabase: SupabaseClientLike) {
  const summary = { gapsFound: 0, campaignsCreated: 0, errors: [] as string[] };

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("country_of_study, field_of_study, education_level, target_opportunity_types")
    .not("field_of_study", "is", null);

  if (error) {
    summary.errors.push(error.message);
    return summary;
  }

  // User-demand segments: country x field x level x wanted type.
  const demand = new Map<string, { count: number; parts: string[] }>();
  for (const profile of profiles || []) {
    const country = String(profile.country_of_study || "").trim();
    const field = String(profile.field_of_study || "").trim();
    const level = String(profile.education_level || "").trim();
    if (!country || !field || field.startsWith("Undeclared")) continue;
    for (const type of profile.target_opportunity_types || []) {
      const key = [country, field, level, type].join("|");
      const entry = demand.get(key) || { count: 0, parts: [country, field, level, type] };
      entry.count++;
      demand.set(key, entry);
    }
  }

  for (const { count, parts } of demand.values()) {
    if (count < 1) continue;
    const [country, field, level, type] = parts;

    // How much matching supply exists?
    const { count: supply } = await supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("type", type)
      .or(`country.ilike.%${country}%,country.ilike.%global%,eligible_countries.cs.{${country}}`);

    if ((supply ?? 0) >= 5) continue;
    summary.gapsFound++;

    const typeLabel = String(type).replace(/_/g, " ");
    const query = `${field} ${typeLabel} ${level ? level + " " : ""}students ${country}`.replace(/\s+/g, " ").trim();

    const { data: existing } = await supabase
      .from("discovery_campaigns")
      .select("id")
      .eq("query", query)
      .maybeSingle();
    if (existing?.id) continue;

    const { error: insertError } = await supabase.from("discovery_campaigns").insert({
      query,
      opportunity_type: type,
      region: country.toLowerCase().includes("canada") ? "canada" : "united_states",
      status: "active",
      max_results: 10,
    });
    if (!insertError) summary.campaignsCreated++;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Peak season: the application calendar isn't flat. Fall (scholarship season
// opens) and Jan-Mar (spring deadlines + summer program cycles) are when new
// postings appear fastest — discovery runs 4x harder there.
// ---------------------------------------------------------------------------

export function isPeakSeason(now = new Date()): boolean {
  const month = now.getUTCMonth() + 1; // 1-12
  return (month >= 8 && month <= 11) || (month >= 1 && month <= 3);
}
