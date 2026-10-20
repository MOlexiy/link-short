import { Resource } from "sst";

type SecretName = "MongoUri" | "VisitorSalt" | "SafeBrowsingKey";

/**
 * In AWS the values come from linked SST secrets (`Resource.*`).
 * Locally (Express server, tests, scripts) they come from env variables.
 */
function readSecret(name: SecretName): string | undefined {
  try {
    const resources = Resource as unknown as Record<string, { value?: string } | undefined>;
    return resources[name]?.value;
  } catch {
    // Accessing Resource outside of an SST-linked runtime throws — that's fine locally.
    return undefined;
  }
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}

const isLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function listEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  get mongoUri(): string {
    const local = isLambda ? undefined : "mongodb://127.0.0.1:27017/link-short";
    return required("MONGODB_URI / MongoUri secret", process.env.MONGODB_URI ?? readSecret("MongoUri") ?? local);
  },
  get visitorSalt(): string {
    return process.env.VISITOR_SALT ?? readSecret("VisitorSalt") ?? "local-dev-salt";
  },
  /** Public URL of the Nuxt dashboard (used for "/" and "link not found" redirects). */
  get webUrl(): string | undefined {
    return process.env.WEB_URL || undefined;
  },
  /** Overrides the host used to build short URLs (e.g. a custom domain). */
  get shortBaseUrl(): string | undefined {
    return process.env.SHORT_BASE_URL || undefined;
  },
  /**
   * Building indexes on every cold start is wasteful and can hurt a busy
   * cluster, so in Lambda indexes are managed explicitly (`npm run db:indexes`).
   */
  get autoIndex(): boolean {
    return process.env.MONGO_AUTO_INDEX === "true";
  },

  // ---- Abuse protection -------------------------------------------------

  /**
   * Upper bound for a link's lifetime. 0 = links may live forever.
   * The public demo sets it, so whatever gets shortened disappears on its own.
   */
  get maxLinkTtlDays(): number {
    return intEnv("MAX_LINK_TTL_DAYS", 0);
  },
  /** Link creations allowed per client IP (0 disables a limit). */
  get createLimitPerHour(): number {
    return intEnv("RATE_LIMIT_CREATE_PER_HOUR", 10);
  },
  get createLimitPerDay(): number {
    return intEnv("RATE_LIMIT_CREATE_PER_DAY", 30);
  },
  /** Circuit breaker for the whole service — caps the damage of a distributed attack. */
  get globalCreateLimitPerDay(): number {
    return intEnv("RATE_LIMIT_GLOBAL_CREATE_PER_DAY", 1000);
  },
  /** Extra domains to refuse, comma-separated (on top of the built-in list). */
  get blockedDomains(): string[] {
    return listEnv("BLOCKED_DOMAINS");
  },
  /** Google Safe Browsing API key. Empty = check disabled. */
  get safeBrowsingKey(): string | undefined {
    return process.env.SAFE_BROWSING_API_KEY || readSecret("SafeBrowsingKey") || undefined;
  },
};
