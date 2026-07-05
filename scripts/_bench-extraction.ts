/**
 * Flash vs Pro extraction benchmark on real opportunity pages.
 *
 * Captures the source pages of published opportunities + review drafts once,
 * then runs the EXACT production extraction path with gemini-2.5-flash and
 * gemini-2.5-pro on identical text. Results land in a JSON file for
 * field-level comparison and disagreement adjudication.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/_bench-extraction.ts
 */
import { writeFileSync, existsSync, readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { capturePageWithHybrid } from "../src/lib/discovery/capture/hybrid-capture";
import { extractDiscoveredOpportunity } from "../src/lib/discovery/extract-discovered-opportunity";

const OUT_FILE = "/private/tmp/claude-501/-Users-d-gio-opportunity-intelligence/68227b55-4c7d-4c69-860f-3723f136ac44/scratchpad/bench-extraction-results.json";
const TARGET = 50;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type BenchRecord = {
  id: string;
  origin: "published" | "draft";
  url: string;
  knownTitle: string | null;
  knownType: string | null;
  knownDeadline: string | null;
  captureMethod: string;
  textLength: number;
  pageTextHead: string;
  flash: Record<string, unknown> | { error: string };
  pro: Record<string, unknown> | { error: string };
  flashMs: number;
  proMs: number;
};

async function main() {
  const { data: published } = await supabase
    .from("opportunities")
    .select("id, title, type, deadline, source_url")
    .eq("is_active", true)
    .eq("is_approved", true)
    .order("updated_at", { ascending: false });

  const { data: drafts } = await supabase
    .from("opportunity_drafts")
    .select("id, title, type, deadline, source_url")
    .eq("validation_decision", "review")
    .not("source_url", "is", null)
    .order("updated_at", { ascending: false })
    .limit(30);

  const candidates = [
    ...(published || []).map((row) => ({ ...row, origin: "published" as const })),
    ...(drafts || []).map((row) => ({ ...row, origin: "draft" as const })),
  ].filter((row) => row.source_url);

  // Domain diversity: at most 2 pages per domain.
  const domainCount = new Map<string, number>();
  const queue: typeof candidates = [];
  for (const row of candidates) {
    let domain = "";
    try {
      domain = new URL(row.source_url!).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    const used = domainCount.get(domain) || 0;
    if (used >= 2) continue;
    domainCount.set(domain, used + 1);
    queue.push(row);
  }

  console.log(`candidate pages: ${queue.length} (need ${TARGET} successful captures)`);

  const results: BenchRecord[] = existsSync(OUT_FILE)
    ? JSON.parse(readFileSync(OUT_FILE, "utf8"))
    : [];
  const done = new Set(results.map((r) => r.id));

  for (const row of queue) {
    if (results.length >= TARGET) break;
    if (done.has(row.id)) continue;

    process.stdout.write(`[${results.length + 1}/${TARGET}] ${row.source_url} ... `);

    let capture;
    try {
      capture = await capturePageWithHybrid(row.source_url!, { allowPlaywright: true });
    } catch (error) {
      console.log(`capture threw: ${error instanceof Error ? error.message : error}`);
      continue;
    }
    const final = capture.finalResult;
    const pageText =
      "cleanText" in final ? final.cleanText : (final as { text?: string }).text || "";
    if (!final.ok || pageText.length < 300) {
      console.log(`capture failed/thin (${pageText.length} chars)`);
      continue;
    }

    const runModel = async (model: string) => {
      const started = Date.now();
      try {
        const extraction = await extractDiscoveredOpportunity({
          pageText,
          sourceUrl: row.source_url!,
          model,
        });
        return { result: extraction as unknown as Record<string, unknown>, ms: Date.now() - started };
      } catch (error) {
        return {
          result: { error: error instanceof Error ? error.message : String(error) },
          ms: Date.now() - started,
        };
      }
    };

    const [flash, pro] = await Promise.all([
      runModel("gemini-2.5-flash"),
      runModel("gemini-2.5-pro"),
    ]);

    results.push({
      id: row.id,
      origin: row.origin,
      url: row.source_url!,
      knownTitle: row.title,
      knownType: row.type,
      knownDeadline: row.deadline,
      captureMethod: capture.captureMethod,
      textLength: pageText.length,
      pageTextHead: pageText.slice(0, 1500),
      flash: flash.result,
      pro: pro.result,
      flashMs: flash.ms,
      proMs: pro.ms,
    });
    writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
    console.log(`ok (${capture.captureMethod}, ${pageText.length} chars, flash ${flash.ms}ms, pro ${pro.ms}ms)`);
  }

  console.log(`\ndone: ${results.length} pages benchmarked -> ${OUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
