import { z } from "zod";
import { HttpError, type ApiRequest } from "./http.js";
import { SLUG_PATTERN, isReservedSlug } from "./slug.js";
import { MAX_URL_LENGTH, isHttpUrl } from "./url.js";
import { isValidTimeZone } from "./time.js";

export const OWNER_HEADER = "x-owner-id";
const OWNER_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export const slugSchema = z
  .string()
  .trim()
  .regex(SLUG_PATTERN, "Slug may contain only letters, digits, '-' and '_' (3–32 characters)")
  .refine((s) => !isReservedSlug(s), "This slug is reserved");

export const createLinkSchema = z.strictObject({
  url: z
    .string()
    .trim()
    .max(MAX_URL_LENGTH, `URL must be at most ${MAX_URL_LENGTH} characters`)
    .refine(isHttpUrl, "Enter an absolute http:// or https:// URL"),
  slug: slugSchema.optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  /** Honeypot: hidden in the form, so only bots fill it in. */
  website: z.string().max(200).optional(),
});
export type CreateLinkInput = z.infer<typeof createLinkSchema>;

export const listLinksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z
    .string()
    .regex(/^[a-f0-9]{24}$/, "Invalid cursor")
    .optional(),
});

export const statsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
  tz: z.string().default("UTC").refine(isValidTimeZone, "Unknown time zone"),
});

/** Anonymous ownership: the dashboard sends a random id it keeps in a cookie. */
export function requireOwner(req: ApiRequest): string {
  const ownerId = req.headers[OWNER_HEADER]?.trim();
  if (!ownerId || !OWNER_PATTERN.test(ownerId)) {
    throw new HttpError(401, "OWNER_REQUIRED", `Missing or invalid ${OWNER_HEADER} header`);
  }
  return ownerId;
}

export function requireSlugParam(req: ApiRequest): string {
  const result = slugSchema.safeParse(req.params.slug ?? "");
  if (!result.success) throw new HttpError(404, "NOT_FOUND", "Link not found");
  return result.data;
}
