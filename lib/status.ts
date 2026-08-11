import { getRedisClient } from "./redis.js";
import { RedisMonitorStore } from "./store.js";
import type { PublicStatus } from "./types.js";

export async function getStatusSnapshot(now = Date.now()): Promise<PublicStatus> {
  const client = await getRedisClient();
  await client.ping();
  return new RedisMonitorStore(client).getStatus(now);
}
