import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "redis";

import type { UptimeRedisClient } from "@/lib/redis";
import { RETENTION_MS } from "@/lib/state";
import { RedisMonitorStore } from "@/lib/store";

const redisUrl = process.env.TEST_REDIS_URL?.trim();

test(
  "Redis store locks each minute, persists state, and prunes old samples",
  { skip: !redisUrl },
  async () => {
    const client: UptimeRedisClient = createClient({ url: redisUrl });
    await client.connect();
    const prefix = `melonis:uptime:test:${process.pid}:${Date.now()}`;
    const store = new RedisMonitorStore(client, prefix);
    const now = Date.now();

    try {
      assert.equal(await store.claimMinute(now), true);
      assert.equal(await store.claimMinute(now), false);

      await store.saveCycle(
        [
          { serviceId: "website", success: false, latencyMs: 100, errorCode: "network" },
          { serviceId: "search", success: true, latencyMs: 20 },
          { serviceId: "fetch", success: true, latencyMs: 25 },
          { serviceId: "database", success: true, latencyMs: 5 },
          { serviceId: "maps", success: true, latencyMs: 30 },
        ],
        now - RETENTION_MS - 1,
      );
      await store.saveCycle(
        [
          { serviceId: "website", success: false, latencyMs: 100, errorCode: "network" },
          { serviceId: "search", success: true, latencyMs: 20 },
          { serviceId: "fetch", success: true, latencyMs: 25 },
          { serviceId: "database", success: true, latencyMs: 5 },
          { serviceId: "maps", success: true, latencyMs: 30 },
        ],
        now,
      );

      const status = await store.getStatus(now);
      assert.equal(status.services.length, 5);
      assert.equal(status.services[0].state, "down");
      assert.equal(status.services[0].uptimePercent, 0);
      assert.equal(status.services[1].state, "up");
      const mapsStatus = status.services.find((service) => service.id === "maps");
      assert.ok(mapsStatus);
      assert.equal(mapsStatus.name, "Карты");
      assert.equal(mapsStatus.state, "up");
      assert.equal(mapsStatus.uptimePercent, 100);
      assert.equal(mapsStatus.latencyMs, 30);

      const staleStatus = await store.getStatus(now + 3 * 60_000 + 1);
      assert.equal(staleStatus.services[0].state, "unknown");
      assert.equal(staleStatus.services[0].latencyMs, null);

      const historyCount = await client.zCard(`${prefix}:history:website`);
      assert.equal(historyCount, 1);
    } finally {
      await store.clearAll();
      await client.quit();
    }
  },
);
