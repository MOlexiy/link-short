/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Infrastructure:
 *   - HTTP API (API Gateway v2) → one Lambda per route (Node.js 24, arm64)
 *   - Nuxt 4 SSR app → Lambda + CloudFront + S3 (via sst.aws.Nuxt)
 *   - MongoDB Atlas connection string stored as an encrypted SST secret
 *
 * Set secrets once per stage:
 *   npx sst secret set MongoUri "mongodb+srv://..." --stage production
 *   npx sst secret set VisitorSalt "$(openssl rand -hex 32)" --stage production
 *   npx sst secret set SafeBrowsingKey "<google api key>" --stage production   # optional
 */

/**
 * Abuse protection for a public, anonymous shortener (see README → Security).
 * Per-IP limits live in MongoDB; API Gateway throttling caps total request rate.
 */
const protection = {
  maxLinkTtlDays: 7, // every link expires within a week
  createPerIpPerHour: 10,
  createPerIpPerDay: 30,
  createGlobalPerDay: 1000,
  blockedDomains: "", // extra comma-separated domains, on top of the built-in list
  apiRateLimit: 50, // requests/second across the whole API (steady state)
  apiBurstLimit: 100,
};

export default $config({
  app(input) {
    const isProd = input?.stage === "production";
    return {
      name: "link-short",
      home: "aws",
      removal: isProd ? "retain" : "remove",
      protect: isProd,
      providers: {
        aws: { region: "eu-central-1" },
      },
    };
  },

  async run() {
    const mongoUri = new sst.Secret("MongoUri");
    const visitorSalt = new sst.Secret("VisitorSalt", "local-dev-salt");
    const safeBrowsingKey = new sst.Secret("SafeBrowsingKey", ""); // empty = check disabled

    // Defaults for every Lambda in the app.
    $transform(sst.aws.Function, (args) => {
      args.architecture ??= "arm64";
      args.memory ??= "512 MB";
      args.timeout ??= "10 seconds";
      args.logging ??= { retention: "1 month" };
    });

    const api = new sst.aws.ApiGatewayV2("Api", {
      cors: {
        allowOrigins: ["*"],
        allowHeaders: ["content-type", "x-owner-id"],
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        maxAge: "1 day",
      },
      // Every route handler gets access to these secrets via `Resource.*`.
      link: [mongoUri, visitorSalt, safeBrowsingKey],
      transform: {
        // Account-level safety net: beyond this API Gateway answers 429 itself,
        // before any Lambda (or bill) is involved.
        stage: (args) => {
          args.defaultRouteSettings = {
            throttlingRateLimit: protection.apiRateLimit,
            throttlingBurstLimit: protection.apiBurstLimit,
          };
        },
      },
    });

    const web = new sst.aws.Nuxt("Web", {
      path: "packages/web",
      environment: {
        NUXT_PUBLIC_API_URL: api.url,
        NUXT_PUBLIC_MAX_LINK_TTL_DAYS: String(protection.maxLinkTtlDays),
      },
    });

    const route = (name: string, memory?: `${number} MB`) => ({
      handler: `packages/api/src/handlers/${name}.handler`,
      memory,
      environment: {
        WEB_URL: web.url,
        NODE_OPTIONS: "--enable-source-maps",
        MAX_LINK_TTL_DAYS: String(protection.maxLinkTtlDays),
        RATE_LIMIT_CREATE_PER_HOUR: String(protection.createPerIpPerHour),
        RATE_LIMIT_CREATE_PER_DAY: String(protection.createPerIpPerDay),
        RATE_LIMIT_GLOBAL_CREATE_PER_DAY: String(protection.createGlobalPerDay),
        BLOCKED_DOMAINS: protection.blockedDomains,
      },
    });

    // Management API (used by the dashboard)
    api.route("POST /api/links", route("links-create"));
    api.route("GET /api/links", route("links-list"));
    api.route("DELETE /api/links/{slug}", route("links-delete"));
    api.route("GET /api/links/{slug}/stats", route("links-stats"));

    // Public short links. The redirect is on the hot path, so it gets more
    // memory (= more CPU on Lambda) to keep cold starts and p99 latency low.
    api.route("GET /", route("home"));
    api.route("GET /{slug}", route("redirect", "1024 MB"));

    return {
      api: api.url,
      web: web.url,
    };
  },
});
