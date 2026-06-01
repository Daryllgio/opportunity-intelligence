import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUrl } from "@/lib/utils/url-normalizer";
import { searchDiscoveryWeb } from "@/lib/discovery/search/search-provider";
import { upsertDiscoveredPages } from "@/lib/discovery/discovered-pages";
import type { CandidateOpportunityLink } from "@/lib/discovery/candidate-detection";
import { assessSearchResultIntake } from "@/lib/discovery/search-result-intake-gate";

type SearchCampaignCandidate = CandidateOpportunityLink & {
  inferredOpportunityType?: string | null;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

const preferredTypeOrder = [
  "pipeline_program",
  "career_development_program",
  "competition",
  "leadership_program",
  "grant",
  "research_program",
  "fellowship",
  "scholarship",
];

// Spread selection across opportunity types so one type doesn't dominate a run.
/* eslint-disable @typescript-eslint/no-explicit-any */
function selectBalancedCampaigns(
  pool: Record<string, any>[],
  limit: number
) {
  const selected: Record<string, any>[] = [];
  const selectedIds = new Set<string>();

  function addCampaign(campaign: Record<string, any> | undefined) {
    if (!campaign) return false;
    if (selected.length >= limit) return false;
    if (selectedIds.has(String(campaign.id))) return false;

    selected.push(campaign);
    selectedIds.add(String(campaign.id));
    return true;
  }

  for (const opportunityType of preferredTypeOrder) {
    const candidate = pool.find(
      (campaign) =>
        String(campaign.opportunity_type || "") === opportunityType &&
        !selectedIds.has(String(campaign.id))
    );

    addCampaign(candidate);
  }

  for (const campaign of pool) {
    if (selected.length >= limit) break;
    addCampaign(campaign);
  }

  return selected.slice(0, limit);
}

export type RunDiscoveryOptions = {
  supabase: SupabaseClient;
  maxCampaigns: number;
  // Hard cap on results requested per campaign (defends against runaway runs).
  maxResultsPerCampaign?: number;
};

/**
 * Runs due discovery search campaigns: picks a balanced set of active campaigns,
 * searches the web for each, gates the results through the intake assessment,
 * upserts discovered pages, and records run logs. Shared by the admin local
 * test route and the production cron route.
 */
export async function runDiscoverySearchCampaigns({
  supabase,
  maxCampaigns,
  maxResultsPerCampaign,
}: RunDiscoveryOptions) {
  const now = new Date();
  const campaignPoolLimit = Math.max(maxCampaigns * 12, 80);

  const { data: campaignPool, error: campaignError } = await supabase
    .from("discovery_campaigns")
    .select("*")
    .eq("status", "active")
    .or(`next_run_at.is.null,next_run_at.lte.${now.toISOString()}`)
    .order("next_run_at", { ascending: true, nullsFirst: true })
    .limit(campaignPoolLimit);

  if (campaignError) {
    throw new Error(campaignError.message);
  }

  const campaigns = selectBalancedCampaigns(campaignPool || [], maxCampaigns);

  const campaignResults = [];

  for (const campaign of campaigns) {
    const startedAt = new Date().toISOString();

    const { data: runLog, error: logError } = await supabase
      .from("discovery_run_logs")
      .insert({
        campaign_id: campaign.id,
        run_type: "search_campaign",
        query: campaign.query,
        status: "started",
        started_at: startedAt,
      })
      .select("*")
      .single();

    if (logError) {
      campaignResults.push({
        campaignId: campaign.id,
        query: campaign.query,
        status: "failed",
        error: logError.message,
      });
      continue;
    }

    try {
      const requested = Number(campaign.max_results || 10);
      const maxResults = maxResultsPerCampaign
        ? Math.min(requested, maxResultsPerCampaign)
        : requested;

      const results = await searchDiscoveryWeb({
        query: campaign.query,
        maxResults,
      });

      const skippedResults: Array<{
        title: string | null;
        url: string;
        domain: string;
        sourceCategory: string;
        reason: string;
      }> = [];

      const candidates: SearchCampaignCandidate[] = results
        .map<SearchCampaignCandidate | null>((result) => {
          const normalizedUrl = normalizeUrl(result.url);

          if (!normalizedUrl) return null;

          const intake = assessSearchResultIntake({
            url: result.url,
            title: result.title || null,
            snippet: result.snippet || null,
            campaignOpportunityType: campaign.opportunity_type || null,
            campaignQuery: campaign.query || null,
          });

          if (intake.decision !== "candidate") {
            skippedResults.push({
              title: result.title || null,
              url: result.url,
              domain: intake.domain,
              sourceCategory: intake.sourceCategory,
              reason: `${intake.decision}: score ${intake.score}. ${intake.reasons.join(" ")}`,
            });

            return null;
          }

          return {
            url: result.url,
            normalizedUrl,
            linkText: result.title || result.url,
            score: intake.score,
            inferredOpportunityType:
              intake.inferredOpportunityType ||
              campaign.opportunity_type ||
              null,
            reasons: [
              result.snippet || "Search result",
              `Search intake score: ${intake.score}`,
              intake.inferredOpportunityType
                ? `Inferred opportunity type: ${intake.inferredOpportunityType}`
                : "Inferred opportunity type: unknown",
              ...intake.reasons,
            ],
          };
        })
        .filter(
          (candidate): candidate is SearchCampaignCandidate =>
            candidate !== null
        );

      const saved = await upsertDiscoveredPages({
        supabase,
        candidates,
        discoveryQuery: campaign.query,
        region: campaign.region,
        opportunityType: campaign.opportunity_type,
        educationLevel: campaign.education_level,
        fieldArea: campaign.field_area,
      });

      const savedRows = saved.rows || [];

      const completedAt = new Date().toISOString();

      await supabase
        .from("discovery_run_logs")
        .update({
          status: "completed",
          results_found: results.length,
          pages_added: savedRows.length,
          completed_at: completedAt,
        })
        .eq("id", runLog.id);

      await supabase
        .from("discovery_campaigns")
        .update({
          last_run_at: completedAt,
          next_run_at: addDays(new Date(), 7).toISOString(),
          run_count: Number(campaign.run_count || 0) + 1,
          results_found: Number(campaign.results_found || 0) + results.length,
          pages_added: Number(campaign.pages_added || 0) + savedRows.length,
          last_error: null,
          updated_at: completedAt,
        })
        .eq("id", campaign.id);

      campaignResults.push({
        campaignId: campaign.id,
        opportunityType: campaign.opportunity_type,
        educationLevel: campaign.education_level,
        fieldArea: campaign.field_area,
        region: campaign.region,
        query: campaign.query,
        status: "completed",
        resultsFound: results.length,
        resultsSkipped: skippedResults.length,
        pagesAdded: savedRows.length,
        skipped: skippedResults.slice(0, 10),
        saved: savedRows.map((row) => ({
          id: row.id,
          title: row.title,
          url: row.url,
          discovery_status: row.discovery_status,
          opportunity_family_key: row.opportunity_family_key,
        })),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Search campaign failed.";

      await supabase
        .from("discovery_run_logs")
        .update({
          status: "failed",
          error: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runLog.id);

      await supabase
        .from("discovery_campaigns")
        .update({
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);

      campaignResults.push({
        campaignId: campaign.id,
        opportunityType: campaign.opportunity_type,
        educationLevel: campaign.education_level,
        fieldArea: campaign.field_area,
        region: campaign.region,
        query: campaign.query,
        status: "failed",
        error: message,
      });
    }
  }

  return {
    campaignsProcessed: campaignResults.length,
    results: campaignResults,
  };
}
