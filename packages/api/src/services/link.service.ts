import mongoose from "mongoose";
import { Link, type LinkDoc } from "../models/link.model.js";
import { Click } from "../models/click.model.js";
import { HttpError, isDuplicateKeyError } from "../lib/http.js";
import { generateSlug } from "../lib/slug.js";
import { DAY_MS } from "../lib/time.js";

const { Types } = mongoose;

export interface LinkDto {
  slug: string;
  url: string;
  shortUrl: string;
  clicks: number;
  lastClickAt: string | null;
  expiresAt: string | null;
  disabled: boolean;
  createdAt: string;
}

type LinkLike = Pick<LinkDoc, "slug" | "url" | "clicks" | "lastClickAt" | "expiresAt" | "createdAt"> & {
  disabledAt?: Date | null;
};

export function toLinkDto(link: LinkLike, baseUrl: string): LinkDto {
  return {
    slug: link.slug,
    url: link.url,
    shortUrl: `${baseUrl.replace(/\/$/, "")}/${link.slug}`,
    clicks: link.clicks ?? 0,
    lastClickAt: link.lastClickAt ? link.lastClickAt.toISOString() : null,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    disabled: Boolean(link.disabledAt),
    createdAt: link.createdAt.toISOString(),
  };
}

const MAX_SLUG_ATTEMPTS = 5;

export async function createLink(input: {
  url: string;
  ownerId: string;
  slug?: string;
  expiresInDays?: number;
}): Promise<LinkDoc> {
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * DAY_MS) : null;
  const base = { url: input.url, ownerId: input.ownerId, expiresAt };

  // Custom slug: uniqueness is enforced by the unique index, not by a
  // find-then-insert check (which would be racy).
  if (input.slug) {
    try {
      return (await Link.create({ ...base, slug: input.slug })).toObject();
    } catch (err) {
      if (isDuplicateKeyError(err)) throw new HttpError(409, "SLUG_TAKEN", `Slug "${input.slug}" is already taken`);
      throw err;
    }
  }

  // Random slug: collisions are astronomically rare, but retry just in case.
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    try {
      return (await Link.create({ ...base, slug: generateSlug() })).toObject();
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
  throw new HttpError(503, "SLUG_GENERATION_FAILED", "Could not generate a unique slug, please retry");
}

export async function listLinks(
  ownerId: string,
  options: { limit: number; cursor?: string },
): Promise<{ items: LinkDoc[]; nextCursor: string | null }> {
  const now = new Date();
  const docs = await Link.find({
    ownerId,
    ...(options.cursor ? { _id: { $lt: new Types.ObjectId(options.cursor) } } : {}),
    // TTL deletion lags up to ~60s, so hide already-expired links explicitly.
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .sort({ _id: -1 }) // served by the { ownerId: 1, _id: -1 } index — no in-memory sort
    .limit(options.limit + 1) // fetch one extra to know whether there's a next page
    .lean<LinkDoc[]>();

  const hasMore = docs.length > options.limit;
  const items = hasMore ? docs.slice(0, options.limit) : docs;
  return { items, nextCursor: hasMore ? items[items.length - 1]!._id.toString() : null };
}

export async function getOwnedLink(slug: string, ownerId: string): Promise<LinkDoc> {
  // Querying by both fields means another owner's link looks exactly like a
  // missing one — we don't leak which slugs exist.
  const link = await Link.findOne({ slug, ownerId }).lean<LinkDoc>();
  if (!link) throw new HttpError(404, "NOT_FOUND", "Link not found");
  return link;
}

export async function deleteLink(slug: string, ownerId: string): Promise<{ deletedClicks: number }> {
  const link = await Link.findOneAndDelete({ slug, ownerId }).lean<LinkDoc>();
  if (!link) throw new HttpError(404, "NOT_FOUND", "Link not found");

  // Not wrapped in a transaction on purpose: if this step fails the leftover
  // clicks are unreachable and will be removed by the clicks TTL index anyway.
  const { deletedCount } = await Click.deleteMany({ linkId: link._id });
  return { deletedClicks: deletedCount };
}
