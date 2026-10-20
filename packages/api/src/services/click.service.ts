import type { Types } from "mongoose";
import { Link } from "../models/link.model.js";
import { Click } from "../models/click.model.js";
import { parseUserAgent } from "../lib/user-agent.js";
import { countryFromHeaders, visitorId } from "../lib/visitor.js";
import { referrerHost } from "../lib/url.js";
import { config } from "../config.js";

export type RedirectLookup =
  | { status: "ok"; linkId: Types.ObjectId; url: string }
  | { status: "not_found" }
  | { status: "expired" };

export async function findRedirectTarget(slug: string): Promise<RedirectLookup> {
  // Projection keeps the document small — only what the redirect needs.
  const link = await Link.findOne({ slug }, { url: 1, expiresAt: 1 }).lean<{
    _id: Types.ObjectId;
    url: string;
    expiresAt: Date | null;
  }>();

  if (!link) return { status: "not_found" };
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return { status: "expired" };
  return { status: "ok", linkId: link._id, url: link.url };
}

export interface ClickContext {
  ip: string;
  userAgent: string | undefined;
  referrer: string | undefined;
  headers: Record<string, string | undefined>;
  at?: Date;
}

export async function recordClick(linkId: Types.ObjectId, ctx: ClickContext): Promise<{ isBot: boolean }> {
  const at = ctx.at ?? new Date();
  const ua = parseUserAgent(ctx.userAgent);

  const writes: Promise<unknown>[] = [
    Click.create({
      linkId,
      ts: at,
      visitorId: visitorId({ ip: ctx.ip, userAgent: ctx.userAgent ?? "", salt: config.visitorSalt, at }),
      country: countryFromHeaders(ctx.headers),
      browser: ua.browser,
      os: ua.os,
      device: ua.device,
      referrer: referrerHost(ctx.referrer),
      isBot: ua.isBot,
    }),
  ];

  if (!ua.isBot) {
    // Atomic $inc — safe under concurrent clicks, no read-modify-write.
    writes.push(Link.updateOne({ _id: linkId }, { $inc: { clicks: 1 }, $set: { lastClickAt: at } }));
  }

  // Awaited (not fire-and-forget): Lambda freezes the container as soon as the
  // handler returns, so un-awaited writes could be lost or leak into the next request.
  await Promise.all(writes);
  return { isBot: ua.isBot };
}
