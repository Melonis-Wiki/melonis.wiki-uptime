import type { createClient } from "redis";

import {
  aggregateSamples,
  CHECK_INTERVAL_MS,
  RETENTION_MS,
  toStoredSample,
  transitionState,
  worstState,
} from "@/lib/state";
import {
  SERVICE_IDS,
  SERVICE_NAMES,
  type CurrentServiceState,
  type ProbeResult,
  type PublicServiceStatus,
  type PublicStatus,
  type ServiceId,
  type StoredSample,
} from "@/lib/types";

type RedisClient = ReturnType<typeof createClient>;

function parseJson<T>(raw: string | undefined | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class RedisMonitorStore {
  constructor(
    private readonly client: RedisClient,
    private readonly prefix = "melonis:uptime",
  ) {}

  private get currentKey(): string {
    return `${this.prefix}:current`;
  }

  private historyKey(serviceId: ServiceId): string {
    return `${this.prefix}:history:${serviceId}`;
  }

  async claimMinute(timestamp: number): Promise<boolean> {
    const minute = Math.floor(timestamp / 60_000);
    const result = await this.client.set(
      `${this.prefix}:lock:${minute}`,
      String(process.pid),
      { NX: true, PX: 120_000 },
    );
    return result === "OK";
  }

  async saveCycle(results: ProbeResult[], timestamp: number): Promise<void> {
    const rawCurrent = await this.client.hGetAll(this.currentKey);
    const transaction = this.client.multi();
    const retentionBoundary = timestamp - RETENTION_MS;

    for (const result of results) {
      const previous = parseJson<CurrentServiceState>(rawCurrent[result.serviceId]);
      const current = transitionState(previous, result, timestamp);
      const sample = toStoredSample(current, result);
      transaction.hSet(this.currentKey, result.serviceId, JSON.stringify(current));
      transaction.zAdd(this.historyKey(result.serviceId), [
        { score: timestamp, value: JSON.stringify(sample) },
      ]);
      transaction.zRemRangeByScore(
        this.historyKey(result.serviceId),
        0,
        retentionBoundary,
      );
    }

    await transaction.exec();
  }

  async getStatus(now = Date.now()): Promise<PublicStatus> {
    const rawCurrent = await this.client.hGetAll(this.currentKey);
    const serviceStatuses = await Promise.all(
      SERVICE_IDS.map(async (serviceId): Promise<PublicServiceStatus> => {
        const rawSamples = await this.client.zRangeByScore(
          this.historyKey(serviceId),
          now - 24 * 60 * 60_000,
          now,
        );
        const samples = rawSamples
          .map((raw) => parseJson<StoredSample>(raw))
          .filter((sample): sample is StoredSample => sample !== null);
        const current = parseJson<CurrentServiceState>(rawCurrent[serviceId]);
        const isFresh =
          current !== null && now - current.lastCheckedAt <= CHECK_INTERVAL_MS * 3;
        const aggregate = aggregateSamples(samples, now);

        return {
          id: serviceId,
          name: SERVICE_NAMES[serviceId],
          state: isFresh ? current.state : "unknown",
          uptimePercent: aggregate.uptimePercent,
          latencyMs: isFresh ? current.latencyMs : null,
          lastCheckedAt: current
            ? new Date(current.lastCheckedAt).toISOString()
            : null,
          buckets: aggregate.buckets,
        };
      }),
    );

    return {
      generatedAt: new Date(now).toISOString(),
      windowHours: 24,
      overall: worstState(serviceStatuses.map((service) => service.state)),
      services: serviceStatuses,
    };
  }

  async clearAll(): Promise<void> {
    const keys = await this.client.keys(`${this.prefix}:*`);
    if (keys.length > 0) await this.client.del(keys);
  }
}
