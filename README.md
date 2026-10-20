# link-short

A serverless URL shortener with click analytics.

**Nuxt 4** (SSR on Lambda) · **AWS Lambda** (Node.js + TypeScript) behind API Gateway · **MongoDB Atlas** with Mongoose · deployed with **SST**.

- Short links with random or custom slugs and optional expiry
- Every click is recorded: day, hour, country, browser, OS, device, referrer
- Unique visitors without storing IP addresses
- Bots and link-preview crawlers (Telegram, Slack, …) are stored but excluded from stats
- Stats dashboard with a 7 / 30 / 90-day range, bucketed in the viewer's time zone

## Architecture

```mermaid
flowchart LR
  user((Visitor)) -->|GET /:slug| apigw[API Gateway<br/>HTTP API]
  owner((Owner)) --> cf[CloudFront] --> nuxt[Nuxt SSR<br/>Lambda]
  nuxt -->|/api/links*| apigw
  apigw --> redirect[redirect λ]
  apigw --> crud[links-* λ]
  apigw --> stats[links-stats λ]
  redirect & crud & stats --> atlas[(MongoDB Atlas)]
```

| Route | Lambda | What it does |
| --- | --- | --- |
| `GET /{slug}` | `redirect` | Looks up the slug, records the click, returns `302` |
| `GET /` | `home` | Redirects to the dashboard |
| `POST /api/links` | `links-create` | Creates a link (`url`, optional `slug`, `expiresInDays`) |
| `GET /api/links` | `links-list` | Caller's links, newest first, cursor pagination |
| `DELETE /api/links/{slug}` | `links-delete` | Deletes a link and its clicks |
| `GET /api/links/{slug}/stats?days=30&tz=Europe/Kyiv` | `links-stats` | Aggregated analytics |

There are no user accounts: the dashboard keeps a random owner id in a cookie and sends it as `x-owner-id`. That is enough for a demo, but it is not authentication.

## MongoDB design

### Collections and indexes

**`links`**

| Index | Purpose |
| --- | --- |
| `{ slug: 1 }` unique | Redirect lookup. Uniqueness is enforced by the index, not by a racy find-then-insert check |
| `{ ownerId: 1, _id: -1 }` | "My links" list: equality on `ownerId`, then sort by `_id` with no in-memory sort; also serves the pagination cursor |
| `{ expiresAt: 1 }` TTL, `expireAfterSeconds: 0`, partial on `{ expiresAt: { $type: "date" } }` | MongoDB deletes expired links. The partial filter keeps links that never expire out of the index |

**`clicks`**: one document per click

| Index | Purpose |
| --- | --- |
| `{ linkId: 1, isBot: 1, ts: 1 }` | Every stats query. Follows the ESR rule: equality fields first, the range field (`ts`) last. Its prefix also serves `deleteMany({ linkId })` |
| `{ ts: 1 }` TTL, 400 days | Retention for raw events |

Check the query plans yourself:

```bash
npm run db:seed && npm run db:explain
# Redirect lookup: LIMIT ← PROJECTION_SIMPLE ← FETCH ← IXSCAN(slug_unique)
# My links:        LIMIT ← FETCH ← IXSCAN(owner_recent)
# Stats $match:    PROJECTION_SIMPLE ← FETCH ← IXSCAN(link_bot_ts)
#   keysExamined: 960 docsExamined: 960 nReturned: 960
```

### Analytics pipeline

See [`stats.service.ts`](packages/api/src/services/stats.service.ts):

1. `$match` on the compound index (`linkId`, `isBot: false`, `ts` range)
2. `$project` down to the aggregated fields, so `$facet` works with small documents
3. `$facet` runs totals, a daily timeline, an hourly histogram and the top countries, browsers, OS, devices and referrers in **one round trip**
4. Unique visitors use a **two-stage `$group`** (by visitor, then count) instead of `$addToSet`, so no single unbounded array is built in memory
5. Days are bucketed with `$dateToString` in the viewer's time zone. Empty days are filled in on the application side, and the window starts at local midnight (DST-safe, covered by tests)

Mongoose does not cast inside `aggregate()`, so `linkId` is passed as an `ObjectId`. Passing a string would make `$match` match nothing, with no error.

### Mongo on Lambda

- **Connection reuse**: the connection promise is cached in module scope, outside the handler, so warm invocations reuse it and concurrent cold-start calls share a single `connect()`. Without this, an Atlas M0 cluster would hit its connection limit quickly.
- `bufferCommands: false` makes queries fail fast when the database is unreachable, instead of hanging until the Lambda timeout. `maxPoolSize: 5` is enough because one container handles one request at a time.
- **`autoIndex` is off**: building indexes on every cold start is wasteful. Indexes are synced explicitly with `npm run db:indexes`, which CI runs after each deploy.
- **Click writes are awaited, not fire-and-forget**: Lambda freezes the container as soon as the handler returns, so an un-awaited write could be lost.
- **Atomic counters**: the link's `clicks` counter is updated with `$inc`, so it stays correct under concurrent clicks without a read-modify-write.

### Other decisions

- **302, not 301**: browsers cache 301 redirects forever, so repeat clicks would never reach the API and wouldn't be counted.
- **Privacy**: `visitorId` is `sha256(salt + day + ip + user-agent)`, so the same person counts once per day, and ids can't be linked across days or turned back into an IP address.
- **Country** is read from CDN headers (`CloudFront-Viewer-Country`, `CF-IPCountry`). The plain API Gateway endpoint doesn't provide one, so put CloudFront or Cloudflare in front of the short domain to fill it; otherwise it shows as "Unknown".
- **Expiry** is checked in the redirect handler as well, because the TTL monitor only runs about once a minute.

## Project structure

```
sst.config.ts                 # Infrastructure: API Gateway, Lambdas, Nuxt site, secrets
packages/api
  src/handlers/*.ts           # Lambda entry points (thin wrappers)
  src/routes/*.ts             # Framework-agnostic route handlers
  src/services/*.ts           # Business logic + aggregation pipeline
  src/models/*.ts             # Mongoose schemas, validation, indexes
  src/lib/lambda.ts           # API Gateway v2 event → request → response adapter
  src/local/app.ts            # Express adapter for local dev and integration tests
  src/scripts/*.ts            # db:indexes, db:seed, db:explain
  test/                       # Vitest: unit + integration against a real in-memory MongoDB
packages/web                  # Nuxt 4 dashboard (SSR), Tailwind CSS v4, hand-drawn SVG charts
```

The same route handlers run both in Lambda (`lib/lambda.ts`) and in Express (`local/app.ts`); only the request/response mapping differs. This keeps local development fast and lets the integration tests exercise real HTTP.

## Local development

Requirements: Node.js 22+, plus Docker (or a MongoDB Atlas connection string).

```bash
npm install
npm run db:up                    # MongoDB 8 in Docker on :27017
cp packages/api/.env.example packages/api/.env
npm run dev                      # API on http://localhost:4000, dashboard on http://localhost:3000
```

To see a populated dashboard, copy the `ls_owner` cookie value from your browser and run:

```bash
npm run db:seed -- <ls_owner value>   # adds /demo with ~60 days of clicks
```

Tests use `mongodb-memory-server`, so no database setup is needed:

```bash
npm test          # 42 tests: unit + HTTP integration + Lambda handler tests
npm run typecheck
```

## Deploying to AWS

1. Create a free **M0** cluster in MongoDB Atlas (same region as the stack, `eu-central-1`) and a database user. Under *Network Access*, allow `0.0.0.0/0`, since Lambda has no fixed IP without a NAT gateway.
2. Configure AWS credentials locally (`aws configure` or SSO).
3. Set secrets and deploy:

```bash
npx sst secret set MongoUri "mongodb+srv://user:pass@cluster.mongodb.net/link-short" --stage production
npx sst secret set VisitorSalt "$(openssl rand -hex 32)" --stage production
npm run deploy
MONGODB_URI="mongodb+srv://..." npm run db:indexes
```

The command prints the API (short-link) URL and the dashboard URL. `npx sst dev` runs the whole stack in a personal stage with live Lambda reloading.

### CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs typecheck, tests and the Nuxt build on every push and PR. Pushes to `main` are deployed when the repository variable `AWS_ROLE_ARN` (an IAM role trusted for GitHub OIDC) and the secret `MONGODB_URI` are set.

## License

MIT
