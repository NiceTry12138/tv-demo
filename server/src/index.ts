import { loadConfig } from "./config.js";
import { createHttpServer } from "./http-server.js";
import { CatalogHealthChecker } from "./health-checker.js";

const config = loadConfig();
const healthChecker = new CatalogHealthChecker(config);
let healthQueue = Promise.resolve();
const server = createHttpServer(config, async (result) => {
  console.log(`[upload] 已保存 ${result.channelCount} 个频道，CN ${result.cnChannelCount} 个频道`);
  await enqueueHealthCheck();
});

function enqueueHealthCheck(): Promise<void> {
  healthQueue = healthQueue.then(async () => {
    try {
      const result = await healthChecker.check();
      console.log(`[health] 全量 ${result.all.healthyChannelCount} 个频道/${result.all.healthySourceCount} 个源，CN ${result.cn.healthyChannelCount} 个频道/${result.cn.healthySourceCount} 个源`);
    } catch (error) {
      console.error("[health] 检查失败：", error);
    }
  });
  return healthQueue;
}

server.listen(config.port, config.host, () => {
  console.log(`[http] http://${config.host}:${config.port}`);
  console.log(`[admin] 用户名 ${config.adminUsername}，${config.adminPassword ? "已启用" : "未配置 ADMIN_PASSWORD"}`);
  void enqueueHealthCheck();
});

const healthTimer = setInterval(() => void enqueueHealthCheck(), config.healthCheckIntervalMs);
healthTimer.unref();

function shutdown(signal: string): void {
  console.log(`[http] 收到 ${signal}，停止服务`);
  clearInterval(healthTimer);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
