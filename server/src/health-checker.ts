import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "./config.js";
import type { Channel, ChannelCatalog, ChannelSource, HealthStatus } from "./models.js";
import {
  CN_CHANNELS_FILE,
  CHANNELS_FILE,
  CN_HEALTH_STATUS_FILE,
  CN_HEALTHY_CHANNELS_FILE,
  HEALTH_STATUS_FILE,
  HEALTHY_CHANNELS_FILE,
  HEALTHY_PREVIOUS_CHANNELS_FILE,
  CN_HEALTHY_PREVIOUS_CHANNELS_FILE,
  publishCatalog,
  readHealthStatus,
  writeHealthStatus
} from "./storage.js";

export type SourceProbe = (source: ChannelSource, timeoutMs: number) => Promise<boolean>;

export interface HealthCheckResult {
  all: HealthStatus;
  cn: HealthStatus;
}

const DEFAULT_USER_AGENT = "HomeTV-HealthCheck/1.0";
const MAX_PLAYLIST_BYTES = 512 * 1024;
const MAX_SAMPLE_BYTES = 64 * 1024;

export class CatalogHealthChecker {
  private running: Promise<HealthCheckResult> | null = null;

  constructor(
    private readonly config: Config,
    private readonly probe: SourceProbe = probeSource
  ) {}

  check(): Promise<HealthCheckResult> {
    if (this.running) return this.running;
    this.running = this.performCheck().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async performCheck(): Promise<HealthCheckResult> {
    const [all, cn] = await Promise.all([
      this.checkOne("全量", CHANNELS_FILE, HEALTHY_CHANNELS_FILE, HEALTH_STATUS_FILE, HEALTHY_PREVIOUS_CHANNELS_FILE),
      this.checkOne("CN", CN_CHANNELS_FILE, CN_HEALTHY_CHANNELS_FILE, CN_HEALTH_STATUS_FILE, CN_HEALTHY_PREVIOUS_CHANNELS_FILE)
    ]);
    return { all, cn };
  }

  private async checkOne(
    label: string,
    sourceFile: string,
    healthyFile: string,
    statusFile: string,
    previousHealthyFile: string
  ): Promise<HealthStatus> {
    const previous = await readHealthStatus(this.config.dataDir, statusFile);
    const attemptAt = new Date().toISOString();
    await writeHealthStatus(this.config.dataDir, {
      ...previous,
      state: "checking",
      lastAttemptAt: attemptAt,
      error: null
    }, statusFile);

    try {
      const catalog = JSON.parse(await readFile(join(this.config.dataDir, sourceFile), "utf8")) as ChannelCatalog;
      const sources = catalog.channels.flatMap((channel) => channel.sources);
      if (sources.length === 0) throw new Error(`${label} 目录没有播放源`);

      const checkedAt = new Date().toISOString();
      const healthy = await checkSources(sources, this.config.healthCheckConcurrency, this.config.healthCheckTimeoutMs, this.probe);
      const healthyByUrl = new Map<string, ChannelSource>();
      healthy.forEach((source, index) => {
        if (source) healthyByUrl.set(source.url, { ...source, status: "healthy", checkedAt });
        else {
          const original = sources[index];
          if (original) healthyByUrl.delete(original.url);
        }
      });

      const healthyChannels: Channel[] = catalog.channels
        .map((channel) => ({ ...channel, sources: channel.sources.filter((source) => healthyByUrl.has(source.url)).map((source) => healthyByUrl.get(source.url)!) }))
        .filter((channel) => channel.sources.length > 0);
      const healthySourceCount = healthyChannels.reduce((sum, channel) => sum + channel.sources.length, 0);
      if (healthySourceCount === 0) throw new Error(`${label} 本轮没有检查通过的播放源`);

      const healthyCatalog: ChannelCatalog = { version: catalog.version, channels: healthyChannels };
      await publishCatalog(this.config.dataDir, healthyCatalog, healthyFile, previousHealthyFile);
      const status: HealthStatus = {
        state: "ready",
        lastAttemptAt: attemptAt,
        lastSuccessAt: checkedAt,
        checkedSourceCount: sources.length,
        healthySourceCount,
        healthyChannelCount: healthyChannels.length,
        error: null
      };
      await writeHealthStatus(this.config.dataDir, status, statusFile);
      return status;
    } catch (error) {
      const status: HealthStatus = {
        ...previous,
        state: "error",
        lastAttemptAt: attemptAt,
        error: error instanceof Error ? error.message : String(error)
      };
      await writeHealthStatus(this.config.dataDir, status, statusFile);
      return status;
    }
  }
}

async function checkSources(
  sources: ChannelSource[],
  concurrency: number,
  timeoutMs: number,
  probe: SourceProbe
): Promise<Array<ChannelSource | null>> {
  const results: Array<ChannelSource | null> = new Array(sources.length).fill(null);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = next++;
      const source = sources[index];
      if (!source) return;
      try {
        if (await probe(source, timeoutMs)) results[index] = source;
      } catch {
        // 单个播放源失败不影响其他源。
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, Math.trunc(concurrency)), sources.length) }, () => worker()));
  return results;
}

async function probeSource(source: ChannelSource, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await probeUrl(source.url, source, controller.signal, 0);
  } finally {
    clearTimeout(timer);
  }
}

async function probeUrl(url: string, source: ChannelSource, signal: AbortSignal, depth: number): Promise<boolean> {
  const headers: Record<string, string> = { "User-Agent": source.userAgent || DEFAULT_USER_AGENT };
  if (source.referrer) headers.Referer = source.referrer;
  const response = await fetch(url, { method: "GET", headers, redirect: "follow", signal });
  if (!response.ok || !response.body) return false;
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("text/html")) return false;
  const isPlaylist = contentType.includes("mpegurl") || contentType.includes("m3u8") || /\.m3u8(?:$|[?#])/i.test(url);
  if (isPlaylist) {
    const body = await readLimitedText(response, MAX_PLAYLIST_BYTES);
    if (!body.trim().toUpperCase().startsWith("#EXTM3U") || depth >= 2) return false;
    const child = firstPlaylistUrl(body, url);
    return child ? probeUrl(child, source, signal, depth + 1) : false;
  }
  const sample = await readLimitedBytes(response, MAX_SAMPLE_BYTES);
  if (sample.length === 0) return false;
  const text = new TextDecoder().decode(sample.slice(0, 512)).trimStart();
  if (text.toUpperCase().startsWith("#EXTM3U")) {
    if (depth >= 2) return false;
    const child = firstPlaylistUrl(text, url);
    return child ? probeUrl(child, source, signal, depth + 1) : false;
  }
  const lower = text.toLowerCase();
  return !lower.startsWith("<html") && !lower.startsWith("<!doctype");
}

function firstPlaylistUrl(body: string, baseUrl: string): string | null {
  for (const line of body.split(/\r?\n/).map((item) => item.trim())) {
    if (!line || line.startsWith("#")) continue;
    try {
      return new URL(line, baseUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
}

async function readLimitedText(response: Response, limit: number): Promise<string> {
  const bytes = await readLimitedBytes(response, limit);
  return new TextDecoder().decode(bytes);
}

async function readLimitedBytes(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < limit) {
      const item = await reader.read();
      if (item.done) break;
      if (!item.value) continue;
      const remaining = limit - total;
      const chunk = item.value.byteLength <= remaining ? item.value : item.value.slice(0, remaining);
      chunks.push(chunk);
      total += chunk.byteLength;
      if (total >= limit) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export { probeSource };
