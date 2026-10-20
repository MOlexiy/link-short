import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { Link } from "../src/models/link.model.js";
import { Click } from "../src/models/click.model.js";
import { clearDb, startTestDb, stopTestDb } from "./helpers/db.js";
import { BOT_UA, CHROME_UA, IPHONE_UA, OTHER_OWNER, OWNER, client, startServer } from "./helpers/http.js";

let server: Server;
let api: ReturnType<typeof client>;
let anon: ReturnType<typeof client>;
let other: ReturnType<typeof client>;

beforeAll(async () => {
  delete process.env.WEB_URL;
  await startTestDb();
  const started = await startServer();
  server = started.server;
  api = client(started.base);
  anon = client(started.base, "");
  other = client(started.base, OTHER_OWNER);
});

afterAll(async () => {
  server?.close();
  await stopTestDb();
});

beforeEach(clearDb);

describe("POST /api/links", () => {
  it("creates a link with a generated slug", async () => {
    const res = await api.post("/api/links", { url: "https://example.com/a" });
    expect(res.status).toBe(201);
    expect(res.json.slug).toMatch(/^[0-9A-Za-z]{7}$/);
    expect(res.json.shortUrl).toMatch(new RegExp(`/${res.json.slug}$`));
    expect(res.json).toMatchObject({ url: "https://example.com/a", clicks: 0, expiresAt: null });
  });

  it("accepts a custom slug and rejects duplicates with 409", async () => {
    expect((await api.post("/api/links", { url: "https://example.com", slug: "my-cv" })).status).toBe(201);
    const dup = await other.post("/api/links", { url: "https://other.com", slug: "my-cv" });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe("SLUG_TAKEN");
  });

  it("sets expiresAt from expiresInDays", async () => {
    const res = await api.post("/api/links", { url: "https://example.com", expiresInDays: 7 });
    const diffDays = (new Date(res.json.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(6.99);
    expect(diffDays).toBeLessThan(7.01);
  });

  it.each([
    [{ url: "javascript:alert(1)" }, "url"],
    [{ url: "https://ok.com", slug: "api" }, "slug"],
    [{ url: "https://ok.com", slug: "a b" }, "slug"],
    [{ url: "https://ok.com", expiresInDays: 0 }, "expiresInDays"],
    [{ url: "https://ok.com", extra: true }, ""],
  ])("validates input %j", async (body, path) => {
    const res = await api.post("/api/links", body);
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("VALIDATION_ERROR");
    if (path) expect(res.json.error.details[0].path).toBe(path);
  });

  it("returns 400 for malformed JSON and 401 without an owner", async () => {
    expect((await api.post("/api/links", "{oops")).status).toBe(400);
    expect((await anon.post("/api/links", { url: "https://ok.com" })).status).toBe(401);
  });
});

describe("GET /:slug (redirect)", () => {
  it("redirects with 302, records the click and increments the counter", async () => {
    await api.post("/api/links", { url: "https://example.com/target", slug: "go-now" });

    const res = await api.get("/go-now", { "user-agent": IPHONE_UA, referer: "https://t.me/somechannel" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/target");
    expect(res.headers.get("cache-control")).toContain("no-store");

    const link = await Link.findOne({ slug: "go-now" }).lean();
    expect(link?.clicks).toBe(1);
    expect(link?.lastClickAt).toBeInstanceOf(Date);

    const click = await Click.findOne({ linkId: link!._id }).lean();
    expect(click).toMatchObject({ browser: "Safari", os: "iOS", device: "mobile", referrer: "t.me", isBot: false });
    expect(JSON.stringify(click)).not.toContain("127.0.0.1"); // no raw IPs stored
  });

  it("stores bot hits but does not count them", async () => {
    await api.post("/api/links", { url: "https://example.com", slug: "botty" });
    expect((await api.get("/botty", { "user-agent": BOT_UA })).status).toBe(302);
    const link = await Link.findOne({ slug: "botty" }).lean();
    expect(link?.clicks).toBe(0);
    expect(await Click.countDocuments({ linkId: link!._id, isBot: true })).toBe(1);
  });

  it("returns 404 for unknown slugs and 410 for expired links", async () => {
    expect((await api.get("/nope123")).status).toBe(404);
    expect((await api.get("/favicon.ico")).status).toBe(404);

    // TTL monitor hasn't run yet — the handler must still refuse the redirect.
    await Link.create({ slug: "old", url: "https://example.com", ownerId: OWNER, expiresAt: new Date(Date.now() - 1000) });
    expect((await api.get("/old")).status).toBe(410);
  });

  it("redirects to the dashboard's not-found page when WEB_URL is set", async () => {
    process.env.WEB_URL = "https://dash.example.com";
    try {
      const res = await api.get("/missing");
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("https://dash.example.com/not-found?slug=missing&reason=not_found");
    } finally {
      delete process.env.WEB_URL;
    }
  });
});

describe("GET /api/links", () => {
  it("lists only the caller's links, newest first, with cursor pagination", async () => {
    for (let i = 0; i < 5; i++) await api.post("/api/links", { url: `https://example.com/${i}`, slug: `mine-${i}` });
    await other.post("/api/links", { url: "https://other.com", slug: "theirs" });

    const page1 = await api.get("/api/links?limit=2");
    expect(page1.json.items.map((l: any) => l.slug)).toEqual(["mine-4", "mine-3"]);
    expect(page1.json.nextCursor).toMatch(/^[a-f0-9]{24}$/);

    const page3 = await api.get(`/api/links?limit=2&cursor=${(await api.get(`/api/links?limit=2&cursor=${page1.json.nextCursor}`)).json.nextCursor}`);
    expect(page3.json.items.map((l: any) => l.slug)).toEqual(["mine-0"]);
    expect(page3.json.nextCursor).toBeNull();
  });

  it("hides expired links", async () => {
    await Link.create({ slug: "gone", url: "https://example.com", ownerId: OWNER, expiresAt: new Date(Date.now() - 1) });
    await api.post("/api/links", { url: "https://example.com", slug: "alive" });
    const res = await api.get("/api/links");
    expect(res.json.items.map((l: any) => l.slug)).toEqual(["alive"]);
  });
});

describe("GET /api/links/:slug/stats", () => {
  it("aggregates clicks by day, visitor, browser, device and referrer", async () => {
    await api.post("/api/links", { url: "https://example.com", slug: "insights" });
    // 3 human clicks from 2 visitors, plus 1 bot.
    await api.get("/insights", { "user-agent": CHROME_UA, referer: "https://www.linkedin.com/feed" });
    await api.get("/insights", { "user-agent": CHROME_UA, referer: "https://www.linkedin.com/feed" });
    await api.get("/insights", { "user-agent": IPHONE_UA, "cloudfront-viewer-country": "PL" });
    await api.get("/insights", { "user-agent": BOT_UA });

    const res = await api.get("/api/links/insights/stats?days=7&tz=Europe/Kyiv");
    expect(res.status).toBe(200);
    expect(res.json.link.clicks).toBe(3);
    expect(res.json.totals).toEqual({ clicks: 3, uniqueVisitors: 2, botClicks: 1 });
    expect(res.json.timeline).toHaveLength(7);
    expect(res.json.timeline.at(-1)).toMatchObject({ clicks: 3, uniqueVisitors: 2 });
    expect(res.json.timeline.slice(0, 6).every((d: any) => d.clicks === 0)).toBe(true);
    expect(res.json.hours).toHaveLength(24);
    expect(res.json.browsers).toEqual([{ value: "Chrome", clicks: 2 }, { value: "Safari", clicks: 1 }]);
    expect(res.json.devices).toEqual([{ value: "desktop", clicks: 2 }, { value: "mobile", clicks: 1 }]);
    expect(res.json.referrers).toEqual([{ value: "linkedin.com", clicks: 2 }, { value: "direct", clicks: 1 }]);
    expect(res.json.countries).toEqual([{ value: "ZZ", clicks: 2 }, { value: "PL", clicks: 1 }]);
  });

  it("buckets days in the requested time zone and ignores clicks outside the range", async () => {
    const created = await api.post("/api/links", { url: "https://example.com", slug: "tzone" });
    expect(created.status).toBe(201);
    const link = await Link.findOne({ slug: "tzone" }).lean();
    const now = new Date();
    const mk = (ts: Date, visitorId = "v1") => ({ linkId: link!._id, ts, visitorId, isBot: false });
    await Click.insertMany([
      mk(new Date(now.getTime() - 60_000)),
      mk(new Date(now.getTime() - 2 * 86_400_000), "v2"),
      mk(new Date(now.getTime() - 40 * 86_400_000), "v3"), // outside a 30-day window
    ]);
    const res = await api.get("/api/links/tzone/stats?days=30&tz=UTC");
    expect(res.json.totals.clicks).toBe(2);
    expect(res.json.timeline.reduce((s: number, d: any) => s + d.clicks, 0)).toBe(2);
  });

  it("is only visible to the owner and validates query params", async () => {
    await api.post("/api/links", { url: "https://example.com", slug: "private" });
    expect((await other.get("/api/links/private/stats")).status).toBe(404);
    expect((await api.get("/api/links/private/stats?days=500")).status).toBe(400);
    expect((await api.get("/api/links/private/stats?tz=Mars/Olympus")).status).toBe(400);
  });
});

describe("DELETE /api/links/:slug", () => {
  it("deletes the link and its clicks; other owners get 404", async () => {
    await api.post("/api/links", { url: "https://example.com", slug: "bye" });
    await api.get("/bye", { "user-agent": CHROME_UA });

    expect((await other.del("/api/links/bye")).status).toBe(404);

    const res = await api.del("/api/links/bye");
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ slug: "bye", deletedClicks: 1 });
    expect(await Link.countDocuments()).toBe(0);
    expect(await Click.countDocuments()).toBe(0);
    expect((await api.get("/bye")).status).toBe(404);
  });
});

describe("indexes", () => {
  it("declares the expected indexes", async () => {
    const linkIdx = (await Link.listIndexes()).map((i) => i.name);
    const clickIdx = (await Click.listIndexes()).map((i) => i.name);
    expect(linkIdx).toEqual(expect.arrayContaining(["slug_unique", "owner_recent", "expires_ttl"]));
    expect(clickIdx).toEqual(expect.arrayContaining(["link_bot_ts", "retention_ttl"]));
  });

  it("serves the stats $match from the compound index", async () => {
    const plan: any = await Click.find({ linkId: new Types.ObjectId(), isBot: false, ts: { $gte: new Date(0) } }).explain();
    expect(JSON.stringify(plan.queryPlanner.winningPlan)).toContain("link_bot_ts");
  });
});
