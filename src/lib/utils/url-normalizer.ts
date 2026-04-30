export function normalizeUrl(value: string | null | undefined) {
  if (!value) return "";

  try {
    const url = new URL(value.trim());

    url.hash = "";

    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid",
    ];

    trackingParams.forEach((param) => url.searchParams.delete(param));

    let normalized = url.toString();

    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    return value.trim().replace(/\/$/, "");
  }
}

export function urlsMatch(first: string | null | undefined, second: string | null | undefined) {
  return normalizeUrl(first) === normalizeUrl(second);
}
