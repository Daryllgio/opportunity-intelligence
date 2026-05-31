import { createClient } from "@supabase/supabase-js";
import { rankApplicationDestination } from "../src/lib/discovery/application-destination-ranker";

type DraftRow = {
  id: string;
  title: string | null;
  provider: string | null;
  type: string | null;
  deadline: string | null;
  source_url: string | null;
  application_url: string | null;
  application_destination_url: string | null;
  destination_confidence: string | null;
  review_flags: string[] | null;
  source_quality_reasons: string[] | null;
};

const DRY_RUN = process.env.DRY_RUN !== "false";
const LIMIT = Number(process.env.LIMIT || 5);
const DESTINATION_TIMEOUT_MS = Number(process.env.DESTINATION_TIMEOUT_MS || 45000);

function createServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, key);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => value.trim())
    )
  );
}

function mergeFlags(existing: string[] | null, additions: string[]) {
  return uniqueStrings([...(existing || []), ...additions]);
}

function mergeReasons(existing: string[] | null, additions: string[]) {
  return uniqueStrings([...(existing || []), ...additions]);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function main() {
  const supabase = createServiceSupabase();

  const { data: drafts, error } = await supabase
    .from("opportunity_drafts")
    .select(
      [
        "id",
        "title",
        "provider",
        "type",
        "deadline",
        "source_url",
        "application_url",
        "application_destination_url",
        "destination_confidence",
        "review_flags",
        "source_quality_reasons",
      ].join(", ")
    )
    .or("application_destination_url.is.null,destination_confidence.is.null,destination_confidence.eq.none")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  const rows = ((drafts || []) as unknown) as DraftRow[];

  console.log("\n=== Draft Destination Enrichment ===");
  console.log(`Dry run: ${DRY_RUN ? "yes" : "no"}`);
  console.log(`Drafts checked: ${rows.length}`);
  console.log(`Limit: ${LIMIT}`);
  console.log(`Per-draft timeout: ${DESTINATION_TIMEOUT_MS}ms\n`);

  let updated = 0;
  let skipped = 0;
  let found = 0;
  let notFound = 0;
  let failed = 0;

  const samples: Array<Record<string, unknown>> = [];

  for (const [index, draft] of rows.entries()) {
    const sourceUrl = draft.source_url || draft.application_url;

    console.log(
      `[${index + 1}/${rows.length}] Ranking destination for: ${draft.title || "(untitled)"}`
    );

    if (!draft.title || !draft.provider || !sourceUrl) {
      skipped += 1;

      samples.push({
        action: "skip",
        title: draft.title,
        provider: draft.provider,
        reason: "Missing title, provider, or source/application URL.",
      });

      continue;
    }

    try {
      const result = await withTimeout(
        rankApplicationDestination({
          title: draft.title,
          provider: draft.provider,
          type: draft.type,
          sourceUrl,
          deadline: draft.deadline,
        }),
        DESTINATION_TIMEOUT_MS,
        `Destination ranking for draft ${draft.id}`
      );

      const hasDestination =
        Boolean(result.applicationDestinationUrl) &&
        result.destinationConfidence !== "none";

      if (hasDestination) {
        found += 1;
      } else {
        notFound += 1;
      }

      const newFlags = hasDestination
        ? mergeFlags(draft.review_flags, [])
        : mergeFlags(draft.review_flags, ["missing_application_url"]);

      const payload = {
        official_source_url: result.officialSourceUrl,
        official_source_verified:
          result.officialSourceStatus === "verified_destination",
        application_destination_url: result.applicationDestinationUrl,
        application_destination_type: result.applicationDestinationType,
        official_source_status: result.officialSourceStatus,
        destination_confidence: result.destinationConfidence,
        destination_reasons: result.destinationReasons,
        application_document_url: result.applicationDocumentUrl,
        application_document_type: result.applicationDocumentType,
        application_note: hasDestination
          ? `Applicant destination selected with ${result.destinationConfidence} confidence. Review before publishing.`
          : "No strong applicant-facing destination was found. Review manually.",
        review_flags: newFlags,
        source_quality_reasons: mergeReasons(
          draft.source_quality_reasons,
          result.destinationReasons
        ),
        updated_at: new Date().toISOString(),
      };

      samples.push({
        action: DRY_RUN ? "would_update" : "updated",
        title: draft.title,
        provider: draft.provider,
        sourceUrl,
        destination: result.applicationDestinationUrl,
        destinationType: result.applicationDestinationType,
        confidence: result.destinationConfidence,
        officialStatus: result.officialSourceStatus,
        reasons: result.destinationReasons.slice(0, 3),
      });

      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from("opportunity_drafts")
          .update(payload)
          .eq("id", draft.id);

        if (updateError) {
          failed += 1;
          samples.push({
            action: "update_failed",
            title: draft.title,
            error: updateError.message,
          });
          continue;
        }

        updated += 1;
      }
    } catch (error) {
      failed += 1;

      samples.push({
        action: "failed",
        title: draft.title,
        provider: draft.provider,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  console.log("=== Results ===");
  console.table({
    checked: rows.length,
    found_destination: found,
    not_found: notFound,
    skipped,
    failed,
    updated: DRY_RUN ? 0 : updated,
  });

  console.log("\n=== Sample Results ===");
  console.table(samples.slice(0, 15));

  if (DRY_RUN) {
    console.log("\nDry run only. No database rows were updated.");
    console.log(
      "To apply changes, run: DRY_RUN=false npx tsx --env-file=.env.local scripts/enrich-draft-destinations.ts"
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
