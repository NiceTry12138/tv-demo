import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { Config } from "./config.js";

const execFileAsync = promisify(execFile);

export type PlaylistReader = (relativePath: string) => Promise<string>;

export function createPlaylistReader(config: Config): PlaylistReader {
  return async (relativePath) => {
    await ensureRepository(config);
    const path = resolve(config.repositoryDir, relativePath);
    const safeRelativePath = relative(resolve(config.repositoryDir), path);
    if (!safeRelativePath || safeRelativePath.startsWith("..") || isAbsolute(safeRelativePath)) {
      throw new Error("频道文件路径无效");
    }
    return readFile(path, "utf8");
  };
}

export async function ensureRepository(config: Config): Promise<void> {
  await mkdir(join(config.repositoryDir, ".."), { recursive: true });
  try {
    await execGit(config, ["-C", config.repositoryDir, "rev-parse", "--is-inside-work-tree"]);
    await execGit(config, ["-C", config.repositoryDir, "pull", "--ff-only", "--depth=1"]);
  } catch (error) {
    if (await isRepository(config)) throw error;
    await execGit(config, [
      "clone", "--depth=1", "--filter=blob:none", "--sparse", "--no-tags",
      config.repositoryUrl, config.repositoryDir
    ]);
    await execGit(config, ["-C", config.repositoryDir, "sparse-checkout", "set", config.allPlaylistPath, config.cnPlaylistPath]);
  }
}

async function isRepository(config: Config): Promise<boolean> {
  try {
    await execGit(config, ["-C", config.repositoryDir, "rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

async function execGit(config: Config, args: string[]): Promise<void> {
  try {
    await execFileAsync("git", args, {
      timeout: config.gitTimeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`iptv 仓库操作失败：${detail}`);
  }
}
