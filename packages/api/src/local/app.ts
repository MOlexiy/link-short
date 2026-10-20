import express, { type Request, type Response, type NextFunction } from "express";
import { HttpError, toErrorResponse, type ApiRequest, type ApiResponse } from "../lib/http.js";
import { OWNER_HEADER } from "../lib/validation.js";
import { routes } from "../routes/index.js";

/**
 * Express adapter used for local development and integration tests.
 * It runs exactly the same route handlers as the Lambdas — only the
 * request/response mapping differs.
 */
export function createApp() {
  const app = express();
  app.set("trust proxy", true);
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", `content-type, ${OWNER_HEADER}`);
    res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: "16kb" }));

  for (const route of routes) {
    const method = route.method.toLowerCase() as "get" | "post" | "delete";
    app[method](route.path, async (req: Request, res: Response) => {
      send(res, await runRoute(route.handler, toApiRequest(req)));
    });
  }

  // Malformed JSON from express.json() and anything else that escaped.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const isJsonError = err instanceof SyntaxError && "body" in err;
    send(res, toErrorResponse(isJsonError ? new HttpError(400, "INVALID_JSON", "Request body must be valid JSON") : err));
  });

  return app;
}

async function runRoute(handler: (req: ApiRequest) => Promise<ApiResponse>, req: ApiRequest) {
  try {
    return await handler(req);
  } catch (err) {
    return toErrorResponse(err);
  }
}

function toApiRequest(req: Request): ApiRequest {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  const query: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.query)) {
    query[key] = typeof value === "string" ? value : undefined;
  }
  return {
    method: req.method,
    path: req.path,
    params: { ...req.params } as Record<string, string | undefined>,
    query,
    headers,
    body: req.body,
    ip: req.ip ?? "0.0.0.0",
    baseUrl: `${req.protocol}://${req.get("host")}`,
  };
}

function send(res: Response, out: ApiResponse) {
  for (const [key, value] of Object.entries(out.headers ?? {})) res.setHeader(key, value);
  res.status(out.status);
  if (out.body === undefined) res.end();
  else if (typeof out.body === "string") res.type("text/plain").send(out.body);
  else res.json(out.body);
}
