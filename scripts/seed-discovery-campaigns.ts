import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { DISCOVERY_CAMPAIGN_SEEDS } from "../src/lib/discovery/campaign-seeds";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const DRY_RUN = process.env.DRY_RUN !== "false";

  if (DRY_RUN) {
    console.log(
      "DRY_RUN is on (default). No writes will be made. Set DRY_RUN=false to apply."
    );
  }

  const now = new Date().toISOString();
  const seededRows: Record<string, unknown>[] = [];
  const activeSeedQueries = new Set(
    DISCOVERY_CAMPAIGN_SEEDS.map((seed) => seed.query)
  );

  console.log(`Preparing to seed ${DISCOVERY_CAMPAIGN_SEEDS.length} discovery campaigns...`);

  for (let index = 0; index < DISCOVERY_CAMPAIGN_SEEDS.length; index++) {
    const seed = DISCOVERY_CAMPAIGN_SEEDS[index];

    if (index === 0 || (index + 1) % 25 === 0 || index + 1 === DISCOVERY_CAMPAIGN_SEEDS.length) {
      console.log(`Seeding campaign ${index + 1}/${DISCOVERY_CAMPAIGN_SEEDS.length}: ${seed.opportunity_type} | ${seed.education_level} | ${seed.region}`);
    }

    const payload = {
      query: seed.query,
      opportunity_type: seed.opportunity_type,
      education_level: seed.education_level,
      field_area: seed.field_area,
      region: seed.region,
      max_results: seed.max_results,
      status: seed.status,
      next_run_at: addDays(new Date(), index % 7).toISOString(),
      updated_at: now,
    };

    const { data: existing, error: lookupError } = await supabase
      .from("discovery_campaigns")
      .select("id")
      .eq("query", seed.query)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }

    if (DRY_RUN) {
      seededRows.push({ ...payload, _dryRun: true });
      continue;
    }

    if (existing?.id) {
      const { data, error } = await supabase
        .from("discovery_campaigns")
        .update(payload)
        .eq("id", existing.id)
        .select("id, query, opportunity_type, education_level, field_area, region, status, max_results, next_run_at")
        .single();

      if (error) throw error;
      seededRows.push(data);
    } else {
      const { data, error } = await supabase
        .from("discovery_campaigns")
        .insert({
          ...payload,
          run_count: 0,
          results_found: 0,
          pages_added: 0,
          last_error: null,
          created_at: now,
        })
        .select("id, query, opportunity_type, education_level, field_area, region, status, max_results, next_run_at")
        .single();

      if (error) throw error;
      seededRows.push(data);
    }
  }

  const { data: activeCampaigns, error: activeCampaignsError } = await supabase
    .from("discovery_campaigns")
    .select("id, query, status")
    .eq("status", "active");

  if (activeCampaignsError) {
    throw activeCampaignsError;
  }

  const staleCampaignIds = (activeCampaigns || [])
    .filter((campaign) => !activeSeedQueries.has(String(campaign.query || "")))
    .map((campaign) => campaign.id);

  if (!DRY_RUN && staleCampaignIds.length > 0) {
    const batchSize = 50;

    for (let index = 0; index < staleCampaignIds.length; index += batchSize) {
      const batch = staleCampaignIds.slice(index, index + batchSize);

      const { error: deactivateError } = await supabase
        .from("discovery_campaigns")
        .update({
          status: "inactive",
          updated_at: now,
        })
        .in("id", batch);

      if (deactivateError) {
        console.error("Failed to deactivate stale campaign batch:", {
          index,
          batchSize: batch.length,
          message: deactivateError.message,
          details: deactivateError.details,
          hint: deactivateError.hint,
          code: deactivateError.code,
        });

        throw deactivateError;
      }

      console.log(
        `Deactivated stale campaign batch ${Math.min(index + batch.length, staleCampaignIds.length)}/${staleCampaignIds.length}`
      );
    }
  }

  console.log(`\nDeactivated stale campaigns: ${staleCampaignIds.length}`);

  const counts = new Map<string, number>();

  for (const row of seededRows) {
    const key = String(row.opportunity_type || "unknown");
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  console.log("\nSeeded discovery campaigns:");
  console.table(Object.fromEntries(counts));

  console.log("\nRows:");
  console.table(seededRows);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
