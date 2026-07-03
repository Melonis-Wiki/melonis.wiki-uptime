import { createServer } from "node:http";
import next from "next";

import { closeRedisClient } from "@/lib/redis";
import { startMonitorScheduler } from "@/lib/scheduler";

async function main(): Promise<void> {
  const dev = process.env.NODE_ENV !== "production";
  const hostname = "0.0.0.0";
  const port = Number(process.env.PORT) || 3000;
  const app = next({ dev, hostname, port, turbopack: false });
  const handle = app.getRequestHandler();

  await app.prepare();
  const stopScheduler = startMonitorScheduler();
  const server = createServer((request, response) => {
    if (request.url === "/healthz") {
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    void handle(request, response).catch(
      (error: unknown) => {
        console.error("[uptime] request handler failed", error);
        if (!response.headersSent) {
          response.statusCode = 500;
          response.end("Internal Server Error");
        }
      },
    );
  });

  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;

  await new Promise<void>((resolve, reject) => {
    server.listen(port, hostname, resolve);
    server.once("error", reject);
  });
  console.info(`[uptime] ready on http://${hostname}:${port}`);

  const shutdown = (signal: string) => {
    console.info(`[uptime] ${signal} received, shutting down`);
    stopScheduler();
    server.close(() => {
      void closeRedisClient().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  console.error("[uptime] fatal", error);
  process.exit(1);
});
