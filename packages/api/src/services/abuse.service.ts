import { HttpError } from "../lib/http.js";
import { assertUrlAllowed, hostOf } from "../lib/url-policy.js";
import { checkSafeBrowsing } from "../lib/safe-browsing.js";
import { hashIp } from "../lib/visitor.js";
import { config } from "../config.js";
import { consumeRateLimits, type LimitRule } from "./rate-limit.service.js";

function humanizeWait(seconds: number): string {
  if (seconds < 90) return "a minute";
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} minutes`;
  const hours = Math.ceil(seconds / 3600);
  return hours === 1 ? "an hour" : `${hours} hours`;
}

/**
 * Every check a new link must pass, cheapest first:
 *   1. URL policy (sync, no I/O)  2. rate limits (1 Mongo round trip)  3. Safe Browsing (external HTTP)
 * so that a flood of junk requests never reaches the expensive steps.
 */
export async function guardLinkCreation(params: { url: string; ip: string; baseUrl: string }): Promise<void> {
  assertUrlAllowed(params.url, {
    ownHosts: [hostOf(params.baseUrl), hostOf(config.shortBaseUrl)].filter((h): h is string => Boolean(h)),
    blockedDomains: config.blockedDomains,
  });

  const ip = hashIp(params.ip, config.visitorSalt);
  const rules: LimitRule[] = [
    { key: `create:ip:${ip}`, limit: config.createLimitPerHour, windowSec: 3600 },
    { key: `create:ip:${ip}`, limit: config.createLimitPerDay, windowSec: 86_400 },
    { key: "create:global", limit: config.globalCreateLimitPerDay, windowSec: 86_400 },
  ];

  const limit = await consumeRateLimits(rules);
  if (!limit.allowed) {
    const global = limit.exceeded?.key === "create:global";
    throw new HttpError(
      429,
      "RATE_LIMITED",
      global
        ? "The service has reached today's limit for new links. Try again tomorrow."
        : `You've created a lot of links in a short time. Try again in ${humanizeWait(limit.retryAfterSec)}.`,
      { retryAfterSec: limit.retryAfterSec },
      { "retry-after": String(limit.retryAfterSec) },
    );
  }

  if ((await checkSafeBrowsing(params.url, config.safeBrowsingKey)) === "unsafe") {
    throw new HttpError(422, "URL_UNSAFE", "Google Safe Browsing flags this URL as unsafe, so it can't be shortened");
  }
}

/** Applies the configured maximum lifetime to the requested one. */
export function effectiveTtlDays(requested: number | undefined): number | undefined {
  const max = config.maxLinkTtlDays;
  if (!max) return requested;
  return Math.min(requested ?? max, max);
}
