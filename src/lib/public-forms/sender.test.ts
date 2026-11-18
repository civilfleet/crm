import assert from "node:assert/strict";
import test from "node:test";
import { resolveFormSender } from "@/lib/public-forms/sender";

/* Who a form's confirmation e-mail comes from. */

const team = { email: "crm@sea-watch.org", name: "Sea-Watch" };

test("the form's own sender, on the team's verified domain", () => {
  assert.deepEqual(
    resolveFormSender(team, {
      senderName: "Sea-Watch Italia",
      senderLocalPart: "Firma",
      replyTo: "Petizione@Sea-Watch.org",
    }),
    {
      from: { email: "firma@sea-watch.org", name: "Sea-Watch Italia" },
      replyTo: "petizione@sea-watch.org",
    },
  );
});

test("the form cannot choose the domain: only the part before the @ counts", () => {
  for (const localPart of [
    "firma@evil.example",
    ".firma",
    "firma.",
    "fir ma",
    "a".repeat(65),
  ])
    assert.equal(
      resolveFormSender(team, { senderLocalPart: localPart }).from.email,
      "crm@sea-watch.org",
      localPart,
    );
});

test("anything missing or invalid falls back to the team's sender", () => {
  assert.deepEqual(resolveFormSender(team, undefined), {
    from: { email: "crm@sea-watch.org", name: "Sea-Watch" },
    replyTo: undefined,
  });
  const odd = resolveFormSender(team, {
    senderName: 'Evil" <x@y.z>',
    replyTo: "not an address",
  });
  assert.equal(odd.from.name, "Sea-Watch", "no header injection");
  assert.equal(odd.replyTo, undefined);
});
