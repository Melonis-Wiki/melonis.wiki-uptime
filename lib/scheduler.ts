import { CHECK_INTERVAL_MS } from "@/lib/state";
import { runAllProbes } from "@/lib/probes";
import { getRedisClient } from "@/lib/redis";
import { RedisMonitorStore } from "@/lib/store";

let stopScheduler: (() => void) | null = null;

export async function runMonitoringCycle(timestamp = Date.now()): Promise<void> {
  const client = await getRedisClient();
  const store = new RedisMonitorStore(client);
  if (!(await store.claimMinute(timestamp))) return;

  const results = await runAllProbes();
  await store.saveCycle(results, timestamp);
  console.info("[uptime] monitoring cycle complete", {
    timestamp: new Date(timestamp).toISOString(),
    results: results.map(({ serviceId, success, latencyMs, errorCode }) => ({
      serviceId,
      success,
      latencyMs,
      errorCode,
    })),
  });
}

function runSafely(): void {
  void runMonitoringCycle().catch((error) => {
    console.error("[uptime] monitoring cycle failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

export function startMonitorScheduler(): () => void {
  if (stopScheduler) return stopScheduler;

  let interval: ReturnType<typeof setInterval> | undefined;
  const delayToBoundary = CHECK_INTERVAL_MS - (Date.now() % CHECK_INTERVAL_MS);
  runSafely();
  const boundaryTimer = setTimeout(() => {
    runSafely();
    interval = setInterval(runSafely, CHECK_INTERVAL_MS);
    interval.unref();
  }, delayToBoundary);
  boundaryTimer.unref();

  stopScheduler = () => {
    clearTimeout(boundaryTimer);
    if (interval) clearInterval(interval);
    stopScheduler = null;
  };
  return stopScheduler;
}
