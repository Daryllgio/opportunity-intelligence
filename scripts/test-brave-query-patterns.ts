import { searchDiscoveryWeb } from "../src/lib/discovery/search/search-provider";

const queries = [
  // Baseline broad-but-intentional
  "scholarship application deadline high school students",
  "undergraduate scholarship application deadline students",
  "student scholarship apply eligibility deadline",

  // TLD/domain syntax tests
  "site:.edu scholarship application deadline high school students",
  "site:edu scholarship application deadline high school students",
  ".edu scholarship application deadline high school students",
  "university scholarship application deadline high school students",

  // With exclusions
  "scholarship application deadline high school students -scholarships.com -fastweb -bold.org",
  "undergraduate scholarship application deadline -scholarships.com -fastweb",

  // Known specific official-ish queries
  "case competition application deadline undergraduate students",
  "student competition application deadline undergraduate",
  "career development program students application deadline",
  "pipeline program students application deadline",
  "summer research program undergraduate application deadline",
  "medical student research fellowship application deadline",

  // Specific site syntax
  "site:harvard.edu fellowship application deadline students",
  "site:utoronto.ca scholarship application deadline students",
  "site:canada.ca student grant application eligibility",
];

async function main() {
  console.log(`Testing ${queries.length} Brave query patterns...\n`);

  for (const query of queries) {
    try {
      const results = await searchDiscoveryWeb({
        query,
        maxResults: 5,
      });

      console.log("QUERY:");
      console.log(query);
      console.log(`RESULTS: ${results.length}`);

      for (const result of results.slice(0, 3)) {
        console.log(`- ${result.title || "(no title)"}`);
        console.log(`  ${result.url}`);
      }

      console.log("");
    } catch (error) {
      console.log("QUERY FAILED:");
      console.log(query);
      console.log(error instanceof Error ? error.message : error);
      console.log("");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
