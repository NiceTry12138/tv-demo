import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { ADMIN_PAGE } from "./admin-page.js";
import { importUploadedCatalog, type ImportResult } from "./catalog-importer.js";
import type { Config } from "./config.js";
import {
  CN_HEALTH_STATUS_FILE,
  CN_HEALTHY_CHANNELS_FILE,
  CN_STATUS_FILE,
  HEALTH_STATUS_FILE,
  HEALTHY_CHANNELS_FILE,
  isCatalogReady,
  readHealthStatus,
  STATUS_FILE
} from "./storage.js";

export type CatalogUploadedHandler = (result: ImportResult) => void | Promise<void>;

export function createHttpServer(config: Config, onCatalogUploaded?: CatalogUploadedHandler): Server {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    if (pathname === "/admin" || pathname === "/admin/catalog") {
      if (!isSecureAdminRequest(request)) {
        sendJson(response, 426, { error: "管理接口只允许 HTTPS 或服务器本机连接" });
        return;
      }
      if (!authorizeAdmin(request, response, config)) return;
      if (pathname === "/admin" && request.method === "GET") {
        sendHtml(response, ADMIN_PAGE);
        return;
      }
      if (pathname === "/admin/catalog" && request.method === "POST") {
        try {
          if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
            sendJson(response, 415, { error: "Content-Type 必须是 application/json" });
            return;
          }
          const result = await importUploadedCatalog(config, await readJsonBody(request, config.maxUploadBytes));
          sendJson(response, 202, { ...result, healthCheck: "started" });
          if (onCatalogUploaded) {
            void Promise.resolve(onCatalogUploaded(result)).catch((error) => console.error("[upload] 健康检查触发失败：", error));
          }
        } catch (error) {
          const status = error instanceof RequestError ? error.status : 400;
          sendJson(response, status, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
      sendJson(response, 405, { error: "Method Not Allowed" });
      return;
    }

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method Not Allowed" });
      return;
    }

    if (pathname === "/healthz") {
      sendJson(response, 200, { status: "ok" });
      return;
    }
    if (pathname === "/check") {
      const ready = await isCatalogReady(config.dataDir, HEALTHY_CHANNELS_FILE) || await isCatalogReady(config.dataDir, CN_HEALTHY_CHANNELS_FILE);
      sendJson(response, 200, {
        service: "home-tv-server",
        apiVersion: 1,
        status: "ok",
        catalogReady: ready,
        healthyCatalogReady: ready
      });
      return;
    }
    if (pathname === "/readyz") {
      const ready = await isCatalogReady(config.dataDir, HEALTHY_CHANNELS_FILE) || await isCatalogReady(config.dataDir, CN_HEALTHY_CHANNELS_FILE);
      sendJson(
        response,
        ready ? 200 : 503,
        { status: ready ? "ready" : "not_ready" },
      );
      return;
    }
    if (pathname === "/iptv/v1/channels.json") {
      const country = url.searchParams.get("country");
      if (country !== null && !/^CN$/i.test(country)) {
        sendJson(response, 400, { error: "当前仅支持 country=CN" });
        return;
      }
      await sendFile(request, response, join(config.dataDir, country === null ? HEALTHY_CHANNELS_FILE : CN_HEALTHY_CHANNELS_FILE), 300);
      return;
    }
    if (pathname === "/iptv/v1/status.json") {
      const country = url.searchParams.get("country");
      if (country !== null && !/^CN$/i.test(country)) {
        sendJson(response, 400, { error: "当前仅支持 country=CN" });
        return;
      }
      await sendFile(request, response, join(config.dataDir, country === null ? STATUS_FILE : CN_STATUS_FILE), 0);
      return;
    }
    if (pathname === "/iptv/v1/health-status.json") {
      const country = url.searchParams.get("country");
      if (country !== null && !/^CN$/i.test(country)) {
        sendJson(response, 400, { error: "当前仅支持 country=CN" });
        return;
      }
      sendJson(response, 200, await readHealthStatus(config.dataDir, country === null ? HEALTH_STATUS_FILE : CN_HEALTH_STATUS_FILE));
      return;
    }
    sendJson(response, 404, { error: "Not Found" });
  });
}

function isSecureAdminRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function authorizeAdmin(request: IncomingMessage, response: ServerResponse, config: Config): boolean {
  if (!config.adminPassword) {
    sendJson(response, 503, { error: "管理员密码尚未配置" });
    return false;
  }
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Basic ")) {
    try {
      const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf8");
      const separator = credentials.indexOf(":");
      const username = separator >= 0 ? credentials.slice(0, separator) : "";
      const password = separator >= 0 ? credentials.slice(separator + 1) : "";
      if (safeEqual(username, config.adminUsername) && safeEqual(password, config.adminPassword)) return true;
    } catch {
      // Invalid Basic Auth is handled by the common unauthorized response.
    }
  }
  sendJson(response, 401, { error: "用户名或密码错误" }, { "WWW-Authenticate": "Basic realm=\"Home TV Admin\", charset=\"UTF-8\"" });
  return false;
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new RequestError(413, "上传内容过大");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new RequestError(413, "上传内容过大");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RequestError(400, "上传内容不是有效 JSON");
  }
}

class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function sendFile(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  maxAgeSeconds: number
): Promise<void> {
  try {
    const file = await stat(path);
    const etag = `W/\"${file.size}-${Math.trunc(file.mtimeMs)}\"`;
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": maxAgeSeconds > 0 ? `public, max-age=${maxAgeSeconds}` : "no-store",
      "X-Content-Type-Options": "nosniff",
      ETag: etag
    };
    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304, headers);
      response.end();
      return;
    }
    response.writeHead(200, {
      ...headers,
      "Content-Length": file.size,
    });
    createReadStream(path).pipe(response);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      sendJson(response, 503, { error: "频道数据尚未准备完成" });
      return;
    }
    sendJson(response, 500, { error: "读取频道数据失败" });
  }
}

function sendHtml(response: ServerResponse, body: string): void {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, value: unknown, extraHeaders: Record<string, string> = {}): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
  response.end(body);
}
