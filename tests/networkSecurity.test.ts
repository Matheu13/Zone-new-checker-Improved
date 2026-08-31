import assert from "node:assert/strict";
import test from "node:test";
import { assertSafePublicUrl, isExactDomainOrSubdomain, isPrivateOrReservedIp } from "../lib/networkSecurity";

test("blocks private, loopback, link-local, and documentation IPv4 ranges", () => {
  for (const address of [
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.168.1.1",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
  ]) {
    assert.equal(isPrivateOrReservedIp(address), true, address);
  }
});

test("allows ordinary public IPv4 addresses", () => {
  assert.equal(isPrivateOrReservedIp("1.1.1.1"), false);
  assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);
});

test("blocks private and mapped-private IPv6 addresses", () => {
  for (const address of ["::", "::1", "fc00::1", "fe80::1", "2001:db8::1", "::ffff:127.0.0.1", "::ffff:7f00:1"]) {
    assert.equal(isPrivateOrReservedIp(address), true, address);
  }
  assert.equal(isPrivateOrReservedIp("2606:4700:4700::1111"), false);
});

test("domain matching cannot be bypassed with a suffix lookalike", () => {
  assert.equal(isExactDomainOrSubdomain("reddit.com", "reddit.com"), true);
  assert.equal(isExactDomainOrSubdomain("old.reddit.com", "reddit.com"), true);
  assert.equal(isExactDomainOrSubdomain("reddit.com.", "reddit.com"), true);
  assert.equal(isExactDomainOrSubdomain("evilreddit.com", "reddit.com"), false);
  assert.equal(isExactDomainOrSubdomain("reddit.com.attacker.example", "reddit.com"), false);
});

test("public URL validation handles bracketed IPv6 literals", async () => {
  await assert.rejects(() => assertSafePublicUrl("http://[::1]/"), /private|reserved/i);
  const publicUrl = await assertSafePublicUrl("https://[2606:4700:4700::1111]/");
  assert.equal(publicUrl.hostname, "[2606:4700:4700::1111]");
});
