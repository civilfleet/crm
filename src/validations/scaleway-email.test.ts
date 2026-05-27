import assert from "node:assert/strict";
import test from "node:test";
import { sendMassEmailSchema } from "@/validations/scaleway-email";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";

test("sendMassEmailSchema normalizes and validates BCC recipients", () => {
  const parsed = sendMassEmailSchema.parse({
    contactIds: [CONTACT_ID],
    subject: "Hello",
    html: "<p>Hello</p>",
    bccEmails: [" Internal@Example.Org ", "audit@example.org"],
  });

  assert.deepEqual(parsed.bccEmails, [
    "internal@example.org",
    "audit@example.org",
  ]);
});

test("sendMassEmailSchema rejects invalid BCC recipients", () => {
  assert.throws(
    () =>
      sendMassEmailSchema.parse({
        contactIds: [CONTACT_ID],
        subject: "Hello",
        html: "<p>Hello</p>",
        bccEmails: ["not-an-email"],
      }),
    /BCC recipient must be a valid email address/,
  );
});
