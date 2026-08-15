import { loadConfig } from "./config.js";
import { CatalogHealthChecker } from "./health-checker.js";

const config = loadConfig();
const health = await new CatalogHealthChecker(config).check();
console.log(JSON.stringify(health, null, 2));
