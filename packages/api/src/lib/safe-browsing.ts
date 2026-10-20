/**
 * Google Safe Browsing Lookup API (v4) — checks a URL against Google's lists of
 * phishing, malware and unwanted-software sites.
 *
 * Fails OPEN: if Google is slow or unavailable, the link is allowed and the
 * error is logged. For a demo, availability beats perfect filtering; the other
 * layers (rate limits, forced expiry, manual disable) still apply.
 */
const ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const TIMEOUT_MS = 1500;

export type SafeBrowsingVerdict = "safe" | "unsafe" | "unknown";

export async function checkSafeBrowsing(url: string, apiKey: string | undefined): Promise<SafeBrowsingVerdict> {
  if (!apiKey) return "unknown";

  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        client: { clientId: "link-short", clientVersion: "1.0.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url }],
        },
      }),
    });
    if (!res.ok) throw new Error(`Safe Browsing responded ${res.status}`);
    const body = (await res.json()) as { matches?: unknown[] };
    return body.matches?.length ? "unsafe" : "safe";
  } catch (err) {
    console.warn(
      JSON.stringify({ level: "warn", msg: "Safe Browsing check failed", error: err instanceof Error ? err.message : String(err) }),
    );
    return "unknown";
  }
}
