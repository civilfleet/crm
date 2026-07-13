import assert from "node:assert/strict";
import test from "node:test";
import { parseVCardContacts } from "@/lib/vcard";

test("parses multiple vCards and maps preferred contact fields", () => {
  const contacts = parseVCardContacts(`BEGIN:VCARD
VERSION:4.0
FN:Ada Example
EMAIL;TYPE=work;PREF=2:other@example.com
EMAIL;TYPE=home;PREF=1:ada@example.com
TEL;PREF=1:tel:+49-30-1234
ADR;PREF=1:;;Main Street 1;Berlin;Berlin;10115;Germany
URL:https://example.com
NOTE:First line
END:VCARD
BEGIN:VCARD
VERSION:3.0
N:Lovelace;Augusta;Ada;Countess;
TEL:+44 123
END:VCARD`);

  assert.equal(contacts.length, 2);
  assert.deepEqual(contacts[0], {
    name: "Ada Example",
    email: "ada@example.com",
    additionalEmails: [{ email: "other@example.com", label: "work" }],
    phone: "+49-30-1234",
    address: "Main Street 1",
    postalCode: "10115",
    city: "Berlin",
    state: "Berlin",
    country: "Germany",
    website: "https://example.com",
    notes: "First line",
    warnings: [],
  });
  assert.equal(contacts[1]?.name, "Countess Augusta Ada Lovelace");
  assert.equal(contacts[1]?.phone, "+44 123");
  assert.equal(contacts[1]?.email, undefined);
});

test("normalizes duplicate email addresses within a card", () => {
  const [contact] = parseVCardContacts(`BEGIN:VCARD
VERSION:2.1
FN:Example Person
EMAIL:mailto:PERSON@EXAMPLE.COM
EMAIL:person@example.com
END:VCARD`);

  assert.equal(contact?.email, "person@example.com");
  assert.deepEqual(contact?.additionalEmails, []);
});
