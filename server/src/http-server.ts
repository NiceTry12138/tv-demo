import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
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

export function createHttpServer(config: Config): Server {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const pathname = url.pathname;
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

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}
