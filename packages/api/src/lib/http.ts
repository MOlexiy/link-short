import mongoose from "mongoose";
import { ZodError } from "zod";

/** Framework-agnostic request — built from either an API Gateway event or an Express request. */
export interface ApiRequest {
  method: string;
  path: string;
  params: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  /** Lower-cased header names. */
  headers: Record<string, string | undefined>;
  body: unknown;
  ip: string;
  /** e.g. https://abc123.execute-api.eu-central-1.amazonaws.com */
  baseUrl: string;
}

export interface ApiResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type RouteHandler = (req: ApiRequest) => Promise<ApiResponse>;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const json = (status: number, body: unknown, headers?: Record<string, string>): ApiResponse => ({
  status,
  body,
  headers,
});

export const redirect = (location: string, status: 301 | 302 | 307 | 308 = 302): ApiResponse => ({
  status,
  headers: {
    location,
    // Never cache redirects in the browser/CDN, otherwise repeat clicks aren't counted.
    "cache-control": "private, no-store, max-age=0",
  },
});

export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000;
}

export function parseJsonBody(raw: string | undefined | null): unknown {
  if (raw === undefined || raw === null || raw === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}

/** Maps any thrown error to a consistent JSON error shape: { error: { code, message, details? } }. */
export function toErrorResponse(err: unknown): ApiResponse {
  if (err instanceof HttpError) {
    return json(err.status, { error: { code: err.code, message: err.message, details: err.details } }, err.headers);
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return json(400, { error: { code: "VALIDATION_ERROR", message: details[0]?.message ?? "Invalid request", details } });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    return json(400, { error: { code: "VALIDATION_ERROR", message: details[0]?.message ?? "Invalid data", details } });
  }
  if (isDuplicateKeyError(err)) {
    return json(409, { error: { code: "DUPLICATE", message: "Resource already exists" } });
  }

  console.error(
    JSON.stringify({ level: "error", msg: "Unhandled error", error: err instanceof Error ? err.stack : String(err) }),
  );
  return json(500, { error: { code: "INTERNAL", message: "Internal server error" } });
}
