import assert from "node:assert/strict";
import test from "node:test";

import {
  HTTP_PROBES,
  runHttpProbe,
  TARGET_ORIGIN,
  validateFetchResponse,
  validateSearchResponse,
  validateWebsiteResponse,
} from "@/lib/probes";

test("target origin and probe paths are fixed to melonis.wiki", () => {
  assert.equal(TARGET_ORIGIN, "https://melonis.wiki");
  assert.deepEqual(
    HTTP_PROBES.map((probe) => probe.path),
    ["/", "/api/search?q=melonis", "/api/fetch?sections"],
  );
});

test("website validator requires a successful Melonis HTML document", async () => {
  assert.equal(
    await validateWebsiteResponse(
      new Response("<!doctype html><html><title>melonis.wiki</title></html>"),
    ),
    null,
  );
  assert.equal(
    await validateWebsiteResponse(new Response("up", { status: 200 })),
    "unexpected_body",
  );
  assert.equal(
    await validateWebsiteResponse(new Response("down", { status: 503 })),
    "http_status",
  );
});

test("search validator distinguishes malformed JSON and wrong contracts", async () => {
  assert.equal(
    await validateSearchResponse(
      Response.json({ results: [] }, { status: 200 }),
    ),
    null,
  );
  assert.equal(
    await validateSearchResponse(new Response("not-json", { status: 200 })),
    "invalid_json",
  );
  assert.equal(
    await validateSearchResponse(Response.json({ articles: [] })),
    "unexpected_body",
  );
});

test("fetch validator requires the sections success contract", async () => {
  assert.equal(
    await validateFetchResponse(
      Response.json({ ok: true, mode: "sections", sections: [] }),
    ),
    null,
  );
  assert.equal(
    await validateFetchResponse(
      Response.json({ ok: true, mode: "search", articles: [] }),
    ),
    "unexpected_body",
  );
  assert.equal(
    await validateFetchResponse(new Response("{}", { status: 500 })),
    "http_status",
  );
});

test("HTTP probe reports timeout without leaking the thrown error", async () => {
  const timeoutFetch: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("private upstream detail");
        error.name = "AbortError";
        reject(error);
      });
    });

  const result = await runHttpProbe(HTTP_PROBES[0], timeoutFetch, 5);
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "timeout");
  assert.deepEqual(Object.keys(result).sort(), [
    "errorCode",
    "latencyMs",
    "serviceId",
    "success",
  ]);
});
