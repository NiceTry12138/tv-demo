import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { Config } from "./config.js";
import { CHANNELS_FILE, STATUS_FILE } from "./storage.js";

export function createHttpServer(config: Config): Server {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method Not Allowed" });
      return;
    }

    if (pathname === "/healthz") {
      sendJson(response, 200, { status: "ok" }, request.method === "HEAD");
      return;
    }
    if (pathname === "/iptv/v1/channels.json") {
      await sendFile(response, join(config.dataDir, CHANNELS_FILE), request.method === "HEAD");
      return;
    }
    if (pathname === "/iptv/v1/status.json") {
      await sendFile(response, join(config.dataDir, STATUS_FILE), request.method === "HEAD");
      return;
    }
    sendJson(response, 404, { error: "Not Found" }, request.method === "HEAD");
  });
}

async function sendFile(response: ServerResponse, path: string, headOnly: boolean): Promise<void> {
  try {
    const file = await stat(path);
    const etag = `W/\"${file.size}-${Math.trunc(file.mtimeMs)}\"`;
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": file.size,
      "Cache-Control": "public, max-age=300",
      ETag: etag
    });
    if (headOnly) response.end();
    else createReadStream(path).pipe(response);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      sendJson(response, 503, { error: "频道数据尚未准备完成" }, headOnly);
      return;
    }
    sendJson(response, 500, { error: "读取频道数据失败" }, headOnly);
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown, headOnly = false): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  response.end(headOnly ? undefined : body);
}
