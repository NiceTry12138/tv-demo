import type { Config } from "./config.js";
import { buildCatalog, parseM3u } from "./m3u.js";
import type { ServiceStatus } from "./models.js";
import {
  CN_CHANNELS_FILE,
  CN_STATUS_FILE,
  CHANNELS_FILE,
  STATUS_FILE,
  publishCatalog,
  readStatus,
  writeStatus
} from "./storage.js";

export type FetchFunction = typeof fetch;

export class CatalogSynchronizer {
  private running: Promise<ServiceStatus> | null = null;

  constructor(
    private readonly config: Config,
    private readonly fetchFunction: FetchFunction = fetch
  ) {}

  sync(): Promise<ServiceStatus> {
    if (this.running) return this.running;
    this.running = this.performSync().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async performSync(): Promise<ServiceStatus> {
    const all = await this.syncOne(
      this.config.allUpstreamUrl,
      CHANNELS_FILE,
      STATUS_FILE
    );
    const cn = await this.syncOne(
      this.config.cnUpstreamUrl,
      CN_CHANNELS_FILE,
      CN_STATUS_FILE
    );
    if (all.state === "error" && cn.state === "error") {
      throw new Error(`全量和 CN 频道同步均失败：${all.error ?? cn.error ?? "未知错误"}`);
    }
    return all.state === "ready" ? all : cn;
  }

  private async syncOne(upstream: string, catalogFile: string, statusFile: string): Promise<ServiceStatus> {
    const previous = await readStatus(this.config.dataDir, upstream, statusFile);
    const attemptAt = new Date().toISOString();
    await writeStatus(this.config.dataDir, { ...previous, state: "syncing", upstream, lastAttemptAt: attemptAt, error: null }, statusFile);
    try {
      const response = await this.fetchFunction(upstream, {
        headers: { "User-Agent": "HomeTV-Server/0.1" },
        signal: AbortSignal.timeout(this.config.fetchTimeoutMs)
      });
      if (!response.ok) throw new Error(`上游返回 HTTP ${response.status}`);
      const catalog = buildCatalog(parseM3u(await response.text()));
      await publishCatalog(this.config.dataDir, catalog, catalogFile);
      const status: ServiceStatus = {
        state: "ready", upstream, lastAttemptAt: attemptAt, lastSuccessAt: catalog.version,
        channelCount: catalog.channels.length,
        sourceCount: catalog.channels.reduce((sum, channel) => sum + channel.sources.length, 0), error: null
      };
      await writeStatus(this.config.dataDir, status, statusFile);
      return status;
    } catch (error) {
      const status: ServiceStatus = { ...previous, state: "error", upstream, lastAttemptAt: attemptAt, error: error instanceof Error ? error.message : String(error) };
      await writeStatus(this.config.dataDir, status, statusFile);
      return status;
    }
  }
}
