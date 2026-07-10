/**
 * Re-extraction for published opportunities and tracked drafts.
 *
 * Delegates to the ONE production extractor (extractDiscoveredOpportunity,
 * Gemini Pro) so recheck and catalog-refresh flows read pages with exactly
 * the accuracy standard new discoveries get — status language, application
 * open dates, canonical education levels, verbatim eligibility text. This
 * used to be a second, weaker Flash prompt; two prompts drift, and the drift
 * is where "senior secondary school = undergraduate" bugs live.
 */
import {
  extractDiscoveredOpportunity,
  type ApplicationStatus,
} from "@/lib/discovery/extract-discovered-opportunity";
import type { EligibilityCriterion } from "@/lib/matching/eligibility";
import type { OpportunityAttributes } from "@/lib/discovery/opportunity-attributes";

export type ReextractedOpportunity = {
  title?: string | null;
  provider?: string | null;
  type?: string | null;
  description?: string | null;
  ai_summary?: string | null;
  country?: string | null;
  eligible_countries?: string[] | null;
  eligible_education_levels?: string[] | null;
  eligible_fields?: string[] | null;
  funding_amount?: string | null;
  funding_type?: string | null;
  deadline?: string | null;
  application_status?: ApplicationStatus;
  application_opens_at?: string | null;
  deadline_confidence?: "high" | "medium" | "low" | "unknown";
  cycle_notes?: string | null;
  application_url?: string | null;
  effort_level?: string | null;
  reward_level?: string | null;
  competitiveness_factors?: string[] | null;
  eligibility_criteria?: EligibilityCriterion[];
  attributes?: OpportunityAttributes;
};

export async function reextractOpportunityFromPage({
  pageText,
  existingOpportunity,
}: {
  pageText: string;
  existingOpportunity: Record<string, unknown>;
}): Promise<ReextractedOpportunity> {
  const sourceUrl = String(
    existingOpportunity.source_url ||
      existingOpportunity.application_url ||
      ""
  );

  const extracted = await extractDiscoveredOpportunity({
    pageText,
    sourceUrl,
    discoveryContext: {
      // Recheck context: the extractor may use the known identity to stay
      // focused on THIS opportunity when the page lists several.
      opportunityType: String(existingOpportunity.type || "") || null,
    },
  });

  return extracted;
}
