import assert from "node:assert/strict";
import test from "node:test";
import { readJsonBody, readResponseBytes, safeJson } from "../lib/http";

test("readResponseBytes enforces declared and streamed size limits", async () => {
  const declared = new Response("small", { headers: { "content-length": "100" } });
  await assert.rejects(() => readResponseBytes(declared, 10), /too large/i);

  const streamed = new Response("this response is too long");
  await assert.rejects(() => readResponseBytes(streamed, 5), /too large/i);
});

test("safeJson does not include remote HTML in its error", async () => {
  const secretMarker = "sensitive-upstream-content";
  await assert.rejects(
    () => safeJson(new Response(`<html>${secretMarker}</html>`)),
    (error: unknown) => error instanceof Error && !error.message.includes(secretMarker)
  );
});

test("readJsonBody parses bounded JSON and rejects oversized bodies", async () => {
  const req = new Request("https://example.test", { method: "POST", body: JSON.stringify({ ok: true }) });
  assert.deepEqual(await readJsonBody(req, 100), { ok: true });

  const oversized = new Request("https://example.test", { method: "POST", body: JSON.stringify({ value: "x".repeat(100) }) });
  await assert.rejects(() => readJsonBody(oversized, 20), /too large/i);
});
