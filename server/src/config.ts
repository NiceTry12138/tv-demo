import { resolve } from "node:path";

export interface Config {
  allUpstreamUrl: string;
  cnUpstreamUrl: string;
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

function portNumber(value: string | undefined): number {
  const port = positiveNumber("PORT", value, 8080);
  if (!Number.isInteger(port) || port > 65_535) {
    throw new Error("PORT 必须是 1 到 65535 的整数");
  }
  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const allUpstreamUrl = env.UPSTREAM_ALL_M3U_URL ??
    "https://iptv-org.github.io/iptv/index.m3u";
  const cnUpstreamUrl = env.UPSTREAM_CN_M3U_URL ??
    env.UPSTREAM_M3U_URL ?? "https://iptv-org.github.io/iptv/countries/cn.m3u";
  const upstreams: Array<[string, string]> = [
    ["UPSTREAM_ALL_M3U_URL", allUpstreamUrl],
    ["UPSTREAM_CN_M3U_URL", cnUpstreamUrl]
  ];
  for (const [name, value] of upstreams) {
    if (!/^https?:\/\//i.test(value)) throw new Error(`${name} 必须是 HTTP 或 HTTPS 地址`);
  }

  return {
    allUpstreamUrl,
    cnUpstreamUrl,
    host: env.HOST ?? "0.0.0.0",
    port: portNumber(env.PORT),
    syncIntervalMs: positiveNumber("SYNC_INTERVAL_HOURS", env.SYNC_INTERVAL_HOURS, 6) * 3_600_000,
    fetchTimeoutMs: positiveNumber("FETCH_TIMEOUT_MS", env.FETCH_TIMEOUT_MS, 30_000),
    dataDir: resolve(env.DATA_DIR ?? "./data")
  };
}
