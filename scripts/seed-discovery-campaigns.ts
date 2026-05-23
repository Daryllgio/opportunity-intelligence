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

  const now = new Date().toISOString();
  const seededRows: Record<string, unknown>[] = [];

  for (let index = 0; index < DISCOVERY_CAMPAIGN_SEEDS.length; index++) {
    const seed = DISCOVERY_CAMPAIGN_SEEDS[index];

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
