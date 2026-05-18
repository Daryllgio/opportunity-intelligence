function normalizeSlug(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

export function getDomainFamily(url: unknown) {
  const raw = String(url || "").trim();

  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.replace(/^www\./, "");

    if (hostname.endsWith("loranscholar.ca")) {
      return "loranscholar.ca";
    }

    return hostname;
  } catch {
    return normalizeSlug(raw).split("-")[0] || "";
  }
}

export function buildOpportunityFamilyKey({
  url,
  sourceDomain,
  opportunityType,
  title,
  provider,
  discoveryQuery,
}: {
  url?: unknown;
  sourceDomain?: unknown;
  opportunityType?: unknown;
  title?: unknown;
  provider?: unknown;
  discoveryQuery?: unknown;
}) {
  const domain =
    String(sourceDomain || "").replace(/^www\./, "").trim() ||
    getDomainFamily(url);

  const normalizedDomain = getDomainFamily(`https://${domain}`) || domain;
  const type = normalizeSlug(opportunityType) || "unknown-type";

  const providerText = normalizeSlug(provider);
  const titleText = normalizeSlug(title);
  const queryText = normalizeSlug(discoveryQuery);

  let familyHint = "";

  if (normalizedDomain.includes("loranscholar.ca")) {
    familyHint = "loran";
  } else if (providerText) {
    familyHint = providerText.split("-").slice(0, 4).join("-");
  } else if (titleText) {
    familyHint = titleText.split("-").slice(0, 5).join("-");
  } else {
    familyHint = queryText.split("-").slice(0, 5).join("-");
  }

  return [normalizedDomain, type, familyHint || "unknown"]
    .filter(Boolean)
    .join("__");
}
