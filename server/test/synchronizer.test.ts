import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Config } from "../src/config.js";
import { CatalogSynchronizer, type FetchFunction } from "../src/synchronizer.js";

function config(dataDir: string): Config {
  return {
    allUpstreamUrl: "https://example.com/all.m3u",
    cnUpstreamUrl: "https://example.com/cn.m3u",
    host: "127.0.0.1",
    port: 8080,
    syncIntervalMs: 60_000,
    fetchTimeoutMs: 1_000,
    dataDir
  };
}

test("同步失败不覆盖上次成功频道数据", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-tv-sync-"));
  const playlist = "#EXTM3U\n#EXTINF:-1 tvg-id=\"demo.cn\",Demo\nhttps://example.com/live.m3u8\n";
  try {
    const successFetch = (async () => new Response(playlist, { status: 200 })) as FetchFunction;
    await new CatalogSynchronizer(config(directory), successFetch).sync();
    const before = await readFile(join(directory, "channels.json"), "utf8");

    const failedFetch = (async () => new Response("failed", { status: 502 })) as FetchFunction;
    await assert.rejects(
      new CatalogSynchronizer(config(directory), failedFetch).sync(),
      /HTTP 502/
    );

    const after = await readFile(join(directory, "channels.json"), "utf8");
    const status = JSON.parse(await readFile(join(directory, "status.json"), "utf8"));
    assert.equal(after, before);
    assert.equal(status.state, "error");
    assert.equal(status.channelCount, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("并发同步复用同一个任务", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-tv-sync-lock-"));
  const playlist = "#EXTM3U\n#EXTINF:-1,Demo\nhttps://example.com/live.m3u8\n";
  let calls = 0;
  const fetchFunction = (async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(playlist, { status: 200 });
  }) as FetchFunction;
  try {
    const synchronizer = new CatalogSynchronizer(config(directory), fetchFunction);
    await Promise.all([synchronizer.sync(), synchronizer.sync()]);
    assert.equal(calls, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("全量失败不影响 CN 目录发布", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-tv-sync-partial-"));
  const playlist = "#EXTM3U\n#EXTINF:-1,CN Demo\nhttps://example.com/cn.m3u8\n";
  const fetchFunction = (async (input: string | URL | Request) =>
    String(input).includes("all.m3u")
      ? new Response("failed", { status: 502 })
      : new Response(playlist, { status: 200 })) as FetchFunction;
  try {
    const status = await new CatalogSynchronizer(config(directory), fetchFunction).sync();
    const cn = JSON.parse(await readFile(join(directory, "channels-cn.json"), "utf8"));
    assert.equal(status.state, "ready");
    assert.equal(cn.channels.length, 1);
    await assert.rejects(readFile(join(directory, "channels.json"), "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
