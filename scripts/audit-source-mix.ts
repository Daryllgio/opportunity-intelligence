import { createClient } from "@supabase/supabase-js";
import { assessSourceQuality, getDomain } from "../src/lib/discovery/source-quality";

type Row = Record<string, any>;

type ClassifiedDiscoveredRow = Row & {
  domain: string;
  category: string;
  trust: string;
  isAggregator: boolean;
  isOfficialLeaning: boolean;
};

type ClassifiedOpportunityRow = Row & {
  computed: {
    domain: string;
    category: string;
    trust: string;
    isAggregator: boolean;
    isOfficialLeaning: boolean;
  };
  destination_status: string;
};

function createServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function countBy<T extends string | number | null | undefined>(
  rows: Row[],
  getter: (row: Row) => T
) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const key = String(getter(row) || "unknown");
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function percent(part: number, total: number) {
  if (!total) return "0.0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function printSection(title: string) {
  console.log("");
  console.log(`=== ${title} ===`);
}

function printCounts(rows: { key: string; count: number }[], limit = 20) {
  if (!rows.length) {
    console.log("No rows.");
    return;
  }

  for (const row of rows.slice(0, limit)) {
    console.log(`${row.key}: ${row.count}`);
  }
}

function classifyUrl(row: Row) {
  const url = String(row.source_url || row.url || row.normalized_url || row.application_url || "");
  const sourceQuality = assessSourceQuality(url);

  return {
    domain: getDomain(url) || "unknown",
    category: sourceQuality.category,
    trust: sourceQuality.trust,
    isAggregator: sourceQuality.isAggregator,
    isOfficialLeaning: sourceQuality.isOfficialLeaning,
  };
}

function destinationStatus(row: Row) {
  if (row.application_document_url) return "application_document_found";
  if (row.application_destination_type === "login_gated_portal") return "login_portal_found";
  if (row.application_destination_type === "third_party_portal") return "third_party_portal_found";
  if (row.application_destination_url) return "application_destination_found";
  if (row.official_source_url) return "official_source_only";
  return "missing_destination";
}

function hasFlag(row: Row, flag: string) {
  return Array.isArray(row.review_flags) && row.review_flags.includes(flag);
}

async function fetchAll(
  supabase: ReturnType<typeof createServiceSupabase>,
  table: string,
  select: string,
  limit = 5000
) {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  return (data || []) as Row[];
}

async function main() {
  const supabase = createServiceSupabase();

  const discoveredPages = await fetchAll(
    supabase,
    "discovered_pages",
    "id,title,url,normalized_url,source_domain,opportunity_type,discovery_status,quality_score,updated_at"
  );

  const drafts = await fetchAll(
    supabase,
    "opportunity_drafts",
    [
      "id",
      "title",
      "provider",
      "type",
      "source_url",
      "application_url",
      "source_category",
      "source_trust",
      "application_url_quality",
      "review_flags",
      "validation_decision",
      "duplicate_risk",
      "official_source_url",
      "official_source_verified",
      "application_destination_url",
      "application_destination_type",
      "official_source_status",
      "destination_confidence",
      "application_document_url",
      "application_document_type",
      "extraction_status",
      "updated_at",
    ].join(",")
  );

  const opportunities = await fetchAll(
    supabase,
    "opportunities",
    [
      "id",
      "title",
      "provider",
      "type",
      "source_url",
      "application_url",
      "source_category",
      "source_trust",
      "application_url_quality",
      "review_flags",
      "validation_decision",
      "duplicate_risk",
      "official_source_url",
      "official_source_verified",
      "application_destination_url",
      "application_destination_type",
      "official_source_status",
      "destination_confidence",
      "application_document_url",
      "application_document_type",
      "is_active",
      "is_approved",
      "updated_at",
    ].join(",")
  );

  const discoveredClassified: ClassifiedDiscoveredRow[] = discoveredPages.map((row: Row) => {
    const sourceInfo = classifyUrl(row);

    return {
      ...row,
      ...sourceInfo,
    };
  });

  const draftClassified: ClassifiedOpportunityRow[] = drafts.map((row: Row) => {
    return {
      ...row,
      computed: classifyUrl(row),
      destination_status: destinationStatus(row),
    };
  });

  const opportunityClassified: ClassifiedOpportunityRow[] = opportunities.map((row: Row) => {
    return {
      ...row,
      computed: classifyUrl(row),
      destination_status: destinationStatus(row),
    };
  });

  printSection("Summary");
  console.log(`Discovered pages checked: ${discoveredPages.length}`);
  console.log(`Opportunity drafts checked: ${drafts.length}`);
  console.log(`Published opportunities checked: ${opportunities.length}`);

  printSection("Discovered Pages by Status");
  printCounts(countBy(discoveredPages, (row) => row.discovery_status));

  printSection("Discovered Candidate Pages by Source Category");
  const candidatePages = discoveredClassified.filter(
    (row) => row.discovery_status === "candidate"
  );
  printCounts(countBy(candidatePages, (row) => row.category));

  const candidateAggregators = candidatePages.filter((row) => row.isAggregator).length;
  const candidateOfficial = candidatePages.filter((row) => row.isOfficialLeaning).length;

  console.log("");
  console.log(`Candidate aggregator share: ${candidateAggregators}/${candidatePages.length} (${percent(candidateAggregators, candidatePages.length)})`);
  console.log(`Candidate official-leaning share: ${candidateOfficial}/${candidatePages.length} (${percent(candidateOfficial, candidatePages.length)})`);

  printSection("Top Discovered Candidate Domains");
  printCounts(countBy(candidatePages, (row) => row.domain), 25);

  printSection("Discovered Candidate Opportunity Types");
  printCounts(countBy(candidatePages, (row) => row.opportunity_type));

  printSection("Drafts by Source Category");
  printCounts(countBy(draftClassified, (row) => row.source_category || row.computed.category));

  const draftAggregators = draftClassified.filter(
    (row) => row.source_category === "aggregator" || row.computed.isAggregator
  ).length;
  const draftOfficial = draftClassified.filter(
    (row) =>
      row.computed.isOfficialLeaning ||
      ["government", "university", "official_provider", "foundation_or_nonprofit", "application_portal"].includes(
        String(row.source_category || "")
      )
  ).length;

  console.log("");
  console.log(`Draft aggregator share: ${draftAggregators}/${draftClassified.length} (${percent(draftAggregators, draftClassified.length)})`);
  console.log(`Draft official/high-trust share: ${draftOfficial}/${draftClassified.length} (${percent(draftOfficial, draftClassified.length)})`);

  printSection("Draft Opportunity Types");
  printCounts(countBy(draftClassified, (row) => row.type));

  printSection("Draft Validation Decisions");
  printCounts(countBy(draftClassified, (row) => row.validation_decision || row.extraction_status));

  printSection("Draft Destination Quality");
  printCounts(countBy(draftClassified, (row) => row.destination_status));

  printSection("Draft Application Destination Types");
  printCounts(countBy(draftClassified, (row) => row.application_destination_type));

  printSection("Draft Destination Confidence");
  printCounts(countBy(draftClassified, (row) => row.destination_confidence));

  printSection("Draft Review Flags");
  const allFlags = draftClassified.flatMap((row) =>
    Array.isArray(row.review_flags) ? row.review_flags : []
  );
  printCounts(countBy(allFlags.map((flag) => ({ flag })), (row) => row.flag));

  printSection("Top Draft Source Domains");
  printCounts(countBy(draftClassified, (row) => row.computed.domain), 25);

  printSection("Published Opportunities by Source Category");
  printCounts(
    countBy(opportunityClassified, (row) => row.source_category || row.computed.category)
  );

  printSection("Published Opportunity Types");
  printCounts(countBy(opportunityClassified, (row) => row.type));

  printSection("Published Destination Quality");
  printCounts(countBy(opportunityClassified, (row) => row.destination_status));

  printSection("Top Problem Queues");
  const missingProvider = draftClassified.filter((row) => !row.provider).length;
  const missingDestination = draftClassified.filter(
    (row) => row.destination_status === "missing_destination"
  ).length;
  const unknownSource = draftClassified.filter(
    (row) => String(row.source_category || row.computed.category) === "unknown"
  ).length;
  const needsOfficialSource = draftClassified.filter((row) =>
    hasFlag(row, "needs_official_source")
  ).length;
  const lowConfidenceDeadline = draftClassified.filter((row) =>
    hasFlag(row, "low_confidence_deadline")
  ).length;

  console.log(`Missing provider drafts: ${missingProvider}`);
  console.log(`Missing destination drafts: ${missingDestination}`);
  console.log(`Unknown source category drafts: ${unknownSource}`);
  console.log(`Needs official source drafts: ${needsOfficialSource}`);
  console.log(`Low-confidence deadline drafts: ${lowConfidenceDeadline}`);

  printSection("Recommended Next Checks");
  if (candidateAggregators / Math.max(candidatePages.length, 1) > 0.25) {
    console.log("- Candidate pool is still aggregator-heavy. Tighten source discovery/candidate caps.");
  }
  if (draftAggregators / Math.max(draftClassified.length, 1) > 0.25) {
    console.log("- Draft queue is still aggregator-heavy. Review source mix controls and campaign sources.");
  }
  if (missingDestination > draftClassified.length * 0.4) {
    console.log("- Many drafts lack destination URLs. Improve destination ranking or run enrichment on old drafts.");
  }
  if (unknownSource > draftClassified.length * 0.2) {
    console.log("- Too many unknown source categories. Improve source-quality classification.");
  }
  if (!candidatePages.some((row) => row.opportunity_type === "pipeline_program")) {
    console.log("- Pipeline programs are missing from candidate pool. Add/adjust discovery campaigns.");
  }
  if (!candidatePages.some((row) => row.opportunity_type === "career_development_program")) {
    console.log("- Career-development programs are missing from candidate pool. Add/adjust discovery campaigns.");
  }
}

main().catch((error) => {
  console.error("Audit failed:", error);
  process.exit(1);
});
