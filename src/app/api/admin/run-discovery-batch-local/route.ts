import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildEvidenceBundleForDiscoveredPage } from "@/lib/discovery/evidence-bundle";
import { extractDiscoveredOpportunity } from "@/lib/discovery/extract-discovered-opportunity";
import { ingestExtractedOpportunity } from "@/lib/discovery/ingest-extracted-opportunity";
import { capturePageWithHybrid } from "@/lib/discovery/capture/hybrid-capture";
import { detectCandidateOpportunityLinks } from "@/lib/discovery/candidate-detection";
import { upsertDiscoveredPages } from "@/lib/discovery/discovered-pages";
import { buildOpportunityFamilyKey } from "@/lib/discovery/family-key";
import { scorePageUsefulness } from "@/lib/discovery/page-usefulness";
import { classifySourcePage } from "@/lib/discovery/source-classification";
import { shouldRejectDiscoveredPageBeforeExtraction } from "@/lib/discovery/opportunity-scope";
import { shouldRejectUrlBeforeQueue } from "@/lib/discovery/discovery-scope-rules";
import { assessSourceQuality, getDomain } from "@/lib/discovery/source-quality";

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function normalizePageKey(page: Record<string, unknown>) {
  return String(page.normalized_url || page.url || "")
    .replace(/#.*$/, "")
    .replace(/\/$/, "");
}

function shouldProcessStatus(status: unknown) {
  return String(status || "") === "candidate";
}

function isTerminalBundleDecision(decision: unknown) {
  return ["auto_publish", "review", "track_for_next_cycle"].includes(
    String(decision || "")
  );
}

function normalizeUrlKey(value: unknown) {
  return String(value || "")
    .replace(/#.*$/, "")
    .replace(/\/$/, "");
}

function getPageFamilyKey(page: Record<string, any>) {
  return (
    page.opportunity_family_key ||
    buildOpportunityFamilyKey({
      url: page.url || page.normalized_url,
      sourceDomain: page.source_domain,
      opportunityType: page.opportunity_type,
      title: page.title,
      discoveryQuery: page.discovery_query,
    })
  );
}

function scoreLeadPage(page: Record<string, any>) {
  const url = String(page.url || page.normalized_url || "").toLowerCase();
  const title = String(page.title || "").toLowerCase();

  let score = scorePageUsefulness({
    title: page.title,
    url: page.url || page.normalized_url,
    opportunityType: page.opportunity_type,
    existingQualityScore: Number(page.quality_score || 0),
  }).score;

  const combined = `${title} ${url}`;

  if (combined.includes("how-to-apply")) score += 45;
  if (combined.includes("apply") || combined.includes("application")) score += 35;
  if (combined.includes("eligibility")) score += 30;
  if (combined.includes("requirements")) score += 28;
  if (combined.includes("deadline")) score += 25;
  if (combined.includes("how-it-works")) score += 22;
  if (combined.includes("program")) score += 18;
  if (combined.includes("faq") || combined.includes("frequently-asked")) score += 12;
  if (combined.includes("homepage") || url.replace(/https?:\/\//, "").split("/").length <= 2) {
    score += 5;
  }

  const isApplicationPortal =
    url.includes("apply.") ||
    url.includes("/users/") ||
    url.includes("sign_in") ||
    url.includes("password") ||
    url.includes("/closed");

  const hasWeakPortalTitle =
    !title ||
    title.includes("login") ||
    title.includes("sign in") ||
    title.includes("forgot your password") ||
    title.includes("apply.loranscholar.ca");

  if (isApplicationPortal) {
    score -= 90;
  }

  if (isApplicationPortal && hasWeakPortalTitle) {
    score -= 80;
  }

  if (combined.includes("login") || combined.includes("sign_in") || combined.includes("password")) {
    score -= 100;
  }

  if (
    url.includes("zendesk.com") ||
    url.includes("/hc/en-us/articles") ||
    url.includes("/hc/en-us/sections") ||
    url.includes("/related/click") ||
    combined.includes("help center") ||
    combined.includes("support")
  ) {
    score -= 90;
  }

  if (
    url.includes("questbridge.org/apply-to-college/programs/national-college-match") ||
    url.includes("questbridge.org/apply-to-college/programs/college-prep-scholars-program")
  ) {
    score += 70;
  }

  if (
    url.endsWith(".pdf") ||
    url.includes(".pdf?") ||
    combined.includes("application-instructions.pdf")
  ) {
    score -= 120;
  }

  if (
    url.includes("wbdisable=true") ||
    combined.includes("switch to basic html version")
  ) {
    score -= 120;
  }

  if (
    url.includes("canada.ca/en/department-national-defence/services/cadets-junior-canadian-rangers/leadership-of-the-programs") ||
    combined.includes("commander cjcr gp statement on ethics") ||
    combined.includes("command philosophy cadets and junior canadian rangers") ||
    combined.includes("cadets and junior canadian rangers command team")
  ) {
    score -= 160;
  }

  if (combined.includes("privacy") || combined.includes("terms") || combined.includes("donate")) {
    score -= 80;
  }

  return Math.max(0, Math.min(score, 200));
}



function isKnownNonOpportunityPage(page: Record<string, any>) {
  const url = String(page.url || page.normalized_url || "").toLowerCase();
  const title = String(page.title || "").toLowerCase();
  const combined = `${title} ${url}`;

  return (
    url.includes("wbdisable=true") ||
    combined.includes("switch to basic html version") ||
    url.includes("canada.ca/en/department-national-defence/services/cadets-junior-canadian-rangers/leadership-of-the-programs") ||
    combined.includes("commander cjcr gp statement on ethics") ||
    combined.includes("command philosophy cadets and junior canadian rangers") ||
    combined.includes("cadets and junior canadian rangers command team")
  );
}


function shouldSaveExpandedCandidateLink(candidate: Record<string, any>) {
  const url = String(candidate.url || candidate.normalizedUrl || "").toLowerCase();
  const title = String(candidate.title || "").toLowerCase();
  const combined = `${title} ${url}`;

  if (!url) return false;

  const blockedDomains = [
    "apps.apple.com",
    "play.google.com",
    "bbb.org",
    "linkedin.com",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "youtube.com",
    "tiktok.com",
  ];

  if (blockedDomains.some((domain) => url.includes(domain))) {
    return false;
  }

  const blockedUrlSignals = [
    "/student-resources",
    "/scholarship-providers-resources",
    "/list-your-scholarship",
    "/success-stories",
    "/category/internships",
    "/internships",
    "/jobs",
    "/careers",
    "/career-tools",
    "/contact",
    "/about",
    "/privacy",
    "/terms",
    "/donate",
    "/news",
    "/blog",
    "/press",
    "/events",
    "/webinar",
    "/workshop",
    "/alumni",
    "/previous-awards",
    "/winner",
    "/winners",
    "/awardees",
    "/honorees",
    "/student_jobs",
    "/easy.php",
    "/essay.php",
    "/foundations",
    "/scholarship-upload",
  ];

  if (blockedUrlSignals.some((signal) => url.includes(signal))) {
    return false;
  }

  const blockedDocumentSignals = [
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    "box.com/s/",
    "app.box.com/s/",
    "forms.office.com",
    "google.com/forms",
  ];

  if (blockedDocumentSignals.some((signal) => url.includes(signal))) {
    return false;
  }

  const isScholarshipsCom = url.includes("scholarships.com");

  if (isScholarshipsCom) {
    const isScholarshipsComDetailPage =
      /scholarships\.com\/scholarships\/[^/?#]+\/?(?:[?#].*)?$/.test(url);

    return isScholarshipsComDetailPage;
  }

  const allowedSpecificUrlSignals = [
    "/scholarship/",
    "/scholarships/",
    "/fellowship/",
    "/fellowships/",
    "/grant/",
    "/grants/",
    "/award/",
    "/awards/",
    "/program/",
    "/programs/",
    "/research/",
    "/undergraduate-research",
    "/leadership/",
    "/competition/",
    "/competitions/",
  ];

  const allowedTextSignals = [
    "scholarship",
    "fellowship",
    "grant",
    "bursary",
    "award",
    "research program",
    "undergraduate research",
    "leadership program",
    "competition",
  ];

  const hasAllowedUrl = allowedSpecificUrlSignals.some((signal) => url.includes(signal));
  const hasAllowedText = allowedTextSignals.some((signal) => combined.includes(signal));

  return hasAllowedUrl || hasAllowedText;
}



function getOpportunityTypeKey(page: Record<string, any>) {
  return String(page.opportunity_type || "unknown").trim() || "unknown";
}

function getSourceMixInfo(page: Record<string, any>) {
  const url = String(page.url || page.normalized_url || "");
  const sourceQuality = assessSourceQuality(url);
  const domain = getDomain(url) || "unknown";

  return {
    domain,
    sourceCategory: sourceQuality.category,
    sourceTrust: sourceQuality.trust,
    isAggregator: sourceQuality.isAggregator,
    isOfficialLeaning: sourceQuality.isOfficialLeaning,
    sourceReasons: sourceQuality.reasons,
  };
}

function getSourcePreferenceBoost(page: Record<string, any>) {
  const source = getSourceMixInfo(page);

  let boost = 0;

  if (source.isOfficialLeaning) boost += 45;

  if (
    source.sourceCategory === "government" ||
    source.sourceCategory === "university" ||
    source.sourceCategory === "official_provider" ||
    source.sourceCategory === "foundation_or_nonprofit"
  ) {
    boost += 35;
  }

  if (source.sourceCategory === "application_portal") boost += 25;
  if (source.sourceCategory === "trusted_database") boost += 5;

  if (source.sourceCategory === "unknown") boost -= 10;
  if (source.sourceCategory === "low_trust_blog") boost -= 35;
  if (source.isAggregator) boost -= 55;
  if (source.sourceCategory === "blocked") boost -= 200;

  return boost;
}

function getSelectionScore(page: Record<string, any>) {
  return scoreLeadPage(page) + getSourcePreferenceBoost(page);
}

function selectBalancedLeadPages({
  familyGroups,
  maxBundles,
}: {
  familyGroups: Map<string, Record<string, any>[]>;
  maxBundles: number;
}) {
  const rankedFamilies = Array.from(familyGroups.entries())
    .map(([familyKey, pages]) => {
      const sortedPages = [...pages].sort(
        (left, right) => getSelectionScore(right) - getSelectionScore(left)
      );

      const leadPage = sortedPages[0];
      const sourceMix = getSourceMixInfo(leadPage);

      return {
        familyKey,
        page: leadPage,
        leadScore: scoreLeadPage(leadPage),
        selectionScore: getSelectionScore(leadPage),
        candidateCount: pages.length,
        opportunityType: getOpportunityTypeKey(leadPage),
        ...sourceMix,
      };
    })
    .sort((left, right) => right.selectionScore - left.selectionScore);

  const preferredTypeOrder = [
    "scholarship",
    "research_program",
    "fellowship",
    "grant",
    "competition",
    "leadership_program",
    "career_development_program",
    "pipeline_program",
  ];

  const maxPerType: Record<string, number> = {
    scholarship: Math.max(1, Math.ceil(maxBundles * 0.25)),
    research_program: 2,
    fellowship: 2,
    grant: 2,
    competition: 2,
    leadership_program: 2,
    career_development_program: 2,
    pipeline_program: 2,
    unknown: 1,
  };

  const maxAggregators = Math.max(1, Math.floor(maxBundles * 0.2));
  const maxSameDomain = Math.max(1, Math.min(2, Math.ceil(maxBundles * 0.25)));

  const selected: typeof rankedFamilies = [];
  const selectedFamilyKeys = new Set<string>();
  const selectedTypeCounts = new Map<string, number>();
  const selectedDomainCounts = new Map<string, number>();
  let selectedAggregators = 0;

  function canAddCandidate(candidate: (typeof rankedFamilies)[number], strict = true) {
    if (selected.length >= maxBundles) return false;
    if (selectedFamilyKeys.has(candidate.familyKey)) return false;

    const typeCount = selectedTypeCounts.get(candidate.opportunityType) || 0;
    const domainCount = selectedDomainCounts.get(candidate.domain) || 0;

    if (candidate.sourceCategory === "blocked") return false;
    if (strict && candidate.isAggregator && selectedAggregators >= maxAggregators) {
      return false;
    }

    if (strict && domainCount >= maxSameDomain) {
      return false;
    }

    if (strict && typeCount >= (maxPerType[candidate.opportunityType] || 1)) {
      return false;
    }

    return true;
  }

  function addCandidate(candidate: (typeof rankedFamilies)[number], strict = true) {
    if (!canAddCandidate(candidate, strict)) return false;

    selected.push(candidate);
    selectedFamilyKeys.add(candidate.familyKey);
    selectedTypeCounts.set(
      candidate.opportunityType,
      (selectedTypeCounts.get(candidate.opportunityType) || 0) + 1
    );
    selectedDomainCounts.set(
      candidate.domain,
      (selectedDomainCounts.get(candidate.domain) || 0) + 1
    );

    if (candidate.isAggregator) {
      selectedAggregators += 1;
    }

    return true;
  }

  // Pass 1: Pick official-leaning/high-trust sources across opportunity types first.
  for (const opportunityType of preferredTypeOrder) {
    const officialTypeCandidates = rankedFamilies.filter(
      (candidate) =>
        candidate.opportunityType === opportunityType &&
        candidate.isOfficialLeaning &&
        !candidate.isAggregator
    );

    for (const candidate of officialTypeCandidates) {
      if (selected.length >= maxBundles) break;
      addCandidate(candidate, true);
    }
  }

  // Pass 2: Pick non-aggregator standard/unknown candidates while preserving type/domain caps.
  for (const opportunityType of preferredTypeOrder) {
    const nonAggregatorTypeCandidates = rankedFamilies.filter(
      (candidate) =>
        candidate.opportunityType === opportunityType &&
        !candidate.isAggregator
    );

    for (const candidate of nonAggregatorTypeCandidates) {
      if (selected.length >= maxBundles) break;
      addCandidate(candidate, true);
    }
  }

  // Pass 3: Allow limited aggregators as discovery fuel.
  for (const candidate of rankedFamilies) {
    if (selected.length >= maxBundles) break;
    if (!candidate.isAggregator) continue;
    addCandidate(candidate, true);
  }

  // Pass 4: Backfill with relaxed type caps, but keep domain/aggregator caps.
  for (const candidate of rankedFamilies) {
    if (selected.length >= maxBundles) break;
    addCandidate(candidate, false);
  }

  return selected.map((entry) => ({
    ...entry.page,
    selected_family_key: entry.familyKey,
    selected_lead_score: entry.leadScore,
    selected_selection_score: entry.selectionScore,
    selected_family_candidate_count: entry.candidateCount,
    selected_opportunity_type: entry.opportunityType,
    selected_source_domain: entry.domain,
    selected_source_category: entry.sourceCategory,
    selected_is_aggregator: entry.isAggregator,
    selected_is_official_leaning: entry.isOfficialLeaning,
  }));
}


async function expandCandidateLinks({
  supabase,
  page,
}: {
  supabase: any;
  page: Record<string, any>;
}) {
  const url = String(page.url || page.normalized_url || "");

  if (!url) {
    return {
      expanded: false,
      savedCount: 0,
      reason: "missing_url",
    };
  }

  const capture = await capturePageWithHybrid(url);
  const finalResult = capture.finalResult;

  if (!finalResult.ok) {
    return {
      expanded: false,
      savedCount: 0,
      reason: finalResult.error || "capture_failed",
    };
  }

  const candidates = detectCandidateOpportunityLinks(finalResult.links);

  const filteredCandidates = candidates.filter((candidate) => {
    const normalizedUrl = String(candidate.normalizedUrl || "");
    return (
      normalizedUrl !== page.normalized_url &&
      shouldSaveExpandedCandidateLink(candidate)
    );
  });

  const saved = await upsertDiscoveredPages({
    supabase,
    candidates: filteredCandidates.slice(0, 50),
    discoveryQuery: String(page.discovery_query || page.url),
    region: page.region,
    opportunityType: page.opportunity_type,
    educationLevel: page.education_level,
    fieldArea: page.field_area,
  });

  return {
    expanded: true,
    capturedUrl: finalResult.finalUrl,
    captureMethod: capture.captureMethod,
    usedFallback: capture.usedFallback,
    candidatesFound: candidates.length,
    savedCount: saved.upserted,
    saved: saved.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      url: row.url,
      normalized_url: row.normalized_url,
      discovery_status: row.discovery_status,
    })),
  };
}

async function processBundle({
  supabase,
  leadPage,
  sourceTrust,
  maxPagesPerBundle,
}: {
  supabase: any;
  leadPage: Record<string, any>;
  sourceTrust: "trusted" | "standard" | "experimental" | "blocked";
  maxPagesPerBundle: number;
}) {
  const bundle = await buildEvidenceBundleForDiscoveredPage({
    supabase,
    discoveredPageId: leadPage.id,
    maxPages: maxPagesPerBundle,
    stopWhenComplete: true,
  });

  if (bundle.pages.length === 0 || bundle.evidenceText.length < 500) {
    await supabase
      .from("discovered_pages")
      .update({
        discovery_status: "rejected",
        rejection_reason: "Not enough evidence pages for bundled extraction.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadPage.id);

    return {
      leadPageId: leadPage.id,
      decision: "reject",
      reason: "not_enough_evidence",
      pageCount: bundle.pages.length,
    };
  }

  const sourceUrl = String(
    bundle.anchorPage.url || bundle.anchorPage.normalized_url || ""
  );

  const anchorPageText = bundle.pages[0]?.cleanText || bundle.evidenceText;

  const sourceClassification = classifySourcePage({
    url: sourceUrl,
    title: String(bundle.anchorPage.title || ""),
    text: anchorPageText,
  });

  if (!sourceClassification.shouldExtractDirectly) {
    await supabase
      .from("discovered_pages")
      .update({
        discovery_status: sourceClassification.shouldRejectLead
          ? "rejected"
          : "bundled",
        rejection_reason: sourceClassification.shouldRejectLead
          ? sourceClassification.reasons.join("; ")
          : `Source/listing page expanded; child opportunity URLs saved for processing. ${sourceClassification.reasons.join("; ")}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadPage.id);

    return {
      leadPageId: leadPage.id,
      decision: sourceClassification.shouldRejectLead
        ? "reject"
        : "expanded_source_listing",
      reason: sourceClassification.reasons.join("; "),
      sourceClassification,
      pageCount: bundle.pages.length,
      coverage: bundle.coverage,
      pages: bundle.pages.map((page) => ({
        id: page.id,
        title: page.title,
        url: page.url,
        status: page.discovery_status,
        quality_score: page.quality_score,
        textLength: page.textLength,
      })),
    };
  }

  const preExtractionScope = shouldRejectDiscoveredPageBeforeExtraction({
    opportunityType: bundle.anchorPage.opportunity_type,
    title: bundle.anchorPage.title,
    url: sourceUrl,
    text: bundle.evidenceText,
  });

  if (preExtractionScope.reject) {
    await supabase
      .from("discovered_pages")
      .update({
        discovery_status: "rejected",
        rejection_reason: preExtractionScope.reason || "Pre-extraction scope reject.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadPage.id);

    return {
      leadPageId: leadPage.id,
      decision: "reject",
      reason: preExtractionScope.reason || "pre_extraction_scope_reject",
      pageCount: bundle.pages.length,
      coverage: bundle.coverage,
      pages: bundle.pages.map((page) => ({
        id: page.id,
        title: page.title,
        url: page.url,
        status: page.discovery_status,
        quality_score: page.quality_score,
        textLength: page.textLength,
      })),
    };
  }

  const extracted = await extractDiscoveredOpportunity({
    pageText: bundle.evidenceText,
    sourceUrl,
    discoveryContext: {
      region: bundle.anchorPage.region,
      opportunityType: bundle.anchorPage.opportunity_type,
      educationLevel: bundle.anchorPage.education_level,
      fieldArea: bundle.anchorPage.field_area,
    },
  });

  const ingestion = await ingestExtractedOpportunity({
    supabase,
    discoveredPage: bundle.anchorPage,
    extracted: extracted as unknown as Record<string, unknown>,
    opportunityFamilyKey: getPageFamilyKey(leadPage),
    sourceTrust,
  });

  return {
    leadPageId: leadPage.id,
    domain: bundle.domain,
    pageCount: bundle.pages.length,
    coverage: bundle.coverage,
    pages: bundle.pages.map((page) => ({
      id: page.id,
      title: page.title,
      url: page.url,
      status: page.discovery_status,
      quality_score: page.quality_score,
      textLength: page.textLength,
    })),
    extraction: extracted,
    ingestion,
    decision: ingestion.decision,
  };
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Local test route disabled in production." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const requestedMaxBundles = Number(body.maxBundles || 5);
    const maxBundles = Math.max(1, Math.min(requestedMaxBundles, 100));
    const requestedCandidatePoolLimit = Number(
      body.candidatePoolLimit || maxBundles * 30
    );
    const candidatePoolLimit = Math.max(
      maxBundles,
      Math.min(requestedCandidatePoolLimit, 500)
    );
    const maxPagesPerBundle = Math.min(Number(body.maxPagesPerBundle || 10), 10);
    const sourceTrust = String(body.sourceTrust || "standard") as
      | "trusted"
      | "standard"
      | "experimental"
      | "blocked";

    const supabase = createServiceSupabase();

    const { data: candidatePages, error: candidateError } = await supabase
      .from("discovered_pages")
      .select("*")
      .eq("discovery_status", "candidate")
      .order("quality_score", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: true })
      .limit(candidatePoolLimit);

    if (candidateError) {
      return NextResponse.json(
        { error: candidateError.message },
        { status: 500 }
      );
    }

    const candidateFamilyKeys = Array.from(
      new Set(
        (candidatePages || [])
          .filter((page) => shouldProcessStatus(page.discovery_status))
          .map((page) => getPageFamilyKey(page))
          .filter(Boolean)
      )
    );

    const handledFamilyKeys = new Set<string>();

    if (candidateFamilyKeys.length > 0) {
      const { data: handledFamilyRows, error: handledFamilyLookupError } =
        await supabase
          .from("discovered_pages")
          .select("opportunity_family_key")
          .in("opportunity_family_key", candidateFamilyKeys)
          .in("discovery_status", [
            "future_tracking",
            "review",
            "published",
            "bundled",
          ]);

      if (handledFamilyLookupError) {
        return NextResponse.json(
          { error: handledFamilyLookupError.message },
          { status: 500 }
        );
      }

      for (const row of handledFamilyRows || []) {
        if (row.opportunity_family_key) {
          handledFamilyKeys.add(String(row.opportunity_family_key));
        }
      }
    }

    const familyGroups = new Map<string, Record<string, any>[]>();

    for (const page of candidatePages || []) {
      if (!shouldProcessStatus(page.discovery_status)) continue;

      const pageKey = normalizePageKey(page);
      if (!pageKey) continue;

      const queueUrl = String(page.normalized_url || page.url || "");
      const queueRejection = shouldRejectUrlBeforeQueue(queueUrl);

      if (queueRejection.reject || isKnownNonOpportunityPage(page)) {
        await supabase
          .from("discovered_pages")
          .update({
            discovery_status: "rejected",
            rejection_reason:
              queueRejection.reason ||
              "Known non-opportunity page: not a student-facing application opportunity.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", page.id);

        continue;
      }

      const familyKey = getPageFamilyKey(page);
      if (handledFamilyKeys.has(familyKey)) continue;

      if (!familyGroups.has(familyKey)) {
        familyGroups.set(familyKey, []);
      }

      familyGroups.get(familyKey)!.push(page);
    }

    const selectedLeadPages: Record<string, any>[] = selectBalancedLeadPages({
      familyGroups,
      maxBundles,
    });

    const results = [];
    const alreadyUsedPageKeys = new Set<string>();
    const alreadyUsedFamilyKeys = new Set<string>();

    for (const leadPage of selectedLeadPages) {
      const { data: currentLeadPage, error: currentLeadError } = await supabase
        .from("discovered_pages")
        .select("*")
        .eq("id", leadPage.id)
        .maybeSingle();

      if (currentLeadError) {
        results.push({
          leadPageId: leadPage.id,
          leadTitle: leadPage.title,
          leadUrl: leadPage.url,
          decision: "error",
          error: currentLeadError.message,
        });
        continue;
      }

      if (!currentLeadPage || !shouldProcessStatus(currentLeadPage.discovery_status)) {
        results.push({
          leadPageId: leadPage.id,
          leadTitle: leadPage.title,
          leadUrl: leadPage.url,
          decision: "skipped",
          reason: "lead_page_already_processed_or_not_processable",
          currentStatus: currentLeadPage?.discovery_status || null,
        });
        continue;
      }

      if (isKnownNonOpportunityPage(currentLeadPage)) {
        await supabase
          .from("discovered_pages")
          .update({
            discovery_status: "rejected",
            rejection_reason: "Known non-opportunity page: not a student-facing application opportunity.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentLeadPage.id);

        results.push({
          leadPageId: currentLeadPage.id,
          leadTitle: currentLeadPage.title,
          leadUrl: currentLeadPage.url,
          decision: "reject",
          reason: "known_non_opportunity_page",
          currentStatus: currentLeadPage.discovery_status,
        });
        continue;
      }

      const currentLeadKey = normalizePageKey(currentLeadPage);
      const currentFamilyKey = getPageFamilyKey(currentLeadPage);

      const { data: handledFamilyPages, error: handledFamilyError } = await supabase
        .from("discovered_pages")
        .select("id, discovery_status")
        .eq("opportunity_family_key", currentFamilyKey)
        .in("discovery_status", [
          "future_tracking",
          "review",
          "published",
          "bundled"
        ])
        .limit(1);

      if (handledFamilyError) {
        results.push({
          leadPageId: currentLeadPage.id,
          leadTitle: currentLeadPage.title,
          leadUrl: currentLeadPage.url,
          decision: "error",
          error: handledFamilyError.message,
        });
        continue;
      }

      if (handledFamilyPages && handledFamilyPages.length > 0) {
        results.push({
          leadPageId: currentLeadPage.id,
          leadTitle: currentLeadPage.title,
          leadUrl: currentLeadPage.url,
          decision: "skipped",
          reason: "opportunity_family_already_handled",
          opportunityFamilyKey: currentFamilyKey,
          currentStatus: currentLeadPage.discovery_status,
          handledStatus: handledFamilyPages[0].discovery_status,
        });
        continue;
      }

      if (alreadyUsedFamilyKeys.has(currentFamilyKey)) {
        results.push({
          leadPageId: currentLeadPage.id,
          leadTitle: currentLeadPage.title,
          leadUrl: currentLeadPage.url,
          decision: "skipped",
          reason: "opportunity_family_already_processed_in_this_batch",
          opportunityFamilyKey: currentFamilyKey,
          currentStatus: currentLeadPage.discovery_status,
        });
        continue;
      }

      if (alreadyUsedPageKeys.has(currentLeadKey)) {
        results.push({
          leadPageId: currentLeadPage.id,
          leadTitle: currentLeadPage.title,
          leadUrl: currentLeadPage.url,
          decision: "skipped",
          reason: "lead_page_already_used_in_this_batch",
          currentStatus: currentLeadPage.discovery_status,
        });
        continue;
      }

      const bundleResult = await processBundle({
        supabase,
        leadPage: currentLeadPage,
        sourceTrust,
        maxPagesPerBundle,
      });

      let expansion: Record<string, any> = {
        expanded: false,
        savedCount: 0,
        reason: "not_expanded_for_direct_or_terminal_page",
        saved: [],
      };

      if (bundleResult.decision === "expanded_source_listing") {
        expansion = await expandCandidateLinks({
          supabase,
          page: currentLeadPage,
        });
      }

      for (const page of bundleResult.pages || []) {
        alreadyUsedPageKeys.add(normalizeUrlKey(page.url));
      }

      for (const savedPage of expansion.saved || []) {
        alreadyUsedPageKeys.add(
          normalizeUrlKey(savedPage.normalized_url || savedPage.url)
        );
      }

      alreadyUsedPageKeys.add(currentLeadKey);
      alreadyUsedFamilyKeys.add(currentFamilyKey);

      if (isTerminalBundleDecision(bundleResult.decision)) {
        const expansionSupportingIds = (expansion.saved || [])
          .map((row: Record<string, unknown>) => String(row.id || ""))
          .filter(Boolean)
          .filter((id: string) => id !== String(currentLeadPage.id));

        if (expansionSupportingIds.length > 0) {
          await supabase
            .from("discovered_pages")
            .update({
              discovery_status: "bundled",
              bundled_with_id: currentLeadPage.id,
              opportunity_family_key: currentFamilyKey,
              updated_at: new Date().toISOString(),
            })
            .in("id", expansionSupportingIds)
            .eq("discovery_status", "candidate");
        }

        const finalDiscoveryStatus =
          bundleResult.decision === "track_for_next_cycle"
            ? "future_tracking"
            : bundleResult.decision === "auto_publish"
              ? "published"
              : bundleResult.decision === "review"
                ? "review"
                : bundleResult.decision === "needs_more_pages"
                  ? "needs_more_pages"
                  : currentLeadPage.discovery_status;

        await supabase
          .from("discovered_pages")
          .update({
            discovery_status: finalDiscoveryStatus,
            opportunity_family_key: currentFamilyKey,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentLeadPage.id);
      }

      results.push({
        leadTitle: currentLeadPage.title,
        leadUrl: currentLeadPage.url,
        selectedFamilyKey: currentLeadPage.selected_family_key || currentFamilyKey,
        selectedLeadScore: currentLeadPage.selected_lead_score || scoreLeadPage(currentLeadPage),
        selectedFamilyCandidateCount:
          currentLeadPage.selected_family_candidate_count || null,
        expansion,
        ...bundleResult,
      });
    }

    return NextResponse.json({
      processedBundles: results.length,
      maxBundles,
      maxPagesPerBundle,
      sourceTrust,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run discovery batch.",
      },
      { status: 500 }
    );
  }
}
