import { createHash } from "node:crypto";
import type { Channel, ChannelCatalog, PlaylistEntry } from "./models.js";

interface PendingEntry {
  name: string;
  attributes: Record<string, string>;
  userAgent: string | null;
  referrer: string | null;
}

export function parseM3u(content: string): PlaylistEntry[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim());
  if (lines[0]?.toUpperCase() !== "#EXTM3U") {
    throw new Error("上游内容不是有效的 Extended M3U");
  }

  const entries: PlaylistEntry[] = [];
  let pending: PendingEntry | null = null;

  for (const line of lines.slice(1)) {
    if (!line) continue;
    if (line.startsWith("#EXTINF:")) {
      pending = parseExtInf(line);
      continue;
    }
    if (pending && line.startsWith("#EXTVLCOPT:")) {
      applyVlcOption(pending, line.slice("#EXTVLCOPT:".length));
      continue;
    }
    if (pending && line.startsWith("#EXTHTTP:")) {
      applyExtHttp(pending, line.slice("#EXTHTTP:".length));
      continue;
    }
    if (line.startsWith("#")) continue;
    if (!pending) continue;

    if (/^https?:\/\//i.test(line)) {
      entries.push({
        name: pending.name,
        tvgId: valueOrNull(pending.attributes["tvg-id"]),
        logo: valueOrNull(pending.attributes["tvg-logo"]),
        group: valueOrNull(pending.attributes["group-title"]),
        url: line,
        userAgent: pending.userAgent,
        referrer: pending.referrer
      });
    }
    pending = null;
  }

  if (entries.length === 0) {
    throw new Error("M3U 中没有有效的 HTTP 播放源");
  }
  return entries;
}

export function buildCatalog(entries: PlaylistEntry[], now = new Date()): ChannelCatalog {
  const channels = new Map<string, Channel>();

  for (const entry of entries) {
    const name = entry.name.trim();
    if (!name) continue;
    const key = (entry.tvgId?.trim() || normalizeName(name)).toLowerCase();
    const existing = channels.get(key);
    const source = {
      url: entry.url,
      quality: inferQuality(name),
      videoCodec: null,
      userAgent: entry.userAgent,
      referrer: entry.referrer,
      geoBlocked: false,
      alwaysOn: true,
      status: "unknown" as const,
      checkedAt: null
    };

    if (existing) {
      if (!existing.sources.some((item) => item.url === source.url)) existing.sources.push(source);
      if (!existing.logo && entry.logo) existing.logo = entry.logo;
      if (existing.group === "其他" && entry.group) existing.group = entry.group;
      continue;
    }

    channels.set(key, {
      id: stableId(entry.tvgId || name),
      name,
      logo: entry.logo,
      group: entry.group || "其他",
      sources: [source]
    });
  }

  const result = [...channels.values()].filter((channel) => channel.sources.length > 0);
  if (result.length === 0) throw new Error("解析后频道列表为空");
  result.sort((a, b) => a.group.localeCompare(b.group, "zh-CN") || a.name.localeCompare(b.name, "zh-CN"));
  return { version: now.toISOString(), channels: result };
}

function parseExtInf(line: string): PendingEntry {
  const commaIndex = findCommaOutsideQuotes(line);
  const metadata = commaIndex >= 0 ? line.slice(0, commaIndex) : line;
  const name = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : "";
  const attributes: Record<string, string> = {};
  for (const match of metadata.matchAll(/([\w-]+)="([^"]*)"/g)) {
    const key = match[1];
    const value = match[2];
    if (key !== undefined && value !== undefined) attributes[key.toLowerCase()] = value;
  }
  return { name, attributes, userAgent: null, referrer: null };
}

function findCommaOutsideQuotes(value: string): number {
  let quoted = false;
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '"') quoted = !quoted;
    if (value[index] === "," && !quoted) return index;
  }
  return -1;
}

function applyVlcOption(entry: PendingEntry, option: string): void {
  const separator = option.indexOf("=");
  if (separator < 0) return;
  const key = option.slice(0, separator).trim().toLowerCase();
  const value = option.slice(separator + 1).trim();
  if (key === "http-user-agent") entry.userAgent = valueOrNull(value);
  if (key === "http-referrer" || key === "http-referer") entry.referrer = valueOrNull(value);
}

function applyExtHttp(entry: PendingEntry, raw: string): void {
  try {
    const headers = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== "string") continue;
      if (key.toLowerCase() === "user-agent") entry.userAgent = value;
      if (["referer", "referrer"].includes(key.toLowerCase())) entry.referrer = value;
    }
  } catch {
    // Ignore malformed optional headers; URL and channel metadata remain usable.
  }
}

function normalizeName(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function stableId(value: string): string {
  const normalized = value.normalize("NFKC").trim();
  if (/^[a-zA-Z0-9._-]{1,80}$/.test(normalized)) return normalized;
  const hash = createHash("sha1").update(normalized).digest("hex").slice(0, 12);
  const readable = normalized.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return readable ? `${readable.slice(0, 60)}-${hash}` : `channel-${hash}`;
}

function inferQuality(name: string): string | null {
  const match = name.match(/(?:^|[\s[(])(2160|1440|1080|720|576|480)p?(?:[\s\])]|$)/i);
  return match?.[1] ? `${match[1]}p` : null;
}

function valueOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
