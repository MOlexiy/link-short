import { RateLimit } from "../models/rate-limit.model.js";
import { isDuplicateKeyError } from "../lib/http.js";

export interface LimitRule {
  /** e.g. "create:ip:<hash>" or "create:global" */
  key: string;
  limit: number;
  windowSec: number;
}

export interface LimitResult {
  allowed: boolean;
  /** Seconds until the most restrictive exceeded window resets (0 when allowed). */
  retryAfterSec: number;
  exceeded?: LimitRule;
}

async function hit(rule: LimitRule, now: number) {
  const windowMs = rule.windowSec * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const _id = `${rule.key}:${rule.windowSec}:${windowStart}`;

  // One atomic round trip: create the counter if needed and increment it.
  const upsert = () =>
    RateLimit.findOneAndUpdate(
      { _id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(resetAt) } },
      { upsert: true, returnDocument: "after", lean: true },
    );

  let doc;
  try {
    doc = await upsert();
  } catch (err) {
    // Two concurrent upserts of a brand-new _id: one wins the insert, the
    // other gets E11000 — retrying turns it into a plain $inc.
    if (!isDuplicateKeyError(err)) throw err;
    doc = await upsert();
  }

  return { rule, count: doc?.count ?? 1, resetAt };
}

/** Counts this attempt against every rule; denies if any of them is over its limit. */
export async function consumeRateLimits(rules: LimitRule[], now = Date.now()): Promise<LimitResult> {
  const active = rules.filter((r) => r.limit > 0);
  if (!active.length) return { allowed: true, retryAfterSec: 0 };

  const hits = await Promise.all(active.map((r) => hit(r, now)));
  const exceeded = hits.filter((h) => h.count > h.rule.limit);
  if (!exceeded.length) return { allowed: true, retryAfterSec: 0 };

  const worst = exceeded.reduce((a, b) => (b.resetAt > a.resetAt ? b : a));
  return { allowed: false, retryAfterSec: Math.ceil((worst.resetAt - now) / 1000), exceeded: worst.rule };
}
