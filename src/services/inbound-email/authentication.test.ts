import assert from "node:assert/strict";
import test from "node:test";
import { parseInboundAuthentication } from "./authentication";

test("accepts DMARC pass only from a trusted authentication service", () => {
  const result = parseInboundAuthentication(
    [
      {
        key: "authentication-results",
        line: "Authentication-Results: mx.example.org; dmarc=pass; spf=pass; dkim=pass",
      },
    ],
    ["mx.example.org"],
  );

  assert.equal(result.status, "PASS");
  assert.equal(result.dmarc, "pass");
});

test("ignores a forged pass header from an untrusted service", () => {
  const result = parseInboundAuthentication(
    [
      {
        key: "authentication-results",
        line: "Authentication-Results: attacker.example; dmarc=pass; spf=pass; dkim=pass",
      },
      {
        key: "authentication-results",
        line: "Authentication-Results: mx.example.org; dmarc=fail; spf=fail; dkim=fail",
      },
    ],
    ["mx.example.org"],
  );

  assert.equal(result.status, "FAIL");
  assert.equal(result.authservId, "mx.example.org");
});

test("quarantines mail when trusted authentication evidence is unavailable", () => {
  assert.equal(parseInboundAuthentication([], []).status, "UNKNOWN");
  assert.equal(
    parseInboundAuthentication([], ["mx.example.org"]).status,
    "UNKNOWN",
  );
});
