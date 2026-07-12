/**
 * Demand-driven school discovery — the supply side.
 *
 * Works the school_demand queue in priority order (most users first),
 * EXHAUSTIVELY per slice: each pass runs a different family of scoped
 * queries ("[School] [field] scholarship", apply-intent phrasings,
 * department/funding phrasings), and a slice only retires after two
 * consecutive passes surface nothing new — a big school legitimately takes
 * several passes; a small one exhausts in one or two. Every candidate flows
 * through the SAME production gates as national discovery (intake gate →
 * Pro extraction → validation → destination resolution → verification).
 *
 * Budgets are deliberately small per run — the daytime cron fires several
 * times a day, so throughput comes from frequency, not from big bursts, and
 * a day with no demand costs nothing.
 */
import { searchDiscoveryWeb } from "@/lib/discovery/search/search-provider";
import { assessSearchResultIntake } from "@/lib/discovery/search-result-intake-gate";
import { upsertDiscoveredPages } from "@/lib/discovery/discovered-pages";
import { processPendingDiscoveredPages } from "@/lib/discovery/process-discovered-page";
import { normalizeUrl } from "@/lib/utils/url-normalizer";

type SupabaseClientLike = { from: (table: string) => any };
type Row = Record<string, unknown>;

const SLICES_PER_RUN = 3;
const MAX_QUERIES_PER_SLICE = 8;
const RESULTS_PER_QUERY = 8;
const PAGES_TO_PROCESS_PER_RUN = 24;
const EMPTY_PASSES_TO_EXHAUST = 2;

const CATEGORY_TERMS: Record<string, string[]> = {
  scholarship: ["scholarship", "bursary OR award"],
  fellowship: ["fellowship"],
  research_program: ["summer research program", "undergraduate research award"],
  grant: ["student grant OR travel grant"],
  competition: ["student competition OR case competition OR hackathon"],
  leadership_program: ["student leadership program"],
  career_development_program: ["career program OR mentorship program"],
};

const LEVEL_TERMS: Record<string, string> = {
  high_school: "high school students",
  undergraduate: "undergraduate students",
  masters: "graduate students master's",
  phd: "doctoral PhD students",
  mba: "MBA students",
  jd: "law students",
  md: "medical students",
  professional: "professional students",
};

/** Query families rotate by pass so each pass covers new ground. */
function buildSliceQueries(slice: Row, pass: number): string[] {
  const school = `"${String(slice.school)}"`;
  const level = LEVEL_TERMS[String(slice.level)] || "students";
  const field = slice.field ? String(slice.field) : "";
  const categories = ((slice.categories as string[]) || []).slice(0, 4);
  const queries: string[] = [];

  for (const category of categories) {
    const terms = CATEGORY_TERMS[category] || [category.replace(/_/g, " ")];
    const term = terms[pass % terms.length];
    if (pass % 3 === 0) {
      queries.push(`${school} ${field} ${term} ${level}`.replace(/\s+/g, " ").trim());
    } else if (pass % 3 === 1) {
      queries.push(
        `${school} ${field} ${term} apply eligibility deadline`.replace(/\s+/g, " ").trim()
      );
    } else {
      queries.push(
        `${school} ${field ? field + " department" : level} ${term} funding opportunities`
          .replace(/\s+/g, " ")
          .trim()
      );
    }
  }

  // The general slice also asks for the school's own awards index pages —
  // those are directory-ish but the intake/hub machinery mines them.
  if (!slice.field && pass % 3 === 0) {
    queries.push(`${school} ${level} awards financial aid opportunities`);
  }

  return Array.from(new Set(queries)).slice(0, MAX_QUERIES_PER_SLICE);
}

export type SchoolDemandRunSummary = {
  slicesWorked: number;
  searches: number;
  newCandidates: number;
  processed: number;
  published: number;
  tracked: number;
  rejected: number;
  exhausted: number;
  details: string[];
};

export async function runSchoolDemandDiscovery({
  supabase,
  maxSlices = SLICES_PER_RUN,
}: {
  supabase: SupabaseClientLike;
  maxSlices?: number;
}): Promise<SchoolDemandRunSummary> {
  const summary: SchoolDemandRunSummary = {
    slicesWorked: 0, searches: 0, newCandidates: 0, processed: 0,
    published: 0, tracked: 0, rejected: 0, exhausted: 0, details: [],
  };

  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("school_demand")
    .select("*")
    .in("status", ["pending", "in_progress"])
    .gt("user_count", 0)
    .lte("next_pass_at", nowIso)
    .order("user_count", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(maxSlices * 2);

  if (error) {
    summary.details.push(`queue query failed: ${error.message}`);
    return summary;
  }

  let worked = 0;
  for (const slice of due || []) {
    if (worked >= maxSlices) break;

    // CAS claim so overlapping cron slots never double-work a slice.
    const { data: claimed } = await supabase
      .from("school_demand")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", slice.id)
      .eq("status", slice.status)
      .eq("updated_at", slice.updated_at)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    worked += 1;
    summary.slicesWorked += 1;

    const label = `${slice.school} · ${slice.level} · ${slice.field || "general"}`;
    try {
      const queries = buildSliceQueries(slice, Number(slice.passes_done || 0));
      let sliceNewCandidates = 0;

      for (const query of queries) {
        summary.searches += 1;
        let results;
        try {
          results = await searchDiscoveryWeb({ query, maxResults: RESULTS_PER_QUERY });
        } catch {
          continue; // one failed search never kills the slice
        }

        const candidates = results
          .map((result) => {
            const normalizedUrl = normalizeUrl(result.url);
            if (!normalizedUrl) return null;
            const intake = assessSearchResultIntake({
              url: result.url,
              title: result.title || null,
              snippet: result.snippet || null,
              campaignOpportunityType: null,
              campaignQuery: query,
            });
            if (intake.decision !== "candidate") return null;
            return {
              url: result.url,
              normalizedUrl,
              linkText: result.title || result.url,
              reasons: intake.reasons,
              score: intake.score,
              opportunityType: null,
              inferredOpportunityType: intake.inferredOpportunityType || null,
            };
          })
          .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

        if (candidates.length > 0) {
          const upserted = await upsertDiscoveredPages({
            supabase,
            candidates,
            discoveryQuery: query,
            region: slice.country ? String(slice.country) : null,
            educationLevel: String(slice.level),
            fieldArea: slice.field ? String(slice.field) : null,
          });
          sliceNewCandidates += Number((upserted as Row | null)?.upserted ?? 0);
        }
      }

      summary.newCandidates += sliceNewCandidates;
      const emptyPass = sliceNewCandidates === 0;
      const consecutiveEmpty = emptyPass
        ? Number(slice.consecutive_empty_passes || 0) + 1
        : 0;
      const exhausted = consecutiveEmpty >= EMPTY_PASSES_TO_EXHAUST;
      if (exhausted) summary.exhausted += 1;

      const nextPass = new Date();
      nextPass.setUTCHours(nextPass.getUTCHours() + 20); // next day-ish pass

      await supabase
        .from("school_demand")
        .update({
          status: exhausted ? "exhausted" : "in_progress",
          passes_done: Number(slice.passes_done || 0) + 1,
          consecutive_empty_passes: consecutiveEmpty,
          new_candidates_last_pass: sliceNewCandidates,
          last_pass_at: new Date().toISOString(),
          next_pass_at: exhausted ? new Date().toISOString() : nextPass.toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", slice.id);

      summary.details.push(
        `${label}: +${sliceNewCandidates} candidates (pass ${Number(slice.passes_done || 0) + 1}${exhausted ? ", exhausted" : ""})`
      );
    } catch (error) {
      await supabase
        .from("school_demand")
        .update({
          status: "pending",
          last_error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
          next_pass_at: new Date(Date.now() + 6 * 3600000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", slice.id);
      summary.details.push(`${label}: FAILED`);
    }
  }

  // Process the freshly queued candidates through the full production gate.
  if (summary.newCandidates > 0 || worked > 0) {
    const processed = await processPendingDiscoveredPages({
      supabase,
      limit: PAGES_TO_PROCESS_PER_RUN,
    });
    summary.processed = processed.processed;
    summary.published = processed.published;
    summary.tracked = processed.tracked;
    summary.rejected = processed.rejected;
  }

  return summary;
}
