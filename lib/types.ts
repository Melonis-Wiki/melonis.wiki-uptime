export const SERVICE_IDS = ["website", "search", "fetch", "database"] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];
export type ServiceState = "up" | "degraded" | "down" | "unknown";

export const SERVICE_NAMES: Record<ServiceId, string> = {
  website: "Основной сайт",
  search: "Поиск",
  fetch: "Fetch API",
  database: "База данных",
};

export type ProbeErrorCode =
  | "timeout"
  | "network"
  | "http_status"
  | "invalid_json"
  | "unexpected_body"
  | "configuration"
  | "database";

export type ProbeResult = {
  serviceId: ServiceId;
  success: boolean;
  latencyMs: number;
  errorCode?: ProbeErrorCode;
};

export type CurrentServiceState = {
  state: Exclude<ServiceState, "unknown">;
  failureStreak: number;
  latencyMs: number;
  lastCheckedAt: number;
  errorCode?: ProbeErrorCode;
};

export type StoredSample = {
  timestamp: number;
  success: boolean;
  state: Exclude<ServiceState, "unknown">;
  latencyMs: number;
  errorCode?: ProbeErrorCode;
};

export type StatusBucket = {
  from: string;
  to: string;
  state: ServiceState;
};

export type PublicServiceStatus = {
  id: ServiceId;
  name: string;
  state: ServiceState;
  uptimePercent: number | null;
  latencyMs: number | null;
  lastCheckedAt: string | null;
  buckets: StatusBucket[];
};

export type PublicStatus = {
  generatedAt: string;
  windowHours: 24;
  overall: ServiceState;
  services: PublicServiceStatus[];
};
