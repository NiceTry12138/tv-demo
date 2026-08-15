import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Config } from "../src/config.js";
import { createHttpServer } from "../src/http-server.js";
import { CN_HEALTHY_CHANNELS_FILE, HEALTHY_CHANNELS_FILE, publishCatalog } from "../src/storage.js";

test("HTTP 服务返回健康状态、频道数据和未找到", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-tv-http-"));
  const config: Config = {
    host: "127.0.0.1",
    port: 0,
    healthCheckIntervalMs: 60_000,
    healthCheckTimeoutMs: 1000,
    healthCheckConcurrency: 2,
    adminUsername: "cong01",
    adminPassword: "secret",
    maxUploadBytes: 1_000_000,
    dataDir: directory
  };
  let uploads = 0;
  const server = createHttpServer(config, () => { uploads++; });
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const get = (url: string, init: RequestInit = {}) => fetch(url, { method: "GET", ...init });
    for (const path of ["/healthz", "/check", "/readyz", "/iptv/v1/channels.json", "/iptv/v1/status.json"]) {
      assert.equal((await fetch(`${baseUrl}${path}`, { method: "POST" })).status, 405, `POST ${path} must be rejected`);
    }
    assert.equal((await get(`${baseUrl}/healthz`)).status, 200);
    const checkBefore = await get(`${baseUrl}/check`);
    assert.equal(checkBefore.status, 200);
    assert.deepEqual(await checkBefore.json(), {
      service: "home-tv-server",
      apiVersion: 1,
      status: "ok",
      catalogReady: false,
      healthyCatalogReady: false
    });
    assert.equal((await get(`${baseUrl}/readyz`)).status, 503);
    assert.equal((await get(`${baseUrl}/iptv/v1/channels.json`)).status, 503);
    assert.equal((await get(`${baseUrl}/iptv/v1/channels.json?country=CN`)).status, 503);

    assert.equal((await get(`${baseUrl}/admin`)).status, 401);
    assert.equal((await get(`${baseUrl}/admin`, { headers: { "X-Forwarded-Proto": "http" } })).status, 401);
    assert.equal((await get(`${baseUrl}/admin`, { headers: { Authorization: "Basic invalid" } })).status, 401);
    const authorization = `Basic ${Buffer.from("cong01:secret").toString("base64")}`;
    const adminPage = await get(`${baseUrl}/admin`, { headers: { Authorization: authorization } });
    assert.equal(adminPage.status, 200);
    assert.match(await adminPage.text(), /频道目录管理/);
    const upload = await fetch(`${baseUrl}/admin/catalog`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ entries: [{ name: "CN Demo", url: "https://example.com/live.m3u8", country: "CN" }] })
    });
    assert.equal(upload.status, 202);
    assert.equal((await upload.json() as { cnChannelCount: number }).cnChannelCount, 1);
    assert.equal(uploads, 1);

    await publishCatalog(directory, {
      version: "v1",
      channels: [{ id: "demo", name: "Demo", logo: null, group: "Test", sources: [] }]
    }, HEALTHY_CHANNELS_FILE);
    const response = await get(`${baseUrl}/iptv/v1/channels.json`);
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { version: string }).version, "v1");
    await publishCatalog(directory, {
      version: "cn-v1",
      channels: [{ id: "cn", name: "CN", logo: null, group: "CN", sources: [] }]
    }, CN_HEALTHY_CHANNELS_FILE);
    const cnResponse = await get(`${baseUrl}/iptv/v1/channels.json?country=CN`);
    assert.equal(cnResponse.status, 200);
    assert.equal((await cnResponse.json() as { version: string }).version, "cn-v1");
    assert.equal((await get(`${baseUrl}/iptv/v1/channels.json?country=cn`)).status, 200);
    assert.equal((await get(`${baseUrl}/iptv/v1/channels.json?country=US`)).status, 400);
    assert.equal((await get(`${baseUrl}/readyz`)).status, 200);
    assert.equal((await get(`${baseUrl}/check`).then((result) => result.json()) as {
      catalogReady: boolean
    }).catalogReady, true);
    const etag = response.headers.get("etag");
    assert.ok(etag);
    assert.equal((await get(`${baseUrl}/iptv/v1/channels.json`, {
      headers: { "If-None-Match": etag }
    })).status, 304);
    assert.equal((await get(`${baseUrl}/missing`)).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
