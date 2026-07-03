import { getRedisClient } from "@/lib/redis";
import { RedisMonitorStore } from "@/lib/store";
import type { PublicStatus } from "@/lib/types";

export async function getStatusSnapshot(now = Date.now()): Promise<PublicStatus> {
  const client = await getRedisClient();
  await client.ping();
  return new RedisMonitorStore(client).getStatus(now);
}
