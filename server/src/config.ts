import { resolve } from "node:path";

export interface Config {
  upstreamUrl: string;
  host: string;
  port: number;
  syncIntervalMs: number;
  fetchTimeoutMs: number;
  dataDir: string;
}

function positiveNumber(name: string, value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} 必须是正数`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const upstreamUrl = env.UPSTREAM_M3U_URL ??
    "https://iptv-org.github.io/iptv/countries/cn.m3u";
  if (!/^https?:\/\//i.test(upstreamUrl)) {
    throw new Error("UPSTREAM_M3U_URL 必须是 HTTP 或 HTTPS 地址");
  }

  return {
    upstreamUrl,
    host: env.HOST ?? "0.0.0.0",
    port: positiveNumber("PORT", env.PORT, 8080),
    syncIntervalMs: positiveNumber("SYNC_INTERVAL_HOURS", env.SYNC_INTERVAL_HOURS, 6) * 3_600_000,
    fetchTimeoutMs: positiveNumber("FETCH_TIMEOUT_MS", env.FETCH_TIMEOUT_MS, 30_000),
    dataDir: resolve(env.DATA_DIR ?? "./data")
  };
}
