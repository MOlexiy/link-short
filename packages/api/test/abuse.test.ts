import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { Link } from "../src/models/link.model.js";
import { assertUrlAllowed } from "../src/lib/url-policy.js";
import { HttpError } from "../src/lib/http.js";
import { handler as createHandler } from "../src/handlers/links-create.js";
import { clearDb, startTestDb, stopTestDb } from "./helpers/db.js";
import { CHROME_UA, OWNER, client, startServer } from "./helpers/http.js";

const ENV_KEYS = [
  "RATE_LIMIT_CREATE_PER_HOUR",
  "RATE_LIMIT_CREATE_PER_DAY",
  "RATE_LIMIT_GLOBAL_CREATE_PER_DAY",
  "MAX_LINK_TTL_DAYS",
  "BLOCKED_DOMAINS",
  "SAFE_BROWSING_API_KEY",
];

let server: Server;
let base: string;
let api: ReturnType<typeof client>;

/** Simulates requests from different client IPs (the local server trusts X-Forwarded-For). */
const fromIp = (ip: string, body: unknown) =>
  api.request("POST", "/api/links", body, { "x-forwarded-for": ip });

beforeAll(async () => {
  delete process.env.WEB_URL;
  await startTestDb();
  ({ server, base } = await startServer());
  api = client(base);
});

afterAll(async () => {
  server?.close();
  await stopTestDb();
});

beforeEach(clearDb);

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  vi.restoreAllMocks();
});

describe("URL policy", () => {
  const ctx = { ownHosts: ["lnk.example.com"], blockedDomains: ["evil.test"] };
  const codeOf = (url: string) => {
    try {
      assertUrlAllowed(url, ctx);
      return "OK";
    } catch (err) {
      return err instanceof HttpError ? err.code : "THROWN";
    }
  };

  it.each([
    ["https://example.com/page", "OK"],
    ["https://xn--j1amh/", "URL_PRIVATE_HOST"], // a bare TLD, not a real site
    ["https://xn--80aaxitdbjk.xn--j1amh/", "OK"], // Cyrillic .укр domains stay allowed
    ["https://google.com@phish.example/login", "URL_CREDENTIALS"],
    ["http://user:pass@example.com", "URL_CREDENTIALS"],
    ["http://192.168.0.1/admin", "URL_IP_ADDRESS"],
    ["http://[::1]:8080/", "URL_IP_ADDRESS"],
    ["http://localhost:3000", "URL_PRIVATE_HOST"],
    ["http://printer.local/", "URL_PRIVATE_HOST"],
    ["https://lnk.example.com/abc", "URL_SELF"],
    ["https://bit.ly/3xyz", "URL_SHORTENER"],
    ["https://www.tinyurl.com/abc", "URL_SHORTENER"],
    ["https://login.evil.test/", "URL_BLOCKED"],
    ["https://notevil.test.example.com/", "OK"],
  ])("%s → %s", (url, expected) => {
    expect(codeOf(url)).toBe(expected);
  });
});

describe("rate limiting", () => {
  it("allows N creations per IP per hour, then 429 with Retry-After", async () => {
    process.env.RATE_LIMIT_CREATE_PER_HOUR = "2";

    expect((await fromIp("203.0.113.1", { url: "https://example.com/1" })).status).toBe(201);
    expect((await fromIp("203.0.113.1", { url: "https://example.com/2" })).status).toBe(201);

    const blocked = await fromIp("203.0.113.1", { url: "https://example.com/3" });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe("RATE_LIMITED");
    expect(blocked.json.error.message).toMatch(/Try again in/);
    const retryAfter = Number(blocked.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(3600);

    // Another client is unaffected.
    expect((await fromIp("203.0.113.2", { url: "https://example.com/4" })).status).toBe(201);
    expect(await Link.countDocuments()).toBe(3);
  });

  it("is atomic under concurrency: exactly `limit` of 20 parallel requests succeed", async () => {
    process.env.RATE_LIMIT_CREATE_PER_HOUR = "5";
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => fromIp("203.0.113.9", { url: `https://example.com/${i}` })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(15);
  });

  it("caps the whole service per day across all IPs", async () => {
    process.env.RATE_LIMIT_GLOBAL_CREATE_PER_DAY = "3";
    for (let i = 1; i <= 3; i++) expect((await fromIp(`198.51.100.${i}`, { url: "https://example.com" })).status).toBe(201);
    const blocked = await fromIp("198.51.100.99", { url: "https://example.com" });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.message).toMatch(/today's limit/);
  });

  it("does not count requests rejected by validation or URL policy", async () => {
    process.env.RATE_LIMIT_CREATE_PER_HOUR = "1";
    expect((await fromIp("203.0.113.5", { url: "javascript:alert(1)" })).status).toBe(400);
    expect((await fromIp("203.0.113.5", { url: "https://bit.ly/x" })).status).toBe(422);
    expect((await fromIp("203.0.113.5", { url: "https://example.com" })).status).toBe(201);
  });

  it("stores only hashed IPs in the counters", async () => {
    await fromIp("203.0.113.77", { url: "https://example.com" });
    const ids = (await Link.db.collection("rate_limits").find().toArray()).map((d) => String(d._id));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.join(" ")).not.toContain("203.0.113.77");
  });
});

describe("other creation guards", () => {
  it("rejects requests that fill the honeypot field", async () => {
    const res = await api.post("/api/links", { url: "https://example.com", website: "http://spam.example" });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("REJECTED");
    expect(await Link.countDocuments()).toBe(0);
  });

  it("refuses blocked URLs with a 422 and a clear message", async () => {
    const res = await api.post("/api/links", { url: "https://bit.ly/abc" });
    expect(res.status).toBe(422);
    expect(res.json.error).toMatchObject({ code: "URL_SHORTENER" });
    expect(res.json.error.message).toMatch(/final destination/);
  });

  it("applies extra domains from BLOCKED_DOMAINS", async () => {
    process.env.BLOCKED_DOMAINS = "spam.example, evil.example";
    expect((await api.post("/api/links", { url: "https://www.evil.example/x" })).status).toBe(422);
  });

  it("forces a maximum lifetime when MAX_LINK_TTL_DAYS is set", async () => {
    process.env.MAX_LINK_TTL_DAYS = "7";
    const days = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);

    expect(days((await api.post("/api/links", { url: "https://example.com", slug: "never" })).json.expiresAt)).toBe(7);
    expect(days((await api.post("/api/links", { url: "https://example.com", slug: "long", expiresInDays: 90 })).json.expiresAt)).toBe(7);
    expect(days((await api.post("/api/links", { url: "https://example.com", slug: "short", expiresInDays: 2 })).json.expiresAt)).toBe(2);
  });

  it("returns 413 for oversized bodies (Express and Lambda)", async () => {
    const huge = { url: `https://example.com/${"a".repeat(20_000)}` };
    expect((await api.post("/api/links", huge)).status).toBe(413);

    const res = (await createHandler({
      rawPath: "/api/links",
      headers: { "x-owner-id": OWNER },
      body: JSON.stringify(huge),
      isBase64Encoded: false,
      requestContext: { domainName: "x.example.com", http: { method: "POST", sourceIp: "203.0.113.1" } },
    } as never)) as APIGatewayProxyStructuredResultV2;
    expect(res.statusCode).toBe(413);
  });
});

describe("Google Safe Browsing", () => {
  const realFetch = globalThis.fetch;

  function mockGoogle(respond: () => Promise<Response>) {
    const calls: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.startsWith("https://safebrowsing.googleapis.com/")) return realFetch(input, init);
      calls.push(JSON.parse(String(init?.body)));
      return respond();
    });
    return calls;
  }

  it("blocks URLs that Google flags", async () => {
    process.env.SAFE_BROWSING_API_KEY = "test-key";
    const calls = mockGoogle(async () =>
      Response.json({ matches: [{ threatType: "SOCIAL_ENGINEERING", threat: { url: "https://phish.example/" } }] }),
    );

    const res = await api.post("/api/links", { url: "https://phish.example/" });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("URL_UNSAFE");
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0])).toContain("https://phish.example/");
  });

  it("allows clean URLs", async () => {
    process.env.SAFE_BROWSING_API_KEY = "test-key";
    mockGoogle(async () => Response.json({}));
    expect((await api.post("/api/links", { url: "https://example.com" })).status).toBe(201);
  });

  it("fails open when Google is unavailable", async () => {
    process.env.SAFE_BROWSING_API_KEY = "test-key";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGoogle(async () => new Response("unavailable", { status: 503 }));
    expect((await api.post("/api/links", { url: "https://example.com" })).status).toBe(201);
  });

  it("is skipped entirely without an API key", async () => {
    const calls = mockGoogle(async () => Response.json({}));
    expect((await api.post("/api/links", { url: "https://example.com" })).status).toBe(201);
    expect(calls).toHaveLength(0);
  });
});

describe("disabled links", () => {
  it("stop redirecting but stay visible to the owner", async () => {
    await api.post("/api/links", { url: "https://example.com", slug: "reported" });
    await Link.updateOne({ slug: "reported" }, { $set: { disabledAt: new Date(), disabledReason: "phishing" } });

    const res = await api.get("/reported", { "user-agent": CHROME_UA });
    expect(res.status).toBe(410);
    expect(res.json.error.code).toBe("DISABLED");

    const list = await api.get("/api/links");
    expect(list.json.items[0]).toMatchObject({ slug: "reported", disabled: true, clicks: 0 });
  });
});
