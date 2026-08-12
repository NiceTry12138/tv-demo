import type { Config } from "./config.js";
import { buildCatalog, parseM3u } from "./m3u.js";
import type { ServiceStatus } from "./models.js";
import { publishCatalog, readStatus, writeStatus } from "./storage.js";

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
    const previous = await readStatus(this.config.dataDir, this.config.upstreamUrl);
    const attemptAt = new Date().toISOString();
    await writeStatus(this.config.dataDir, {
      ...previous,
      state: "syncing",
      upstream: this.config.upstreamUrl,
      lastAttemptAt: attemptAt,
      error: null
    });

    try {
      const response = await this.fetchFunction(this.config.upstreamUrl, {
        headers: { "User-Agent": "HomeTV-Server/0.1" },
        signal: AbortSignal.timeout(this.config.fetchTimeoutMs)
      });
      if (!response.ok) throw new Error(`上游返回 HTTP ${response.status}`);
      const catalog = buildCatalog(parseM3u(await response.text()));
      await publishCatalog(this.config.dataDir, catalog);
      const status: ServiceStatus = {
        state: "ready",
        upstream: this.config.upstreamUrl,
        lastAttemptAt: attemptAt,
        lastSuccessAt: catalog.version,
        channelCount: catalog.channels.length,
        sourceCount: catalog.channels.reduce((sum, channel) => sum + channel.sources.length, 0),
        error: null
      };
      await writeStatus(this.config.dataDir, status);
      return status;
    } catch (error) {
      const status: ServiceStatus = {
        ...previous,
        state: "error",
        upstream: this.config.upstreamUrl,
        lastAttemptAt: attemptAt,
        error: error instanceof Error ? error.message : String(error)
      };
      await writeStatus(this.config.dataDir, status);
      throw error;
    }
  }
}
