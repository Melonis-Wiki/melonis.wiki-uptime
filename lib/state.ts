import type {
  CurrentServiceState,
  ProbeResult,
  ServiceState,
  StatusBucket,
  StoredSample,
} from "@/lib/types";

export const CHECK_INTERVAL_MS = 60_000;
export const HISTORY_WINDOW_MS = 24 * 60 * 60_000;
export const RETENTION_MS = 7 * 24 * 60 * 60_000;
export const BUCKET_COUNT = 48;

const STATE_WEIGHT: Record<ServiceState, number> = {
  unknown: 0,
  up: 1,
  degraded: 2,
  down: 3,
};

export function transitionState(
  previous: CurrentServiceState | null,
  result: ProbeResult,
  timestamp: number,
): CurrentServiceState {
  if (result.success) {
    return {
      state: "up",
      failureStreak: 0,
      latencyMs: result.latencyMs,
      lastCheckedAt: timestamp,
    };
  }

  const failureStreak = (previous?.failureStreak ?? 0) + 1;
  return {
    state: failureStreak >= 2 ? "down" : "degraded",
    failureStreak,
    latencyMs: result.latencyMs,
    lastCheckedAt: timestamp,
    errorCode: result.errorCode,
  };
}

export function toStoredSample(
  current: CurrentServiceState,
  result: ProbeResult,
): StoredSample {
  return {
    timestamp: current.lastCheckedAt,
    success: result.success,
    state: current.state,
    latencyMs: current.latencyMs,
    errorCode: current.errorCode,
  };
}

export function aggregateSamples(
  samples: StoredSample[],
  now: number,
): { uptimePercent: number | null; buckets: StatusBucket[] } {
  const windowStart = now - HISTORY_WINDOW_MS;
  const bucketMs = HISTORY_WINDOW_MS / BUCKET_COUNT;
  const relevant = samples.filter(
    (sample) => sample.timestamp >= windowStart && sample.timestamp <= now,
  );
  const states: ServiceState[] = Array.from(
    { length: BUCKET_COUNT },
    () => "unknown",
  );

  for (const sample of relevant) {
    const index = Math.min(
      BUCKET_COUNT - 1,
      Math.floor((sample.timestamp - windowStart) / bucketMs),
    );
    if (STATE_WEIGHT[sample.state] > STATE_WEIGHT[states[index]]) {
      states[index] = sample.state;
    }
  }

  const successes = relevant.filter((sample) => sample.success).length;
  const uptimePercent =
    relevant.length === 0
      ? null
      : Math.round((successes / relevant.length) * 10_000) / 100;

  return {
    uptimePercent,
    buckets: states.map((state, index) => ({
      from: new Date(windowStart + index * bucketMs).toISOString(),
      to: new Date(windowStart + (index + 1) * bucketMs).toISOString(),
      state,
    })),
  };
}

export function worstState(states: ServiceState[]): ServiceState {
  if (states.includes("down")) return "down";
  if (states.includes("degraded")) return "degraded";
  if (states.includes("unknown") || states.length === 0) return "unknown";
  return "up";
}
