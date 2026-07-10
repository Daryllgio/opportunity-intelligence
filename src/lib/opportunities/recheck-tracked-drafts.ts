/**
 * Next-cycle tracking for drafts parked as "closed_cycle".
 *
 * When an extraction finds a real opportunity whose applications are closed
 * (Coca-Cola Scholars in July, opens August), the pipeline stores the draft
 * with expected_next_check_at instead of discarding it. This module is the
 * other half of that promise: when the check date arrives, re-read the page —
 * if the new cycle is open, the draft goes back through the FULL ingest gate
 * (validation, destination ranking, AI verification) and can publish
 * automatically; if still closed, the check date rolls forward. Rediscovering
 * the same opportunity through web search every year would cost the whole
 * discovery funnel; this costs one page fetch and one extraction.
 */
import { capturePageWithHybrid } from "@/lib/discovery/capture/hybrid-capture";
import { extractDiscoveredOpportunity } from "@/lib/discovery/extract-discovered-opportunity";
import { ingestExtractedOpportunity } from "@/lib/discovery/ingest-extracted-opportunity";

type SupabaseClientLike = {
  from: (table: string) => any;
};

export type TrackedDraftSummary = {
  processed: number;
  reopened: number;
  published: number;
  stillClosed: number;
  fetchFailed: number;
  failed: number;
  details: string[];
};

function addWeeks(date: Date, weeks: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + weeks * 7);
  return copy.toISOString();
}

export async function recheckTrackedDrafts({
  supabase,
  limit = 10,
}: {
  supabase: SupabaseClientLike;
  limit?: number;
}): Promise<TrackedDraftSummary> {
  const summary: TrackedDraftSummary = {
    processed: 0,
    reopened: 0,
    published: 0,
    stillClosed: 0,
    fetchFailed: 0,
    failed: 0,
    details: [],
  };

  const nowIso = new Date().toISOString();

  const { data: dueDrafts, error } = await supabase
    .from("opportunity_drafts")
    .select("*")
    .eq("extraction_status", "closed_cycle")
    .not("expected_next_check_at", "is", null)
    .lte("expected_next_check_at", nowIso)
    .order("expected_next_check_at", { ascending: true })
    .limit(limit);

  if (error) {
    summary.details.push(`query failed: ${error.message}`);
    return summary;
  }

  for (const draft of dueDrafts || []) {
    summary.processed += 1;
    const url = draft.source_url || draft.application_url;

    if (!url) {
      await supabase
        .from("opportunity_drafts")
        .update({
          expected_next_check_at: null,
          review_notes: "Next-cycle tracking stopped: no URL on record.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft.id);
      summary.failed += 1;
      continue;
    }

    try {
      const capture = await capturePageWithHybrid(url, { allowPlaywright: true });
      const pageText = capture.finalResult.ok ? capture.finalResult.cleanText : "";

      if (!pageText || pageText.length < 300) {
        await supabase
          .from("opportunity_drafts")
          .update({
            expected_next_check_at: addWeeks(new Date(), 2),
            review_notes: "Next-cycle check: page unreachable; retrying in 2 weeks.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", draft.id);
        summary.fetchFailed += 1;
        continue;
      }

      const extracted = await extractDiscoveredOpportunity({
        pageText,
        sourceUrl: url,
      });

      const deadlineDate = extracted.deadline ? new Date(extracted.deadline) : null;
      const hasFutureDeadline = Boolean(
        deadlineDate &&
          !Number.isNaN(deadlineDate.getTime()) &&
          deadlineDate.getTime() >= Date.now()
      );
      // A posted future deadline only implies "open" when the page's own
      // status language doesn't say otherwise — closed pages post next
      // cycle's deadline all year (the Boren failure).
      const looksOpen =
        extracted.application_status === "open" ||
        extracted.application_status === "rolling" ||
        (extracted.application_status === "unknown" && hasFutureDeadline);

      if (!looksOpen) {
        // Count consecutive still-closed checks; after ~a year of misses
        // (6 checks x 8 weeks) spanning two application cycles, the program
        // is presumed discontinued and leaves the queue for good.
        const missedSoFar =
          Number(String(draft.review_notes || "").match(/missed checks: (\d+)/)?.[1]) || 0;
        const missed = missedSoFar + 1;

        if (missed >= 6) {
          await supabase
            .from("opportunity_drafts")
            .update({
              extraction_status: "rejected",
              expected_next_check_at: null,
              review_notes: `Presumed discontinued ${nowIso.slice(0, 10)}: still closed after ${missed} checks across 2+ cycles.`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", draft.id);
          summary.stillClosed += 1;
          summary.details.push(`presumed discontinued: ${draft.title}`);
          continue;
        }

        await supabase
          .from("opportunity_drafts")
          .update({
            expected_next_check_at: addWeeks(new Date(), 8),
            review_notes: `Next-cycle check ${nowIso.slice(0, 10)}: still closed; rechecking in 8 weeks. (missed checks: ${missed})`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", draft.id);
        summary.stillClosed += 1;
        continue;
      }

      // The cycle reopened. Send it through the full production ingest gate —
      // the same validation + destination ranking + AI verification every
      // fresh discovery passes. Nothing publishes on the strength of last
      // year's data.
      summary.reopened += 1;
      const discoveredPageStub = draft.discovered_page_id
        ? { id: draft.discovered_page_id, url }
        : { id: null, url };

      const result = await ingestExtractedOpportunity({
        supabase,
        discoveredPage: discoveredPageStub,
        extracted: extracted as unknown as Record<string, unknown>,
        opportunityFamilyKey: draft.opportunity_family_key || null,
        sourceTrust: (draft.source_trust as any) || "standard",
      });

      if (result.decision === "auto_publish") {
        summary.published += 1;
        summary.details.push(`published renewed cycle: ${extracted.title}`);
        await supabase
          .from("opportunity_drafts")
          .update({
            extraction_status: "published",
            expected_next_check_at: null,
            review_notes: `Cycle reopened and republished ${nowIso.slice(0, 10)}.`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", draft.id);
      } else if (result.decision === "track_for_next_cycle") {
        // Ingest looked closer and re-tracked it — it already set a fresh
        // expected_next_check_at on this draft; leave it in the queue.
        summary.stillClosed += 1;
        summary.reopened -= 1;
        summary.details.push(
          `re-tracked for next cycle: ${extracted.title || draft.title}`
        );
      } else {
        summary.details.push(
          `reopened -> ${result.decision}: ${extracted.title || draft.title}`
        );
        await supabase
          .from("opportunity_drafts")
          .update({
            expected_next_check_at: null,
            review_notes: `Cycle reopened ${nowIso.slice(0, 10)}; ingest decision: ${result.decision}.`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", draft.id);
      }
    } catch (error) {
      summary.failed += 1;
      await supabase
        .from("opportunity_drafts")
        .update({
          expected_next_check_at: addWeeks(new Date(), 2),
          review_notes: `Next-cycle check failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft.id);
    }
  }

  return summary;
}
