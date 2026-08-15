import { resolve } from "node:path";

export interface Config {
  host: string;
  port: number;
  healthCheckIntervalMs: number;
  healthCheckTimeoutMs: number;
  healthCheckConcurrency: number;
  adminUsername: string;
  adminPassword: string;
  maxUploadBytes: number;
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
  const dataDir = resolve(env.DATA_DIR ?? "./data");
  const adminUsername = env.ADMIN_USERNAME?.trim() || "cong01";

  return {
    host: env.HOST ?? "0.0.0.0",
    port: portNumber(env.PORT),
    healthCheckIntervalMs: positiveNumber("HEALTH_CHECK_INTERVAL_HOURS", env.HEALTH_CHECK_INTERVAL_HOURS, 1) * 3_600_000,
    healthCheckTimeoutMs: positiveNumber("HEALTH_CHECK_TIMEOUT_MS", env.HEALTH_CHECK_TIMEOUT_MS, 8_000),
    healthCheckConcurrency: positiveNumber("HEALTH_CHECK_CONCURRENCY", env.HEALTH_CHECK_CONCURRENCY, 16),
    adminUsername,
    adminPassword: env.ADMIN_PASSWORD ?? "",
    maxUploadBytes: positiveNumber("MAX_UPLOAD_BYTES", env.MAX_UPLOAD_BYTES, 25 * 1024 * 1024),
    dataDir
  };
}
