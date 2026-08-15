import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Config } from "../src/config.js";
import { importUploadedCatalog } from "../src/catalog-importer.js";
import type { ChannelCatalog } from "../src/models.js";
import { CHANNELS_FILE, CN_CHANNELS_FILE } from "../src/storage.js";

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

test("上传目录按 URL 去重并生成全量和 CN 目录", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-tv-import-"));
  try {
    const result = await importUploadedCatalog(config(directory), {
      generatedAt: "2026-08-15T00:00:00.000Z",
      entries: [
        { name: "Global", url: "https://example.com/shared.m3u8", country: "US" },
        { name: "CCTV", url: "https://example.com/shared.m3u8", country: "CN", group: "央视" },
        { name: "Other", url: "https://example.com/other.m3u8", country: "US" }
      ]
    });
    assert.deepEqual(result, { importedSourceCount: 2, channelCount: 2, cnChannelCount: 1 });
    const all = JSON.parse(await readFile(join(directory, CHANNELS_FILE), "utf8")) as ChannelCatalog;
    const cn = JSON.parse(await readFile(join(directory, CN_CHANNELS_FILE), "utf8")) as ChannelCatalog;
    assert.equal(all.version, "2026-08-15T00:00:00.000Z");
    assert.equal(cn.channels[0]?.name, "CCTV");
    assert.equal(cn.channels[0]?.sources[0]?.status, "unknown");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("拒绝缺少地区或无效 URL 的上传内容", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-tv-import-invalid-"));
  try {
    await assert.rejects(importUploadedCatalog(config(directory), {
      entries: [{ name: "Demo", url: "rtmp://example.com/live", country: "CN" }]
    }), /HTTP/);
    await assert.rejects(importUploadedCatalog(config(directory), {
      entries: [{ name: "Demo", url: "https://example.com/live" }]
    }), /country/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
