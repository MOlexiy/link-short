import { describe, expect, it } from "vitest";
import { generateSlug, isReservedSlug, SLUG_PATTERN } from "../src/lib/slug.js";
import { isHttpUrl, referrerHost } from "../src/lib/url.js";
import { parseUserAgent } from "../src/lib/user-agent.js";
import { countryFromHeaders, visitorId } from "../src/lib/visitor.js";
import { addDays, dateKey, lastNDayKeys, startOfDayInZone } from "../src/lib/time.js";
import { BOT_UA, CHROME_UA, IPHONE_UA } from "./helpers/http.js";

describe("slug", () => {
  it("generates 7-char base62 slugs that pass validation", () => {
    const slugs = new Set(Array.from({ length: 1000 }, () => generateSlug()));
    expect(slugs.size).toBe(1000);
    for (const s of slugs) expect(s).toMatch(/^[0-9A-Za-z]{7}$/);
  });

  it("rejects reserved and malformed slugs", () => {
    expect(isReservedSlug("API")).toBe(true);
    expect(SLUG_PATTERN.test("ab")).toBe(false);
    expect(SLUG_PATTERN.test("has space")).toBe(false);
    expect(SLUG_PATTERN.test("my-link_2")).toBe(true);
  });
});

describe("url", () => {
  it.each([
    ["https://example.com/path?q=1", true],
    ["http://localhost:3000", true],
    ["javascript:alert(1)", false],
    ["data:text/html,hi", false],
    ["ftp://example.com", false],
    ["example.com", false],
    [`https://example.com/${"a".repeat(2100)}`, false],
  ])("isHttpUrl(%s) → %s", (url, expected) => {
    expect(isHttpUrl(url)).toBe(expected);
  });

  it("normalises referrers to a host", () => {
    expect(referrerHost("https://www.linkedin.com/feed/")).toBe("linkedin.com");
    expect(referrerHost(undefined)).toBe("direct");
    expect(referrerHost("not a url")).toBe("direct");
  });
});

describe("user agent", () => {
  it("parses desktop and mobile browsers", () => {
    expect(parseUserAgent(CHROME_UA)).toEqual({ browser: "Chrome", os: "Windows", device: "desktop", isBot: false });
    expect(parseUserAgent(IPHONE_UA)).toMatchObject({ browser: "Safari", os: "iOS", device: "mobile", isBot: false });
  });

  it("flags bots and missing user agents", () => {
    expect(parseUserAgent(BOT_UA).isBot).toBe(true);
    expect(parseUserAgent("curl/8.7.1").isBot).toBe(true);
    expect(parseUserAgent(undefined).isBot).toBe(true);
  });
});

describe("visitor", () => {
  it("is stable within a day and rotates between days", () => {
    const base = { ip: "1.2.3.4", userAgent: CHROME_UA, salt: "s" };
    const a = visitorId({ ...base, at: new Date("2026-10-20T08:00:00Z") });
    const b = visitorId({ ...base, at: new Date("2026-10-20T20:00:00Z") });
    const c = visitorId({ ...base, at: new Date("2026-10-21T08:00:00Z") });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("1.2.3.4");
  });

  it("reads country from CDN headers", () => {
    expect(countryFromHeaders({ "cloudfront-viewer-country": "ua" })).toBe("UA");
    expect(countryFromHeaders({ "cf-ipcountry": "XX" })).toBe("ZZ");
    expect(countryFromHeaders({})).toBe("ZZ");
  });
});

describe("time", () => {
  it("formats calendar days in a time zone", () => {
    const instant = new Date("2026-10-20T22:30:00Z"); // already Oct 21 in Berlin (UTC+2)
    expect(dateKey(instant, "UTC")).toBe("2026-10-20");
    expect(dateKey(instant, "Europe/Berlin")).toBe("2026-10-21");
  });

  it("finds local midnight, including DST switch days", () => {
    expect(startOfDayInZone("2026-10-21", "Europe/Berlin").toISOString()).toBe("2026-10-20T22:00:00.000Z");
    // Clocks go back on 2026-10-25 (CEST +2 → CET +1)...
    expect(startOfDayInZone("2026-10-25", "Europe/Berlin").toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(startOfDayInZone("2026-10-26", "Europe/Berlin").toISOString()).toBe("2026-10-25T23:00:00.000Z");
    // ...and forward on 2026-03-29.
    expect(startOfDayInZone("2026-03-29", "Europe/Berlin").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(startOfDayInZone("2026-03-30", "Europe/Berlin").toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(startOfDayInZone("2026-10-21", "UTC").toISOString()).toBe("2026-10-21T00:00:00.000Z");
  });

  it("lists the last N days, oldest first", () => {
    expect(lastNDayKeys(3, "UTC", new Date("2026-03-01T10:00:00Z"))).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});
