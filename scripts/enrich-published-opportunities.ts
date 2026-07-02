/**
 * Backfill source + destination metadata on PUBLISHED opportunities.
 *
 * For every row in `opportunities`:
 * - classify the source (source_category / source_trust)
 * - run the application-destination ranker when no trustworthy destination
 *   is stored yet
 * - if a high/medium-confidence non-aggregator destination is found and the
 *   current application_url points at an aggregator, replace application_url
 *   so users land on the real page
 * - if the opportunity is user-visible but still has an aggregator-only
 *   application_url and no verified destination, flag it needs_official_source
 *   and deactivate it (safety first: users must never land on aggregators)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/enrich-published-opportunities.ts            # dry run
 *   DRY_RUN=false npx tsx --env-file=.env.local scripts/enrich-published-opportunities.ts
 */
import { createClient } from "@supabase/supabase-js";
import { rankApplicationDestination } from "../src/lib/discovery/application-destination-ranker";
import { isAggregatorDomain, isBlockedDestinationUrl } from "../src/lib/discovery/domain-policy";
import { assessSourceQuality } from "../src/lib/discovery/source-quality";

const DRY_RUN = process.env.DRY_RUN !== "false";

type OpportunityRow = {
  id: string;
  title: string | null;
  provider: string | null;
  type: string | null;
  deadline: string | null;
  source_url: string | null;
  application_url: string | null;
  application_destination_url: string | null;
  destination_confidence: string | null;
  source_category: string | null;
  review_flags: string[] | null;
  source_quality_reasons: string[] | null;
  is_active: boolean | null;
  is_approved: boolean | null;
  lifecycle_status: string | null;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((v): v is string => Boolean(v && v.trim())).map((v) => v.trim()))
  );
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("opportunities")
    .select(
      "id, title, provider, type, deadline, source_url, application_url, application_destination_url, destination_confidence, source_category, review_flags, source_quality_reasons, is_active, is_approved, lifecycle_status"
    )
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data || []) as OpportunityRow[];

  console.log(`=== Published opportunity enrichment (dry run: ${DRY_RUN}) ===`);
  console.log(`Opportunities: ${rows.length}\n`);

  let enriched = 0;
  let applicationUrlReplaced = 0;
  let deactivated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const label = `${row.title?.slice(0, 55)}`;
    const primaryUrl = row.source_url || row.application_url;
    const visible =
      Boolean(row.is_active) &&
      Boolean(row.is_approved) &&
      row.lifecycle_status === "active";

    console.log(`\n— ${label}`);
    console.log(`  visible=${visible} source=${primaryUrl?.slice(0, 70)}`);

    // Placeholder/dead rows: classify only, never rank.
    const isPlaceholder = Boolean(primaryUrl?.includes("example.com"));

    const sourceQuality = assessSourceQuality(primaryUrl);
    const payload: Record<string, unknown> = {
      source_category: sourceQuality.category,
      source_trust: sourceQuality.trust,
      source_quality_reasons: uniqueStrings([
        ...(row.source_quality_reasons || []),
        ...sourceQuality.reasons,
      ]),
      updated_at: new Date().toISOString(),
    };

    const alreadyEnriched =
      Boolean(row.application_destination_url) &&
      ["high", "medium"].includes(String(row.destination_confidence));

    let destinationFound = alreadyEnriched;

    if (!isPlaceholder && !alreadyEnriched && row.title && row.provider) {
      try {
        const result = await rankApplicationDestination({
          title: row.title,
          provider: row.provider,
          type: row.type,
          sourceUrl: primaryUrl,
          deadline: row.deadline,
        });

        payload.official_source_url = result.officialSourceUrl;
        payload.official_source_verified =
          result.officialSourceStatus === "verified_destination";
        payload.application_destination_url = result.applicationDestinationUrl;
        payload.application_destination_type = result.applicationDestinationType;
        payload.official_source_status = result.officialSourceStatus;
        payload.destination_confidence = result.destinationConfidence;
        payload.destination_reasons = result.destinationReasons;
        payload.application_document_url = result.applicationDocumentUrl;
        payload.application_document_type = result.applicationDocumentType;

        destinationFound =
          Boolean(result.applicationDestinationUrl) &&
          ["high", "medium"].includes(result.destinationConfidence) &&
          !isBlockedDestinationUrl(result.applicationDestinationUrl);

        console.log(
          `  ranked: confidence=${result.destinationConfidence} type=${result.applicationDestinationType}`
        );
        console.log(`  destination: ${result.applicationDestinationUrl || "none"}`);

        // Replace an aggregator application_url with the verified destination.
        if (destinationFound && isAggregatorDomain(row.application_url)) {
          payload.application_url = result.applicationDestinationUrl;
          applicationUrlReplaced += 1;
          console.log(`  application_url: aggregator → verified destination`);
        }
      } catch (err) {
        failed += 1;
        console.log(
          `  RANKER FAILED: ${err instanceof Error ? err.message : "unknown"}`
        );
      }
    } else if (isPlaceholder) {
      skipped += 1;
      console.log("  placeholder URL — classified only, no ranking");
    } else if (alreadyEnriched) {
      skipped += 1;
      console.log("  already enriched — classification refreshed only");
    } else {
      skipped += 1;
      console.log("  missing title/provider — classification refreshed only");
    }

    // Safety rule: a visible opportunity may not keep an aggregator-only
    // application_url without a verified destination.
    const finalApplicationUrl = String(
      payload.application_url || row.application_url || ""
    );

    if (visible && !destinationFound && isAggregatorDomain(finalApplicationUrl)) {
      payload.is_active = false;
      payload.review_flags = uniqueStrings([
        ...(row.review_flags || []),
        "needs_official_source",
        "aggregator_application",
      ]);
      deactivated += 1;
      console.log(
        "  DEACTIVATED: aggregator application_url with no verified destination"
      );
    }

    enriched += 1;

    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from("opportunities")
        .update(payload)
        .eq("id", row.id);

      if (updateError) {
        failed += 1;
        console.log(`  UPDATE FAILED: ${updateError.message}`);
      }
    }
  }

  console.log("\n=== Summary ===");
  console.table({
    total: rows.length,
    processed: enriched,
    application_url_replaced: applicationUrlReplaced,
    deactivated_for_safety: deactivated,
    skipped_ranking: skipped,
    failures: failed,
    dry_run: DRY_RUN,
  });

  if (DRY_RUN) {
    console.log(
      "Dry run only. Apply with: DRY_RUN=false npx tsx --env-file=.env.local scripts/enrich-published-opportunities.ts"
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
