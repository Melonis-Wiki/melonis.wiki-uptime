import { createClient, type RedisClientType } from "redis";

export type UptimeRedisClient = RedisClientType;

let clientPromise: Promise<UptimeRedisClient> | null = null;

export async function getRedisClient(): Promise<UptimeRedisClient> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) throw new Error("REDIS_URL is not configured");

  if (!clientPromise) {
    const client: UptimeRedisClient = createClient({
      url,
      socket: {
        connectTimeout: 5_000,
        reconnectStrategy: false,
      },
    });
    client.on("error", (error) => {
      console.error("[uptime] redis error", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
    clientPromise = client
      .connect()
      .then(() => client)
      .catch((error: unknown) => {
        clientPromise = null;
        throw error;
      });
  }

  const client = await clientPromise;
  if (!client.isOpen) {
    clientPromise = null;
    return getRedisClient();
  }
  return client;
}

export async function closeRedisClient(): Promise<void> {
  if (!clientPromise) return;
  try {
    const client = await clientPromise;
    if (client.isOpen) await client.quit();
  } finally {
    clientPromise = null;
  }
}
