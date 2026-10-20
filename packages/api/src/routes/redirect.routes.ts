import { json, redirect, type RouteHandler } from "../lib/http.js";
import { slugSchema } from "../lib/validation.js";
import { findRedirectTarget, recordClick } from "../services/click.service.js";
import { config } from "../config.js";

function notFound(reason: "not_found" | "expired", slug: string) {
  // If the dashboard URL is known, send people to a friendly page instead of raw JSON.
  if (config.webUrl) {
    const target = new URL("/not-found", config.webUrl);
    target.searchParams.set("slug", slug);
    target.searchParams.set("reason", reason);
    return redirect(target.toString(), 302);
  }
  return reason === "expired"
    ? json(410, { error: { code: "EXPIRED", message: "This link has expired" } })
    : json(404, { error: { code: "NOT_FOUND", message: "Link not found" } });
}

/** GET /{slug} — the hot path. */
export const redirectRoute: RouteHandler = async (req) => {
  const parsed = slugSchema.safeParse(req.params.slug ?? "");
  if (!parsed.success) return notFound("not_found", req.params.slug ?? "");
  const slug = parsed.data;

  const target = await findRedirectTarget(slug);
  if (target.status !== "ok") return notFound(target.status, slug);

  await recordClick(target.linkId, {
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    referrer: req.headers["referer"],
    headers: req.headers,
  });

  // 302, not 301: browsers cache 301 forever and repeat clicks would never reach us.
  return redirect(target.url, 302);
};

/** GET / on the short domain → the dashboard. */
export const homeRoute: RouteHandler = async () =>
  config.webUrl ? redirect(config.webUrl, 302) : json(200, { name: "link-short", status: "ok" });
