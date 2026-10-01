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

test("HTTP probes target the production origins and paths", () => {
  assert.equal(TARGET_ORIGIN, "https://melonis.wiki");
  assert.deepEqual(
    HTTP_PROBES.map((probe) => `${probe.origin}${probe.path}`),
    [
      "https://melonis.wiki/",
      "https://melonis.wiki/api/search?q=melonis",
      "https://melonis.wiki/api/fetch?sections",
      "https://maps.melonis.wiki/",
    ],
  );
});

test("maps probe requests the production map site and validates its HTML", async () => {
  const probe = HTTP_PROBES.find((definition) => definition.serviceId === "maps");
  assert.ok(probe);
  const mapsFetch: typeof fetch = async (input, init) => {
    assert.equal(input, "https://maps.melonis.wiki/");
    assert.equal(new Headers(init?.headers).get("Accept"), "text/html");
    return new Response("<!doctype html><html><title>Melonis Maps — история спавна</title></html>");
  };

  const result = await runHttpProbe(probe, mapsFetch);
  assert.equal(result.serviceId, "maps");
  assert.equal(result.success, true);

  const failedResult = await runHttpProbe(probe, async () => new Response("up"));
  assert.equal(failedResult.success, false);
  assert.equal(failedResult.errorCode, "unexpected_body");
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
