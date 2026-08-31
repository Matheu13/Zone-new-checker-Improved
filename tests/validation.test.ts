import assert from "node:assert/strict";
import test from "node:test";

import { parseXtreamFromUrlLine } from "../lib/validation";

test("extracts Xtream origin, username, and password from a full M3U URL", () => {
  assert.deepEqual(
    parseXtreamFromUrlLine(
      "http://example.com:8080/get.php?username=demo-user&password=demo-pass&type=m3u_plus"
    ),
    {
      url: "http://example.com:8080",
      username: "demo-user",
      password: "demo-pass",
    }
  );
});

test("decodes URL-encoded Xtream credentials", () => {
  const result = parseXtreamFromUrlLine(
    "https://example.com/get.php?username=user%40example.com&password=a%2Bb%26c&type=m3u_plus"
  );

  assert.equal(result.username, "user@example.com");
  assert.equal(result.password, "a+b&c");
});
