import { createHash } from "node:crypto";

/**
 * Privacy-friendly unique-visitor id: we never store raw IPs.
 * The hash includes the UTC day, so the same person counts as one visitor per
 * day and ids can't be correlated across days (same approach as Plausible).
 */
export function visitorId(params: { ip: string; userAgent: string; salt: string; at?: Date }): string {
  const day = (params.at ?? new Date()).toISOString().slice(0, 10);
  return createHash("sha256")
    .update(`${params.salt}|${day}|${params.ip}|${params.userAgent}`)
    .digest("base64url")
    .slice(0, 22);
}

/** Stable salted hash of a client IP, used as a rate-limit key (raw IPs are never stored). */
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}|ip|${ip}`).digest("base64url").slice(0, 22);
}

/** Country headers set by common CDNs in front of the API. */
const COUNTRY_HEADERS = ["cloudfront-viewer-country", "cf-ipcountry", "x-vercel-ip-country", "x-country-code"];

export const UNKNOWN_COUNTRY = "ZZ";

export function countryFromHeaders(headers: Record<string, string | undefined>): string {
  for (const name of COUNTRY_HEADERS) {
    const value = headers[name]?.trim().toUpperCase();
    if (value && /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1") return value;
  }
  return UNKNOWN_COUNTRY;
}
