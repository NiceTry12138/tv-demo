import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("读取生产配置", () => {
  const config = loadConfig({
    IPTV_REPOSITORY_URL: "https://example.com/iptv.git",
    IPTV_REPOSITORY_DIR: "./iptv-cache",
    HOST: "127.0.0.1",
    PORT: "9000",
    SYNC_INTERVAL_HOURS: "12",
    GIT_TIMEOUT_MS: "5000",
    DATA_DIR: "./runtime-data"
  });
  assert.equal(config.port, 9000);
  assert.equal(config.syncIntervalMs, 43_200_000);
  assert.equal(config.gitTimeoutMs, 5_000);
  assert.equal(config.repositoryUrl, "https://example.com/iptv.git");
  assert.equal(config.allPlaylistPath, "index.m3u");
  assert.equal(config.cnPlaylistPath, "countries/cn.m3u");
});

test("拒绝无效地址、端口和同步间隔", () => {
  assert.throws(() => loadConfig({ IPTV_REPOSITORY_URL: "file:///tmp/iptv.git" }), /HTTP/);
  assert.throws(() => loadConfig({ PORT: "0" }), /正数/);
  assert.throws(() => loadConfig({ PORT: "65536" }), /65535/);
  assert.throws(() => loadConfig({ PORT: "1.5" }), /整数/);
  assert.throws(() => loadConfig({ SYNC_INTERVAL_HOURS: "nope" }), /正数/);
});
