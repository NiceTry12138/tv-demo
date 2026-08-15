import type { Config } from "./config.js";
import { buildCatalog } from "./m3u.js";
import type { ChannelCatalog, PlaylistEntry, ServiceStatus, UploadCatalog, UploadedEntry } from "./models.js";
import {
  CHANNELS_FILE,
  CN_CHANNELS_FILE,
  CN_STATUS_FILE,
  STATUS_FILE,
  publishCatalog,
  writeStatus
} from "./storage.js";

const MAX_ENTRIES = 100_000;

export interface ImportResult {
  importedSourceCount: number;
  channelCount: number;
  cnChannelCount: number;
}

export async function importUploadedCatalog(config: Config, value: unknown): Promise<ImportResult> {
  const upload = validateUpload(value);
  const unique = deduplicate(upload.entries);
  const generatedAt = parseGeneratedAt(upload.generatedAt);
  const allCatalog = buildOrEmpty(unique, generatedAt);
  const cnCatalog = buildOrEmpty(unique.filter((entry) => entry.country === "CN"), generatedAt);

  await publishCatalog(config.dataDir, allCatalog, CHANNELS_FILE);
  await publishCatalog(config.dataDir, cnCatalog, CN_CHANNELS_FILE);
  await Promise.all([
    writeImportStatus(config.dataDir, STATUS_FILE, allCatalog),
    writeImportStatus(config.dataDir, CN_STATUS_FILE, cnCatalog)
  ]);

  return {
    importedSourceCount: unique.length,
    channelCount: allCatalog.channels.length,
    cnChannelCount: cnCatalog.channels.length
  };
}

function validateUpload(value: unknown): UploadCatalog {
  if (!isRecord(value) || !Array.isArray(value.entries)) throw new Error("上传内容必须包含 entries 数组");
  if (value.entries.length === 0) throw new Error("entries 不能为空");
  if (value.entries.length > MAX_ENTRIES) throw new Error(`entries 不能超过 ${MAX_ENTRIES} 条`);

  const entries = value.entries.map((item, index) => validateEntry(item, index));
  const generatedAt = optionalString(value.generatedAt, "generatedAt", 64);
  return generatedAt === undefined ? { entries } : { generatedAt, entries };
}

function validateEntry(value: unknown, index: number): UploadedEntry {
  if (!isRecord(value)) throw new Error(`entries[${index}] 必须是对象`);
  const name = requiredString(value.name, `entries[${index}].name`, 200);
  const url = requiredString(value.url, `entries[${index}].url`, 4096);
  if (!/^https?:\/\//i.test(url)) throw new Error(`entries[${index}].url 必须是 HTTP 或 HTTPS 地址`);
  const country = requiredString(value.country, `entries[${index}].country`, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error(`entries[${index}].country 必须是两位地区代码`);

  return {
    name,
    url,
    country,
    tvgId: nullableString(value.tvgId, `entries[${index}].tvgId`, 200),
    logo: nullableString(value.logo, `entries[${index}].logo`, 4096),
    group: nullableString(value.group, `entries[${index}].group`, 200),
    userAgent: nullableString(value.userAgent, `entries[${index}].userAgent`, 1000),
    referrer: nullableString(value.referrer, `entries[${index}].referrer`, 4096)
  };
}

function deduplicate(entries: UploadedEntry[]): UploadedEntry[] {
  const byUrl = new Map<string, UploadedEntry>();
  for (const entry of entries) {
    const existing = byUrl.get(entry.url);
    if (!existing || (existing.country !== "CN" && entry.country === "CN")) byUrl.set(entry.url, entry);
  }
  return [...byUrl.values()];
}

function buildOrEmpty(entries: UploadedEntry[], now: Date): ChannelCatalog {
  if (entries.length === 0) return { version: now.toISOString(), channels: [] };
  const playlistEntries: PlaylistEntry[] = entries.map(({ country: _country, ...entry }) => entry);
  return buildCatalog(playlistEntries, now);
}

async function writeImportStatus(dataDir: string, file: string, catalog: ChannelCatalog): Promise<void> {
  const sourceCount = catalog.channels.reduce((sum, channel) => sum + channel.sources.length, 0);
  const status: ServiceStatus = {
    state: "ready",
    upstream: "admin-upload",
    lastAttemptAt: catalog.version,
    lastSuccessAt: catalog.version,
    channelCount: catalog.channels.length,
    sourceCount,
    error: null
  };
  await writeStatus(dataDir, status, file);
}

function parseGeneratedAt(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("generatedAt 必须是有效时间");
  return parsed;
}

function requiredString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${name} 必须是 1 到 ${maxLength} 个字符`);
  }
  return value.trim();
}

function nullableString(value: unknown, name: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requiredString(value, name, maxLength);
}

function optionalString(value: unknown, name: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, name, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
