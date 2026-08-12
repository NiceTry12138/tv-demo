import { loadConfig } from "./config.js";
import { CatalogSynchronizer } from "./synchronizer.js";

const status = await new CatalogSynchronizer(loadConfig()).sync();
console.log(JSON.stringify(status, null, 2));
