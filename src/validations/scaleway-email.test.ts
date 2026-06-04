import assert from "node:assert/strict";
import test from "node:test";
import { sendMassEmailSchema } from "@/validations/scaleway-email";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";

test("sendMassEmailSchema normalizes and validates internal copy recipients", () => {
  const parsed = sendMassEmailSchema.parse({
    contactIds: [CONTACT_ID],
    subject: "Hello",
    html: "<p>Hello</p>",
    bccEmails: [" Internal@Example.Org ", "audit@example.org"],
    internalCopyMode: "summary_with_recipients",
  });

  assert.deepEqual(parsed.bccEmails, [
    "internal@example.org",
    "audit@example.org",
  ]);
  assert.equal(parsed.internalCopyMode, "summary_with_recipients");
});

test("sendMassEmailSchema rejects invalid internal copy recipients", () => {
  assert.throws(
    () =>
      sendMassEmailSchema.parse({
        contactIds: [CONTACT_ID],
        subject: "Hello",
        html: "<p>Hello</p>",
        bccEmails: ["not-an-email"],
      }),
    /Internal copy recipient must be a valid email address/,
  );
});

test("sendMassEmailSchema defaults internal copy mode to summary", () => {
  const parsed = sendMassEmailSchema.parse({
    contactIds: [CONTACT_ID],
    subject: "Hello",
    html: "<p>Hello</p>",
  });

  assert.equal(parsed.internalCopyMode, "summary");
});
