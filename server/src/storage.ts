import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChannelCatalog, ServiceStatus } from "./models.js";

export const CHANNELS_FILE = "channels.json";
export const PREVIOUS_CHANNELS_FILE = "channels.previous.json";
export const CN_CHANNELS_FILE = "channels-cn.json";
export const CN_PREVIOUS_CHANNELS_FILE = "channels-cn.previous.json";
export const STATUS_FILE = "status.json";
export const CN_STATUS_FILE = "status-cn.json";

export async function publishCatalog(
  dataDir: string,
  catalog: ChannelCatalog,
  currentFile = CHANNELS_FILE,
  previousFile = currentFile === CHANNELS_FILE ? PREVIOUS_CHANNELS_FILE : CN_PREVIOUS_CHANNELS_FILE
): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const currentPath = join(dataDir, currentFile);
  const previousPath = join(dataDir, previousFile);
  const temporaryPath = join(dataDir, `.${currentFile}.${process.pid}.${Date.now()}.tmp`);
  const content = `${JSON.stringify(catalog, null, 2)}\n`;

  await writeFile(temporaryPath, content, "utf8");
  try {
    await copyFile(currentPath, previousPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await rename(temporaryPath, currentPath);
}

export async function writeStatus(dataDir: string, status: ServiceStatus, statusFile = STATUS_FILE): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const target = join(dataDir, statusFile);
  const temporary = join(dataDir, `.${statusFile}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

export async function readStatus(dataDir: string, upstream: string, statusFile = STATUS_FILE): Promise<ServiceStatus> {
  try {
    return JSON.parse(await readFile(join(dataDir, statusFile), "utf8")) as ServiceStatus;
  } catch {
    return {
      state: "starting",
      upstream,
      lastAttemptAt: null,
      lastSuccessAt: null,
      channelCount: 0,
      sourceCount: 0,
      error: null
    };
  }
}

export async function isCatalogReady(dataDir: string, catalogFile = CHANNELS_FILE): Promise<boolean> {
  try {
    return (await stat(join(dataDir, catalogFile))).size > 0;
  } catch {
    return false;
  }
}
