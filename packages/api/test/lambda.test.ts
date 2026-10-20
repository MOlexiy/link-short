import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { startTestDb, stopTestDb } from "./helpers/db.js";
import { CHROME_UA, OWNER } from "./helpers/http.js";
import { handler as createHandler } from "../src/handlers/links-create.js";
import { handler as redirectHandler } from "../src/handlers/redirect.js";
import { handler as homeHandler } from "../src/handlers/home.js";

function event(overrides: Partial<APIGatewayProxyEventV2> & { method?: string; path?: string } = {}): APIGatewayProxyEventV2 {
  const { method = "GET", path = "/", ...rest } = overrides;
  return {
    version: "2.0",
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: "",
    headers: {},
    isBase64Encoded: false,
    requestContext: {
      accountId: "123",
      apiId: "abc",
      domainName: "abc.execute-api.eu-central-1.amazonaws.com",
      domainPrefix: "abc",
      requestId: "req",
      routeKey: `${method} ${path}`,
      stage: "$default",
      time: "",
      timeEpoch: Date.now(),
      http: { method, path, protocol: "HTTP/1.1", sourceIp: "203.0.113.7", userAgent: "" },
    },
    ...rest,
  } as APIGatewayProxyEventV2;
}

beforeAll(async () => {
  delete process.env.WEB_URL;
  await startTestDb();
});
afterAll(stopTestDb);

describe("Lambda handlers (API Gateway HTTP API v2 payload)", () => {
  it("creates a link from a base64-encoded body and builds the short URL from the API domain", async () => {
    const res = (await createHandler(
      event({
        method: "POST",
        path: "/api/links",
        headers: { "Content-Type": "application/json", "X-Owner-Id": OWNER },
        isBase64Encoded: true,
        body: Buffer.from(JSON.stringify({ url: "https://example.com", slug: "lambda" })).toString("base64"),
      }),
    )) as APIGatewayProxyStructuredResultV2;

    expect(res.statusCode).toBe(201);
    expect(res.headers?.["content-type"]).toBe("application/json");
    expect(JSON.parse(res.body!).shortUrl).toBe("https://abc.execute-api.eu-central-1.amazonaws.com/lambda");
  });

  it("returns a 302 from the redirect handler", async () => {
    const res = (await redirectHandler(
      event({ path: "/lambda", pathParameters: { slug: "lambda" }, headers: { "user-agent": CHROME_UA } }),
    )) as APIGatewayProxyStructuredResultV2;
    expect(res.statusCode).toBe(302);
    expect(res.headers?.location).toBe("https://example.com");
  });

  it("maps invalid JSON to 400 instead of crashing", async () => {
    const res = (await createHandler(
      event({ method: "POST", path: "/api/links", headers: { "x-owner-id": OWNER }, body: "{nope" }),
    )) as APIGatewayProxyStructuredResultV2;
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body!).error.code).toBe("INVALID_JSON");
  });

  it("home handler works without a database", async () => {
    const res = (await homeHandler(event())) as APIGatewayProxyStructuredResultV2;
    expect(res.statusCode).toBe(200);
  });
});
