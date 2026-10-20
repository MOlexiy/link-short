import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { connectDb } from "../db/connection.js";
import { HttpError, parseJsonBody, toErrorResponse, type ApiRequest, type ApiResponse, type RouteHandler } from "./http.js";

/** Same limit as express.json() in the local server. The URL is the only large field. */
export const MAX_BODY_BYTES = 16 * 1024;

export interface HandlerOptions {
  /** Skip the DB connection for routes that don't need it. */
  db?: boolean;
}

export function toApiRequest(event: APIGatewayProxyEventV2): ApiRequest {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(event.headers ?? {})) headers[key.toLowerCase()] = value;

  const rawBody =
    event.body && event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;

  return {
    method: event.requestContext.http.method,
    path: event.rawPath,
    params: event.pathParameters ?? {},
    query: event.queryStringParameters ?? {},
    headers,
    body: rawBody,
    ip: event.requestContext.http.sourceIp,
    baseUrl: `https://${event.requestContext.domainName}`,
  };
}

export function toLambdaResult(res: ApiResponse): APIGatewayProxyResultV2 {
  const isString = typeof res.body === "string";
  return {
    statusCode: res.status,
    headers: {
      ...(res.body !== undefined ? { "content-type": isString ? "text/plain; charset=utf-8" : "application/json" } : {}),
      ...res.headers,
    },
    body: res.body === undefined ? "" : isString ? (res.body as string) : JSON.stringify(res.body),
  };
}

/** Wraps a framework-agnostic route into an API Gateway (HTTP API, payload v2) Lambda handler. */
export function lambda(route: RouteHandler, options: HandlerOptions = {}) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const started = Date.now();
    let res: ApiResponse;
    try {
      const req = toApiRequest(event);
      if (typeof req.body === "string" && Buffer.byteLength(req.body) > MAX_BODY_BYTES) {
        throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
      }
      req.body = parseJsonBody(req.body as string | undefined);
      if (options.db !== false) await connectDb();
      res = await route(req);
    } catch (err) {
      res = toErrorResponse(err);
    }
    console.log(
      JSON.stringify({
        level: "info",
        method: event.requestContext.http.method,
        path: event.rawPath,
        status: res.status,
        ms: Date.now() - started,
      }),
    );
    return toLambdaResult(res);
  };
}
