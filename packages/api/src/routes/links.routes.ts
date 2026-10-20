import { HttpError, json, type ApiRequest, type RouteHandler } from "../lib/http.js";
import {
  createLinkSchema,
  listLinksQuerySchema,
  requireOwner,
  requireSlugParam,
  statsQuerySchema,
} from "../lib/validation.js";
import { createLink, deleteLink, getOwnedLink, listLinks, toLinkDto } from "../services/link.service.js";
import { getLinkStats } from "../services/stats.service.js";
import { effectiveTtlDays, guardLinkCreation } from "../services/abuse.service.js";
import { config } from "../config.js";

const shortBase = (req: ApiRequest) => config.shortBaseUrl ?? req.baseUrl;

/** POST /api/links */
export const createLinkRoute: RouteHandler = async (req) => {
  const ownerId = requireOwner(req);
  const { website, ...input } = createLinkSchema.parse(req.body ?? {});
  if (website) throw new HttpError(400, "REJECTED", "Request rejected");

  await guardLinkCreation({ url: input.url, ip: req.ip, baseUrl: shortBase(req) });

  const link = await createLink({ ...input, expiresInDays: effectiveTtlDays(input.expiresInDays), ownerId });
  return json(201, toLinkDto(link, shortBase(req)));
};

/** GET /api/links?limit=&cursor= */
export const listLinksRoute: RouteHandler = async (req) => {
  const ownerId = requireOwner(req);
  const query = listLinksQuerySchema.parse(req.query);
  const { items, nextCursor } = await listLinks(ownerId, query);
  return json(200, { items: items.map((l) => toLinkDto(l, shortBase(req))), nextCursor });
};

/** DELETE /api/links/{slug} */
export const deleteLinkRoute: RouteHandler = async (req) => {
  const ownerId = requireOwner(req);
  const slug = requireSlugParam(req);
  const result = await deleteLink(slug, ownerId);
  return json(200, { slug, ...result });
};

/** GET /api/links/{slug}/stats?days=30&tz=Europe/Kyiv */
export const linkStatsRoute: RouteHandler = async (req) => {
  const ownerId = requireOwner(req);
  const slug = requireSlugParam(req);
  const query = statsQuerySchema.parse(req.query);
  const link = await getOwnedLink(slug, ownerId);
  const stats = await getLinkStats(link._id, query);
  return json(200, { link: toLinkDto(link, shortBase(req)), ...stats });
};
