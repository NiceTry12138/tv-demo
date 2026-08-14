import { loadConfig } from "./config.js";
import { createHttpServer } from "./http-server.js";
import { CatalogHealthChecker } from "./health-checker.js";
import { ensureRepository } from "./repository.js";
import { CatalogSynchronizer } from "./synchronizer.js";

const config = loadConfig();
const synchronizer = new CatalogSynchronizer(config);
const healthChecker = new CatalogHealthChecker(config);
const server = createHttpServer(config);

async function refresh(): Promise<void> {
  try {
    await ensureRepository(config);
    const status = await synchronizer.sync();
    console.log(`[sync] ${status.lastSuccessAt}: ${status.channelCount} 个频道，${status.sourceCount} 个源`);
  } catch (error) {
    console.error("[sync] 失败，继续提供上次成功数据：", error);
  }
  await checkHealth();
}

async function checkHealth(): Promise<void> {
  try {
    const result = await healthChecker.check();
    console.log(`[health] 全量 ${result.all.healthyChannelCount} 个频道/${result.all.healthySourceCount} 个源，CN ${result.cn.healthyChannelCount} 个频道/${result.cn.healthySourceCount} 个源`);
  } catch (error) {
    console.error("[health] 检查失败：", error);
  }
}

server.listen(config.port, config.host, () => {
  console.log(`[http] http://${config.host}:${config.port}`);
  void refresh();
});

const repositoryTimer = setInterval(() => void refresh(), config.repositoryUpdateIntervalMs);
const healthTimer = setInterval(() => void checkHealth(), config.healthCheckIntervalMs);
repositoryTimer.unref();
healthTimer.unref();

function shutdown(signal: string): void {
  console.log(`[http] 收到 ${signal}，停止服务`);
  clearInterval(repositoryTimer);
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
