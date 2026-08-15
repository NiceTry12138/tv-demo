import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Config } from "../src/config.js";
import { CatalogHealthChecker } from "../src/health-checker.js";
import type { ChannelCatalog, ChannelSource } from "../src/models.js";
import {
  CN_CHANNELS_FILE,
  CN_HEALTHY_CHANNELS_FILE,
  CHANNELS_FILE,
  HEALTHY_CHANNELS_FILE,
  publishCatalog
} from "../src/storage.js";

function config(dataDir: string): Config {
  return {
    host: "127.0.0.1",
    port: 8080,
    healthCheckIntervalMs: 3_600_000,
    healthCheckTimeoutMs: 1000,
    healthCheckConcurrency: 2,
    adminUsername: "cong01",
    adminPassword: "secret",
    maxUploadBytes: 1_000_000,
    dataDir
  };
}

function source(url: string): ChannelSource {
  return {
    url,
    quality: null,
    videoCodec: null,
    userAgent: null,
    referrer: null,
    geoBlocked: false,
    alwaysOn: true,
    status: "unknown",
    checkedAt: null
  };
}

function catalog(version: string, sources: ChannelSource[]): ChannelCatalog {
  return { version, channels: [{ id: "demo", name: "Demo", logo: null, group: "Test", sources }] };
}

test("健康检查过滤失败源，并分别生成全量和 CN 缓存", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-tv-health-"));
  try {
    await publishCatalog(directory, catalog("all-v1", [source("https://ok.example/live"), source("https://bad.example/live")]), CHANNELS_FILE);
    await publishCatalog(directory, catalog("cn-v1", [source("https://cn.example/live")]), CN_CHANNELS_FILE);
    const checker = new CatalogHealthChecker(config(directory), async (item) => item.url !== "https://bad.example/live");
    const result = await checker.check();
    assert.equal(result.all.state, "ready");
    assert.equal(result.all.checkedSourceCount, 2);
    assert.equal(result.all.healthySourceCount, 1);
    assert.equal(result.cn.healthySourceCount, 1);
    const all = JSON.parse(await readFile(join(directory, HEALTHY_CHANNELS_FILE), "utf8")) as ChannelCatalog;
    assert.deepEqual(all.channels[0]?.sources.map((item) => item.url), ["https://ok.example/live"]);
    const cn = JSON.parse(await readFile(join(directory, CN_HEALTHY_CHANNELS_FILE), "utf8")) as ChannelCatalog;
    assert.equal(cn.channels.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("健康检查全失败时保留旧缓存", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-tv-health-keep-"));
  try {
    await publishCatalog(directory, catalog("v1", [source("https://ok.example/live")]), CHANNELS_FILE);
    const checker = new CatalogHealthChecker(config(directory), async () => true);
    await checker.check();
    const before = await readFile(join(directory, HEALTHY_CHANNELS_FILE), "utf8");
    const failed = new CatalogHealthChecker(config(directory), async () => false);
    const result = await failed.check();
    assert.equal(result.all.state, "error");
    assert.equal(await readFile(join(directory, HEALTHY_CHANNELS_FILE), "utf8"), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
