import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Config } from "../src/config.js";
import { createHttpServer } from "../src/http-server.js";
import { CN_CHANNELS_FILE, publishCatalog } from "../src/storage.js";

test("HTTP 服务返回健康状态、频道数据和未找到", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-tv-http-"));
  const config: Config = {
    allUpstreamUrl: "https://example.com/all.m3u",
    cnUpstreamUrl: "https://example.com/cn.m3u",
    host: "127.0.0.1",
    port: 0,
    syncIntervalMs: 60_000,
    fetchTimeoutMs: 1_000,
    dataDir: directory
  };
  const server = createHttpServer(config);
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
    const checkBefore = await fetch(`${baseUrl}/check`);
    assert.equal(checkBefore.status, 200);
    assert.deepEqual(await checkBefore.json(), {
      service: "home-tv-server",
      apiVersion: 1,
      status: "ok",
      catalogReady: false
    });
    assert.equal((await fetch(`${baseUrl}/readyz`)).status, 503);
    assert.equal((await fetch(`${baseUrl}/iptv/v1/channels.json`)).status, 503);
    assert.equal((await fetch(`${baseUrl}/iptv/v1/channels.json?country=CN`)).status, 503);

    await publishCatalog(directory, {
      version: "v1",
      channels: [{ id: "demo", name: "Demo", logo: null, group: "Test", sources: [] }]
    });
    const response = await fetch(`${baseUrl}/iptv/v1/channels.json`);
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { version: string }).version, "v1");
    await publishCatalog(directory, {
      version: "cn-v1",
      channels: [{ id: "cn", name: "CN", logo: null, group: "CN", sources: [] }]
    }, CN_CHANNELS_FILE);
    const cnResponse = await fetch(`${baseUrl}/iptv/v1/channels.json?country=CN`);
    assert.equal(cnResponse.status, 200);
    assert.equal((await cnResponse.json() as { version: string }).version, "cn-v1");
    assert.equal((await fetch(`${baseUrl}/iptv/v1/channels.json?country=cn`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/iptv/v1/channels.json?country=US`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/readyz`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/check`).then((result) => result.json()) as {
      catalogReady: boolean
    }).catalogReady, true);
    const etag = response.headers.get("etag");
    assert.ok(etag);
    assert.equal((await fetch(`${baseUrl}/iptv/v1/channels.json`, {
      headers: { "If-None-Match": etag }
    })).status, 304);
    assert.equal((await fetch(`${baseUrl}/missing`)).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
