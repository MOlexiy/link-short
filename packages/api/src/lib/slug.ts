import { customAlphabet } from "nanoid";

/** Base62 → URL-safe, no ambiguous encoding. 62^7 ≈ 3.5 trillion combinations. */
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const GENERATED_SLUG_LENGTH = 7;

export const generateSlug = customAlphabet(BASE62, GENERATED_SLUG_LENGTH);

export const SLUG_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

/** Slugs that would collide with API routes or look like system pages. */
export const RESERVED_SLUGS = new Set([
  "api",
  "admin",
  "app",
  "assets",
  "dashboard",
  "favicon.ico",
  "health",
  "links",
  "login",
  "robots.txt",
  "static",
  "stats",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
