import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("读取生产配置", () => {
  const config = loadConfig({
    IPTV_REPOSITORY_URL: "https://example.com/iptv.git",
    IPTV_REPOSITORY_DIR: "./iptv-cache",
    HOST: "127.0.0.1",
    PORT: "9000",
    REPOSITORY_UPDATE_INTERVAL_HOURS: "12",
    HEALTH_CHECK_INTERVAL_HOURS: "2",
    HEALTH_CHECK_TIMEOUT_MS: "9000",
    HEALTH_CHECK_CONCURRENCY: "8",
    GIT_TIMEOUT_MS: "5000",
    DATA_DIR: "./runtime-data"
  });
  assert.equal(config.port, 9000);
  assert.equal(config.repositoryUpdateIntervalMs, 43_200_000);
  assert.equal(config.healthCheckIntervalMs, 7_200_000);
  assert.equal(config.healthCheckTimeoutMs, 9_000);
  assert.equal(config.healthCheckConcurrency, 8);
  assert.equal(config.gitTimeoutMs, 5_000);
  assert.equal(config.repositoryUrl, "https://example.com/iptv.git");
  assert.equal(config.allPlaylistPath, "index.m3u");
  assert.equal(config.cnPlaylistPath, "countries/cn.m3u");
});

test("拒绝无效地址、端口和检查间隔", () => {
  assert.throws(() => loadConfig({ IPTV_REPOSITORY_URL: "file:///tmp/iptv.git" }), /HTTP/);
  assert.throws(() => loadConfig({ PORT: "0" }), /正数/);
  assert.throws(() => loadConfig({ PORT: "65536" }), /65535/);
  assert.throws(() => loadConfig({ PORT: "1.5" }), /整数/);
  assert.throws(() => loadConfig({ REPOSITORY_UPDATE_INTERVAL_HOURS: "nope" }), /正数/);
  assert.throws(() => loadConfig({ HEALTH_CHECK_INTERVAL_HOURS: "nope" }), /正数/);
});
