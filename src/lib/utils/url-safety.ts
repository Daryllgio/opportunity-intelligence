/**
 * URL safety checks for server-side fetching.
 *
 * Guards against SSRF by rejecting non-http(s) URLs and hostnames that point at
 * localhost, link-local, or RFC1918 private network ranges. This does NOT do
 * DNS resolution — it only blocks the obvious literal patterns, which is enough
 * to stop direct requests to internal/metadata endpoints.
 */

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;

  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [a, b] = octets;

  // 0.0.0.0/8 (includes 0.0.0.0)
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local, includes cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  return false;
}

function isBlockedIPv6(hostname: string): boolean {
  // URL hostnames keep IPv6 in brackets; normalize before checking.
  let host = hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }

  // ::1 loopback and unspecified ::
  if (host === "::1" || host === "::") return true;

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) — check the embedded v4 part.
  const mapped = host.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (mapped && isPrivateIPv4(mapped[1])) return true;

  // fc00::/7 (unique local) and fe80::/10 (link-local)
  if (host.startsWith("fc") || host.startsWith("fd")) return true;
  if (host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")) {
    return true;
  }

  return false;
}

export function isPubliclyFetchableUrl(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");

  if (!hostname) return false;

  // Hostname-based blocks.
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0"
  ) {
    return false;
  }

  if (hostname.includes(":") || hostname.startsWith("[")) {
    return !isBlockedIPv6(hostname);
  }

  if (isPrivateIPv4(hostname)) {
    return false;
  }

  return true;
}
