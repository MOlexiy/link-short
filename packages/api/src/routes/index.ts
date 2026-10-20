import type { RouteHandler } from "../lib/http.js";
import { createLinkRoute, deleteLinkRoute, linkStatsRoute, listLinksRoute } from "./links.routes.js";
import { homeRoute, redirectRoute } from "./redirect.routes.js";

export interface RouteDef {
  method: "GET" | "POST" | "DELETE";
  /** Express-style path; mirrors the API Gateway routes in sst.config.ts. */
  path: string;
  handler: RouteHandler;
}

/** Single source of truth for the local Express server. Order matters: specific routes first. */
export const routes: RouteDef[] = [
  { method: "POST", path: "/api/links", handler: createLinkRoute },
  { method: "GET", path: "/api/links", handler: listLinksRoute },
  { method: "DELETE", path: "/api/links/:slug", handler: deleteLinkRoute },
  { method: "GET", path: "/api/links/:slug/stats", handler: linkStatsRoute },
  { method: "GET", path: "/", handler: homeRoute },
  { method: "GET", path: "/:slug", handler: redirectRoute },
];
