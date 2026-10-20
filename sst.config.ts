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
 */
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
      link: [mongoUri, visitorSalt],
    });

    const web = new sst.aws.Nuxt("Web", {
      path: "packages/web",
      environment: {
        NUXT_PUBLIC_API_URL: api.url,
      },
    });

    const route = (name: string, memory?: `${number} MB`) => ({
      handler: `packages/api/src/handlers/${name}.handler`,
      memory,
      environment: {
        WEB_URL: web.url,
        NODE_OPTIONS: "--enable-source-maps",
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
