import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateSamples,
  BUCKET_COUNT,
  HISTORY_WINDOW_MS,
  transitionState,
  worstState,
} from "@/lib/state";
import type { ProbeResult, StoredSample } from "@/lib/types";

const failure: ProbeResult = {
  serviceId: "website",
  success: false,
  latencyMs: 100,
  errorCode: "network",
};
const success: ProbeResult = {
  serviceId: "website",
  success: true,
  latencyMs: 42,
};

test("service becomes degraded, then down, and recovers after one success", () => {
  const firstFailure = transitionState(null, failure, 1);
  assert.equal(firstFailure.state, "degraded");
  assert.equal(firstFailure.failureStreak, 1);

  const secondFailure = transitionState(firstFailure, failure, 2);
  assert.equal(secondFailure.state, "down");
  assert.equal(secondFailure.failureStreak, 2);

  const recovered = transitionState(secondFailure, success, 3);
  assert.equal(recovered.state, "up");
  assert.equal(recovered.failureStreak, 0);
  assert.equal(recovered.errorCode, undefined);
});

test("aggregation returns 48 buckets and raw check availability", () => {
  const now = Date.UTC(2026, 6, 3, 12);
  const samples: StoredSample[] = [
    {
      timestamp: now - 31 * 60_000,
      success: true,
      state: "up",
      latencyMs: 20,
    },
    {
      timestamp: now - 30 * 60_000,
      success: false,
      state: "degraded",
      latencyMs: 100,
      errorCode: "network",
    },
    {
      timestamp: now - 29 * 60_000,
      success: false,
      state: "down",
      latencyMs: 100,
      errorCode: "network",
    },
    {
      timestamp: now - HISTORY_WINDOW_MS - 1,
      success: false,
      state: "down",
      latencyMs: 100,
    },
  ];

  const result = aggregateSamples(samples, now);
  assert.equal(result.buckets.length, BUCKET_COUNT);
  assert.equal(result.uptimePercent, 33.33);
  assert.equal(result.buckets.at(-1)?.state, "down");
  assert.equal(
    result.buckets.filter((bucket) => bucket.state === "unknown").length,
    BUCKET_COUNT - 2,
  );
});

test("empty aggregation is unknown and overall state uses worst component", () => {
  const aggregate = aggregateSamples([], Date.now());
  assert.equal(aggregate.uptimePercent, null);
  assert.ok(aggregate.buckets.every((bucket) => bucket.state === "unknown"));
  assert.equal(worstState(["up", "degraded", "unknown"]), "degraded");
  assert.equal(worstState(["up", "down"]), "down");
  assert.equal(worstState(["up", "unknown"]), "unknown");
  assert.equal(worstState(["unknown", "unknown"]), "unknown");
});
