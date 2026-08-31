import assert from "node:assert/strict";
import test from "node:test";
import { isHumanVerified } from "../lib/humanVerification";

test("missing cookie secret fails closed except for explicit development bypass", { concurrency: false }, async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.HUMAN_COOKIE_SECRET;
  const originalSkip = process.env.SKIP_HUMAN_VERIFICATION;
  const request = new Request("https://example.test");

  try {
    delete process.env.HUMAN_COOKIE_SECRET;
    delete process.env.SKIP_HUMAN_VERIFICATION;
    Reflect.set(process.env, "NODE_ENV", "production");
    assert.equal(await isHumanVerified(request, Date.now()), false);

    Reflect.set(process.env, "NODE_ENV", "development");
    assert.equal(await isHumanVerified(request, Date.now()), false);

    process.env.SKIP_HUMAN_VERIFICATION = "1";
    assert.equal(await isHumanVerified(request, Date.now()), true);
  } finally {
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
    if (originalSecret === undefined) delete process.env.HUMAN_COOKIE_SECRET;
    else process.env.HUMAN_COOKIE_SECRET = originalSecret;
    if (originalSkip === undefined) delete process.env.SKIP_HUMAN_VERIFICATION;
    else process.env.SKIP_HUMAN_VERIFICATION = originalSkip;
  }
});
