import assert from "node:assert/strict";
import test from "node:test";
import { resolveInboundRecipientEmail } from "@/services/contact-engagements/recipient";

test("prefers the configured inbox when the To header has multiple recipients", () => {
  assert.equal(
    resolveInboundRecipientEmail({
      rawHeaders: {
        to: JSON.stringify({
          value: [
            { address: "other@example.org" },
            { address: "inbox@example.org" },
          ],
        }),
      },
      inboxUsername: "inbox@example.org",
    }),
    "inbox@example.org",
  );
});

test("falls back to the first To address and then the inbox username", () => {
  assert.equal(
    resolveInboundRecipientEmail({
      rawHeaders: { to: "Person <alias@example.org>" },
      inboxUsername: "inbox@example.org",
    }),
    "alias@example.org",
  );
  assert.equal(
    resolveInboundRecipientEmail({
      rawHeaders: null,
      inboxUsername: "inbox@example.org",
    }),
    "inbox@example.org",
  );
});
