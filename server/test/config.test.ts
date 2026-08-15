import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("读取生产配置", () => {
  const config = loadConfig({
    HOST: "127.0.0.1",
    PORT: "9000",
    HEALTH_CHECK_INTERVAL_HOURS: "2",
    HEALTH_CHECK_TIMEOUT_MS: "9000",
    HEALTH_CHECK_CONCURRENCY: "8",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "secret",
    MAX_UPLOAD_BYTES: "1000000",
    DATA_DIR: "./runtime-data"
  });
  assert.equal(config.port, 9000);
  assert.equal(config.healthCheckIntervalMs, 7_200_000);
  assert.equal(config.healthCheckTimeoutMs, 9_000);
  assert.equal(config.healthCheckConcurrency, 8);
  assert.equal(config.adminUsername, "admin");
  assert.equal(config.adminPassword, "secret");
  assert.equal(config.maxUploadBytes, 1_000_000);
});

test("使用安全的管理配置默认值并拒绝无效数字", () => {
  const defaults = loadConfig({});
  assert.equal(defaults.adminUsername, "cong01");
  assert.equal(defaults.adminPassword, "");
  assert.throws(() => loadConfig({ PORT: "0" }), /正数/);
  assert.throws(() => loadConfig({ PORT: "65536" }), /65535/);
  assert.throws(() => loadConfig({ PORT: "1.5" }), /整数/);
  assert.throws(() => loadConfig({ HEALTH_CHECK_INTERVAL_HOURS: "nope" }), /正数/);
  assert.throws(() => loadConfig({ MAX_UPLOAD_BYTES: "0" }), /正数/);
});
