export interface ChannelSource {
  url: string;
  quality: string | null;
  videoCodec: string | null;
  userAgent: string | null;
  referrer: string | null;
  geoBlocked: boolean;
  alwaysOn: boolean;
  status: "unknown" | "healthy" | "unavailable";
  checkedAt: string | null;
}

export interface Channel {
  id: string;
  name: string;
  logo: string | null;
  group: string;
  sources: ChannelSource[];
}

export interface ChannelCatalog {
  version: string;
  channels: Channel[];
}

export interface ServiceStatus {
  state: "starting" | "syncing" | "ready" | "error";
  upstream: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  channelCount: number;
  sourceCount: number;
  error: string | null;
}

export interface HealthStatus {
  state: "starting" | "checking" | "ready" | "error";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  checkedSourceCount: number;
  healthySourceCount: number;
  healthyChannelCount: number;
  error: string | null;
}

export interface PlaylistEntry {
  name: string;
  tvgId: string | null;
  logo: string | null;
  group: string | null;
  url: string;
  userAgent: string | null;
  referrer: string | null;
}

export interface UploadedEntry extends PlaylistEntry {
  country: string;
}

export interface UploadCatalog {
  generatedAt?: string;
  entries: UploadedEntry[];
}
