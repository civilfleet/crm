import assert from "node:assert/strict";
import test from "node:test";
import {
  rateLimitSource,
  readRateLimitPerHour,
} from "@/lib/public-intake/rate-limit";

/* Who the bridge's per-IP limit counts as one source. */

test("IPv4 counts per address, also when written as IPv6", () => {
  assert.equal(rateLimitSource("203.0.113.7"), "203.0.113.7");
  assert.equal(rateLimitSource("::ffff:203.0.113.7"), "203.0.113.7");
  assert.notEqual(
    rateLimitSource("203.0.113.7"),
    rateLimitSource("203.0.113.8"),
  );
});

test("IPv6 counts per /64, however it is written", () => {
  const one = rateLimitSource("2001:db8:abcd:12:1::1");
  assert.equal(one, "2001:db8:abcd:12::/64");
  // Another address of the same /64, written differently.
  assert.equal(rateLimitSource("2001:0DB8:abcd:0012:ffff:ffff:ffff:fffe"), one);
  assert.equal(rateLimitSource("[2001:db8:abcd:12::99]"), one);
  assert.notEqual(rateLimitSource("2001:db8:abcd:13::1"), one);
  assert.equal(rateLimitSource("::1"), "0:0:0:0::/64");
});

test("missing addresses share one source; the limit has a safe default", () => {
  assert.equal(rateLimitSource(undefined), "unknown");
  assert.equal(readRateLimitPerHour(undefined), 300);
  assert.equal(readRateLimitPerHour("600"), 600);
  assert.equal(readRateLimitPerHour("-1"), 300);
});
