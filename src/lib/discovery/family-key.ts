function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
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
    return normalizeText(raw).split(" ")[0] || "";
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
    normalizeText(sourceDomain) ||
    getDomainFamily(url);

  const type = normalizeText(opportunityType) || "unknown_type";

  const providerText = normalizeText(provider);
  const titleText = normalizeText(title);
  const queryText = normalizeText(discoveryQuery);

  let familyHint = "";

  if (domain.includes("loranscholar.ca")) {
    familyHint = "loran";
  } else if (providerText) {
    familyHint = providerText.split(" ").slice(0, 4).join("-");
  } else if (titleText) {
    familyHint = titleText.split(" ").slice(0, 5).join("-");
  } else {
    familyHint = queryText.split(" ").slice(0, 5).join("-");
  }

  return [domain, type, familyHint || "unknown"]
    .filter(Boolean)
    .join("__")
    .replace(/_+/g, "_")
    .replace(/\s+/g, "-");
}
