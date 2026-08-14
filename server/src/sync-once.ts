import { loadConfig } from "./config.js";
import { CatalogHealthChecker } from "./health-checker.js";
import { ensureRepository } from "./repository.js";
import { CatalogSynchronizer } from "./synchronizer.js";

const config = loadConfig();
await ensureRepository(config);
const status = await new CatalogSynchronizer(config).sync();
const health = await new CatalogHealthChecker(config).check();
console.log(JSON.stringify({ status, health }, null, 2));
