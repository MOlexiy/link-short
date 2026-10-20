import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../src/local/app.js";

export const OWNER = "test-owner-0001";
export const OTHER_OWNER = "test-owner-0002";
export const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
export const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
export const BOT_UA = "TelegramBot (like TwitterBot)";

export function startServer() {
  return new Promise<{ server: Server; base: string }>((resolve) => {
    const server = createApp().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

export function client(base: string, owner: string = OWNER) {
  const request = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(base + path, {
      method,
      redirect: "manual",
      headers: {
        ...(owner ? { "x-owner-id": owner } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, json };
  };
  return {
    request,
    get: (path: string, headers?: Record<string, string>) => request("GET", path, undefined, headers),
    post: (path: string, body?: unknown) => request("POST", path, body),
    del: (path: string) => request("DELETE", path),
  };
}
