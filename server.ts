import { readFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";

import { closeRedisClient } from "./lib/redis.js";
import { startMonitorScheduler } from "./lib/scheduler.js";
import { getStatusSnapshot } from "./lib/status.js";

const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;

type StaticAsset = {
  body: Buffer;
  contentType: string;
  cacheControl: string;
};

async function loadStaticAssets(): Promise<Map<string, StaticAsset>> {
  const root = process.cwd();
  const definitions = [
    ["/", "public/index.html", "text/html; charset=utf-8", "no-cache"],
    ["/status.js", "public/status.js", "text/javascript; charset=utf-8", "public, max-age=3600"],
    ["/styles.css", "app/globals.css", "text/css; charset=utf-8", "public, max-age=3600"],
    ["/icon.png", "app/icon.png", "image/png", "public, max-age=86400"],
  ] as const;

  return new Map(
    await Promise.all(
      definitions.map(async ([route, file, contentType, cacheControl]) => [
        route,
        { body: await readFile(join(root, file)), contentType, cacheControl },
      ] as const),
    ),
  );
}

function applySecurityHeaders(response: ServerResponse): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
  if (process.env.NODE_ENV === "production") {
    response.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(payload);
}

async function main(): Promise<void> {
  const hostname = "0.0.0.0";
  const port = Number(process.env.PORT) || 3000;
  const staticAssets = await loadStaticAssets();
  const stopScheduler = startMonitorScheduler();
  const server = createServer(async (request, response) => {
    applySecurityHeaders(response);
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method Not Allowed" }, { Allow: "GET, HEAD" });
      return;
    }

    if (pathname === "/healthz") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (pathname === "/api/status") {
      try {
        sendJson(response, 200, await getStatusSnapshot());
      } catch (error) {
        console.error("[uptime] status snapshot unavailable", {
          message: error instanceof Error ? error.message : String(error),
        });
        sendJson(
          response,
          503,
          { error: "Данные мониторинга временно недоступны" },
          { "Retry-After": "30" },
        );
      }
      return;
    }

    const asset = staticAssets.get(pathname);
    if (!asset) {
      sendJson(response, 404, { error: "Not Found" });
      return;
    }

    response.writeHead(200, {
      "Content-Type": asset.contentType,
      "Content-Length": asset.body.byteLength,
      "Cache-Control": asset.cacheControl,
    });
    response.end(request.method === "HEAD" ? undefined : asset.body);
  });

  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;

  await new Promise<void>((resolve, reject) => {
    server.listen(port, hostname, resolve);
    server.once("error", reject);
  });
  console.info(`[uptime] ready on http://${hostname}:${port}`);

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
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
