export type DiscoverySearchResult = {
  title: string | null;
  url: string;
  snippet: string | null;
};

export async function searchDiscoveryWeb({
  query,
  maxResults = 10,
}: {
  query: string;
  maxResults?: number;
}): Promise<DiscoverySearchResult[]> {
  // Temporary product-safe stub.
  // Next step will replace this with Brave/SerpAPI/Tavily/etc.
  // Keeping this separate means the campaign runner does not care which provider we use.
  return [
    {
      title: "Loran Scholars - How to Apply",
      url: "https://loranscholar.ca/the-program/how-to-apply/",
      snippet:
        "Learn how to apply for the Loran Award, including eligibility, application steps, and selection process.",
    },
    {
      title: "Loran Scholars - Frequently Asked Questions",
      url: "https://loranscholar.ca/the-program/frequently-asked-questions/",
      snippet:
        "FAQ page with eligibility, application deadline, selection details, and award information.",
    },
  ].slice(0, maxResults);
}
