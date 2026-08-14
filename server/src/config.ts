import { join, resolve } from "node:path";

export interface Config {
  repositoryUrl: string;
  repositoryDir: string;
  allPlaylistPath: string;
  cnPlaylistPath: string;
  host: string;
  port: number;
  repositoryUpdateIntervalMs: number;
  healthCheckIntervalMs: number;
  healthCheckTimeoutMs: number;
  healthCheckConcurrency: number;
  gitTimeoutMs: number;
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
  const repositoryUrl = env.IPTV_REPOSITORY_URL ?? "https://github.com/iptv-org/iptv.git";
  if (!/^https?:\/\//i.test(repositoryUrl)) throw new Error("IPTV_REPOSITORY_URL 必须是 HTTP 或 HTTPS 地址");
  const dataDir = resolve(env.DATA_DIR ?? "./data");

  return {
    repositoryUrl,
    repositoryDir: resolve(env.IPTV_REPOSITORY_DIR ?? join(dataDir, "iptv-org")),
    allPlaylistPath: env.IPTV_ALL_PLAYLIST_PATH ?? "index.m3u",
    cnPlaylistPath: env.IPTV_CN_PLAYLIST_PATH ?? "countries/cn.m3u",
    host: env.HOST ?? "0.0.0.0",
    port: portNumber(env.PORT),
    repositoryUpdateIntervalMs: positiveNumber("REPOSITORY_UPDATE_INTERVAL_HOURS", env.REPOSITORY_UPDATE_INTERVAL_HOURS, 24) * 3_600_000,
    healthCheckIntervalMs: positiveNumber("HEALTH_CHECK_INTERVAL_HOURS", env.HEALTH_CHECK_INTERVAL_HOURS, 1) * 3_600_000,
    healthCheckTimeoutMs: positiveNumber("HEALTH_CHECK_TIMEOUT_MS", env.HEALTH_CHECK_TIMEOUT_MS, 8_000),
    healthCheckConcurrency: positiveNumber("HEALTH_CHECK_CONCURRENCY", env.HEALTH_CHECK_CONCURRENCY, 16),
    gitTimeoutMs: positiveNumber("GIT_TIMEOUT_MS", env.GIT_TIMEOUT_MS, 120_000),
    dataDir
  };
}
