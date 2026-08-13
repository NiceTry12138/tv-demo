import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ChannelCatalog } from "../src/models.js";
import { CN_CHANNELS_FILE, publishCatalog } from "../src/storage.js";

function catalog(version: string): ChannelCatalog {
  return {
    version,
    channels: [{
      id: "demo",
      name: "Demo",
      logo: null,
      group: "Test",
      sources: [{
        url: `https://example.com/${version}.m3u8`,
        quality: null,
        videoCodec: null,
        userAgent: null,
        referrer: null,
        geoBlocked: false,
        alwaysOn: true,
        status: "unknown",
        checkedAt: null
      }]
    }]
  };
}

test("发布新目录并保留上一成功版本", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-tv-server-"));
  try {
    await publishCatalog(directory, catalog("v1"));
    await publishCatalog(directory, catalog("v2"));
    const current = JSON.parse(await readFile(join(directory, "channels.json"), "utf8"));
    const previous = JSON.parse(await readFile(join(directory, "channels.previous.json"), "utf8"));
    assert.equal(current.version, "v2");
    assert.equal(previous.version, "v1");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("全量和 CN 目录使用独立文件", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-tv-server-regions-"));
  try {
    await publishCatalog(directory, catalog("all"));
    await publishCatalog(directory, catalog("cn"), CN_CHANNELS_FILE);
    const all = JSON.parse(await readFile(join(directory, "channels.json"), "utf8"));
    const cn = JSON.parse(await readFile(join(directory, "channels-cn.json"), "utf8"));
    assert.equal(all.version, "all");
    assert.equal(cn.version, "cn");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
