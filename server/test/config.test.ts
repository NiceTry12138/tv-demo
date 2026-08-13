import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("读取生产配置", () => {
  const config = loadConfig({
    UPSTREAM_ALL_M3U_URL: "https://example.com/all.m3u",
    UPSTREAM_CN_M3U_URL: "https://example.com/cn.m3u",
    HOST: "127.0.0.1",
    PORT: "9000",
    SYNC_INTERVAL_HOURS: "12",
    FETCH_TIMEOUT_MS: "5000",
    DATA_DIR: "./runtime-data"
  });
  assert.equal(config.port, 9000);
  assert.equal(config.syncIntervalMs, 43_200_000);
  assert.equal(config.fetchTimeoutMs, 5_000);
  assert.equal(config.allUpstreamUrl, "https://example.com/all.m3u");
  assert.equal(config.cnUpstreamUrl, "https://example.com/cn.m3u");
});

test("拒绝无效地址、端口和同步间隔", () => {
  assert.throws(() => loadConfig({ UPSTREAM_ALL_M3U_URL: "file:///tmp/all.m3u" }), /HTTP/);
  assert.throws(() => loadConfig({ PORT: "0" }), /正数/);
  assert.throws(() => loadConfig({ PORT: "65536" }), /65535/);
  assert.throws(() => loadConfig({ PORT: "1.5" }), /整数/);
  assert.throws(() => loadConfig({ SYNC_INTERVAL_HOURS: "nope" }), /正数/);
});
