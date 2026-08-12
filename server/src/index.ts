import { loadConfig } from "./config.js";
import { createHttpServer } from "./http-server.js";
import { CatalogSynchronizer } from "./synchronizer.js";

const config = loadConfig();
const synchronizer = new CatalogSynchronizer(config);
const server = createHttpServer(config);

async function sync(): Promise<void> {
  try {
    const status = await synchronizer.sync();
    console.log(`[sync] ${status.lastSuccessAt}: ${status.channelCount} 个频道，${status.sourceCount} 个源`);
  } catch (error) {
    console.error("[sync] 失败，继续提供上次成功数据：", error);
  }
}

server.listen(config.port, config.host, () => {
  console.log(`[http] http://${config.host}:${config.port}`);
  void sync();
});

const timer = setInterval(() => void sync(), config.syncIntervalMs);
timer.unref();

function shutdown(signal: string): void {
  console.log(`[http] 收到 ${signal}，停止服务`);
  clearInterval(timer);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
