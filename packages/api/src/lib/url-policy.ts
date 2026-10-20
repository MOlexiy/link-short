import { HttpError } from "./http.js";

/**
 * Other shorteners are the classic way to hide a malicious destination behind
 * a chain of redirects — refusing them means the target is always visible.
 */
export const BLOCKED_SHORTENERS = [
  "bit.ly",
  "bitly.com",
  "buff.ly",
  "cutt.ly",
  "goo.gl",
  "is.gd",
  "lnkd.in",
  "ow.ly",
  "rb.gy",
  "rebrand.ly",
  "s.id",
  "shorturl.at",
  "t.co",
  "t.ly",
  "tiny.cc",
  "tinyurl.com",
  "v.gd",
];

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** host === domain or host is a subdomain of it. */
export function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export interface UrlPolicyContext {
  /** Hosts this service answers on — linking to them would create redirect loops. */
  ownHosts: string[];
  /** Additional blocked domains from configuration. */
  blockedDomains?: string[];
}

/**
 * Cheap, synchronous checks that run before anything touches the database.
 * Throws HttpError(422) with a message that tells the user what to change.
 */
export function assertUrlAllowed(rawUrl: string, ctx: UrlPolicyContext): void {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");

  const reject = (code: string, message: string): never => {
    throw new HttpError(422, code, message);
  };

  // https://google.com@evil.example/ — the part before "@" is shown to people,
  // but the browser goes to evil.example.
  if (url.username || url.password) {
    reject("URL_CREDENTIALS", "Links with a username or password in them aren't allowed");
  }

  if (IPV4.test(host) || host.startsWith("[")) {
    reject("URL_IP_ADDRESS", "Use a domain name instead of an IP address");
  }

  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    reject("URL_PRIVATE_HOST", "Links to local or private hosts aren't allowed");
  }

  if (ctx.ownHosts.some((own) => own && hostMatches(host, own.toLowerCase()))) {
    reject("URL_SELF", "That's already a short link from this service");
  }

  if (BLOCKED_SHORTENERS.some((d) => hostMatches(host, d))) {
    reject("URL_SHORTENER", "Links to other URL shorteners aren't allowed. Use the final destination instead");
  }

  if (ctx.blockedDomains?.some((d) => hostMatches(host, d))) {
    reject("URL_BLOCKED", "Links to this domain aren't allowed");
  }
}

export function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
