import mysql from "mysql2/promise";

import type { ProbeErrorCode, ProbeResult, ServiceId } from "@/lib/types";

export const TARGET_ORIGIN = "https://melonis.wiki";
export const PROBE_TIMEOUT_MS = 10_000;

type HttpProbeDefinition = {
  serviceId: Exclude<ServiceId, "database">;
  path: string;
  accept: string;
  validate: (response: Response) => Promise<ProbeErrorCode | null>;
};

export const HTTP_PROBES: readonly HttpProbeDefinition[] = [
  {
    serviceId: "website",
    path: "/",
    accept: "text/html",
    validate: validateWebsiteResponse,
  },
  {
    serviceId: "search",
    path: "/api/search?q=melonis",
    accept: "application/json",
    validate: validateSearchResponse,
  },
  {
    serviceId: "fetch",
    path: "/api/fetch?sections",
    accept: "application/json",
    validate: validateFetchResponse,
  },
] as const;

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function validateWebsiteResponse(
  response: Response,
): Promise<ProbeErrorCode | null> {
  if (!response.ok) return "http_status";
  const body = await response.text();
  if (!/<html(?:\s|>)/i.test(body) || !/melonis(?:\.wiki)?/i.test(body)) {
    return "unexpected_body";
  }
  return null;
}

export async function validateSearchResponse(
  response: Response,
): Promise<ProbeErrorCode | null> {
  if (!response.ok) return "http_status";
  const body = await readJson(response);
  if (body === undefined) return "invalid_json";
  if (
    typeof body !== "object" ||
    body === null ||
    !("results" in body) ||
    !Array.isArray(body.results)
  ) {
    return "unexpected_body";
  }
  return null;
}

export async function validateFetchResponse(
  response: Response,
): Promise<ProbeErrorCode | null> {
  if (!response.ok) return "http_status";
  const body = await readJson(response);
  if (body === undefined) return "invalid_json";
  if (
    typeof body !== "object" ||
    body === null ||
    !("ok" in body) ||
    body.ok !== true ||
    !("mode" in body) ||
    body.mode !== "sections" ||
    !("sections" in body) ||
    !Array.isArray(body.sections)
  ) {
    return "unexpected_body";
  }
  return null;
}

export async function runHttpProbe(
  definition: HttpProbeDefinition,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<ProbeResult> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${TARGET_ORIGIN}${definition.path}`, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        Accept: definition.accept,
        "User-Agent": "MelonisUptime/1.0 (+https://melonis.wiki)",
      },
      signal: controller.signal,
    });
    const errorCode = await definition.validate(response);
    return {
      serviceId: definition.serviceId,
      success: errorCode === null,
      latencyMs: elapsedMs(startedAt),
      ...(errorCode ? { errorCode } : {}),
    };
  } catch (error) {
    const timedOut =
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError");
    return {
      serviceId: definition.serviceId,
      success: false,
      latencyMs: elapsedMs(startedAt),
      errorCode: timedOut ? "timeout" : "network",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runDatabaseProbe(
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<ProbeResult> {
  const startedAt = performance.now();
  const databaseUrl = process.env.DB?.trim();
  if (!databaseUrl) {
    return {
      serviceId: "database",
      success: false,
      latencyMs: elapsedMs(startedAt),
      errorCode: "configuration",
    };
  }

  let connection: mysql.Connection | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    connection = await mysql.createConnection({
      uri: databaseUrl,
      connectTimeout: timeoutMs,
      enableKeepAlive: true,
    });
    await Promise.race([
      connection.query("SELECT 1 AS ok"),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("database_timeout")), timeoutMs);
      }),
    ]);
    return {
      serviceId: "database",
      success: true,
      latencyMs: elapsedMs(startedAt),
    };
  } catch (error) {
    return {
      serviceId: "database",
      success: false,
      latencyMs: elapsedMs(startedAt),
      errorCode:
        error instanceof Error && error.message === "database_timeout"
          ? "timeout"
          : "database",
    };
  } finally {
    if (timer) clearTimeout(timer);
    connection?.destroy();
  }
}

export async function runAllProbes(): Promise<ProbeResult[]> {
  return Promise.all([
    ...HTTP_PROBES.map((definition) => runHttpProbe(definition)),
    runDatabaseProbe(),
  ]);
}
