import assert from "node:assert/strict";
import test from "node:test";

import { GET as healthcheck } from "@/app/healthz/route";
import { buildStatusResponse } from "@/lib/status-response";
import type { PublicStatus } from "@/lib/types";

const fixture: PublicStatus = {
  generatedAt: "2026-07-03T12:00:00.000Z",
  windowHours: 24,
  overall: "up",
  services: [],
};

test("healthcheck reports process liveness independently", async () => {
  const response = await healthcheck();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true });
});

test("status endpoint returns the public snapshot contract", async () => {
  const response = await buildStatusResponse(async () => fixture);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), fixture);
});

test("status endpoint returns a safe 503 when storage fails", async () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const response = await buildStatusResponse(async () => {
      throw new Error("redis://user:secret@example.internal");
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "30");
    const body = await response.text();
    assert.match(body, /временно недоступны/);
    assert.doesNotMatch(body, /secret|example\.internal/);
  } finally {
    console.error = originalError;
  }
});
