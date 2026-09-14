import assert from "node:assert/strict";
import test from "node:test";
import { extractContactName, parseContactPaste } from "@/lib/contact-paste";

test("extracts a labelled German contact and normalises a website", () => {
  assert.deepEqual(
    parseContactPaste(
      "Name: Anna Müller\nE-Mail: anna@example.org\nTelefon: +49 30 1234567\nWebsite: www.example.org\nMusterstraße 12\n10115 Berlin\nLand: Deutschland",
    ),
    {
      name: "Anna Müller",
      email: "anna@example.org",
      phone: "+49 30 1234567",
      website: "https://www.example.org",
      address: "Musterstraße 12",
      postalCode: "10115",
      city: "Berlin",
      country: "Deutschland",
    },
  );
});

test("extracts unlabelled links and phones without guessing a name", () => {
  assert.deepEqual(
    parseContactPaste(
      "Contact us\njane@example.org\n+44 (0)20 1234 5678\nhttps://example.org/team.",
    ),
    {
      email: "jane@example.org",
      phone: "+44 (0)20 1234 5678",
      website: "https://example.org/team",
    },
  );
});

test("does not treat dates or postal codes as phones, or unsafe URLs as websites", () => {
  assert.equal(parseContactPaste("2026-09-14\n10115 Berlin").phone, undefined);
  assert.equal(
    parseContactPaste("Website: javascript:alert(1)").website,
    undefined,
  );
  assert.deepEqual(parseContactPaste(""), {});
});

test("preserves original name casing and joins word pieces", () => {
  assert.equal(
    extractContactName("Jane Smithson", [
      { word: "jane", entity: "B-PERSON", score: 0.99, index: 1 },
      { word: "smith", entity: "I-PERSON", score: 0.99, index: 2 },
      { word: "##son", entity: "I-PERSON", score: 0.99, index: 3 },
    ]),
    "Jane Smithson",
  );
});

test("does not select between multiple people or accept low-confidence names", () => {
  assert.equal(
    extractContactName("Jane and John", [
      { word: "jane", entity: "B-PERSON", score: 0.99, index: 1 },
      { word: "and", entity: "O", score: 0.99, index: 2 },
      { word: "john", entity: "B-PERSON", score: 0.99, index: 3 },
    ]),
    undefined,
  );
  assert.equal(
    extractContactName("Berlin", [
      { word: "berlin", entity: "B-PERSON", score: 0.4, index: 1 },
    ]),
    undefined,
  );
});

test("preserves accented names despite the model's accent stripping", () => {
  assert.equal(
    extractContactName("Anna Müller", [
      { word: "anna", entity: "B-PERSON", score: 0.76, index: 1 },
      { word: "muller", entity: "I-PERSON", score: 0.83, index: 2 },
    ]),
    "Anna Müller",
  );
});

test("rejects a weak full name instead of filling just its surname", () => {
  assert.equal(
    extractContactName("Jane Smith", [
      { word: "jane", entity: "B-PERSON", score: 0.4, index: 1 },
      { word: "smith", entity: "I-PERSON", score: 0.99, index: 2 },
    ]),
    undefined,
  );
});

test("recognises a name above a German postal address without the detector", () => {
  assert.deepEqual(
    parseContactPaste(
      "Qiong Wu\nBeispiel Str. 28A\n64295 Darmstadt\nDeutschland",
    ),
    {
      name: "Qiong Wu",
      address: "Beispiel Str. 28A",
      postalCode: "64295",
      city: "Darmstadt",
      country: "Deutschland",
    },
  );
});

test("preserves accented and hyphenated names in address blocks", () => {
  assert.equal(
    parseContactPaste(
      "  Élodie Müller-Santos\r\n\r\nMusterstraße 12\r\n10115 Berlin\r\nGermany ",
    ).name,
    "Élodie Müller-Santos",
  );
});

test("does not use common headings, companies, or multiple people as names", () => {
  for (const heading of [
    "Contact Details",
    "Unser Team",
    "Example GmbH",
    "Jane und John",
  ]) {
    assert.equal(
      parseContactPaste(`${heading}\nMusterstraße 12\n10115 Berlin`).name,
      undefined,
    );
  }
  assert.equal(parseContactPaste("Qiong Wu\nDeutschland").name, undefined);
  assert.equal(
    parseContactPaste("Name: Anna Müller\nMusterstraße 12\n10115 Berlin").name,
    "Anna Müller",
  );
});

test("keeps continuation pieces together even when the model marks them as beginnings", () => {
  assert.equal(
    extractContactName("Qiong Wu", [
      { word: "qi", entity: "B-PERSON", score: 0.9, index: 1 },
      { word: "##ong", entity: "B-PERSON", score: 0.9, index: 2 },
      { word: "wu", entity: "I-PERSON", score: 0.9, index: 3 },
    ]),
    "Qiong Wu",
  );
});

test("recognises names with contact channels interleaved in the address block", () => {
  const name = "Qiong Wu";
  const street = "Beispiel Str. 28A";
  const city = "64295 Darmstadt";
  const email = "qiong.wu@example.org";
  for (const lines of [
    [name, email, street, city, "Deutschland"],
    [name, street, email, city, "Deutschland"],
    [
      name,
      `Email: ${email}`,
      "Telefon: +49 30 1234567",
      street,
      "Website: https://example.org",
      city,
    ],
    [name, "Signal: +49 170 1234567", email, street, city],
  ]) {
    const fields = parseContactPaste(lines.join("\n"));
    assert.equal(fields.name, name);
    assert.equal(fields.email, email);
    assert.equal(fields.address, street);
    assert.equal(fields.postalCode, "64295");
    assert.equal(fields.city, "Darmstadt");
  }
});

test("does not skip another person or prose containing a contact channel", () => {
  for (const extra of [
    "Jane Smith",
    "Jane Smith jane@example.org",
    "Ask Jane at jane@example.org",
  ]) {
    assert.equal(
      parseContactPaste(`Qiong Wu\n${extra}\nMusterstraße 12\n10115 Berlin`)
        .name,
      undefined,
    );
  }
  assert.equal(
    parseContactPaste(
      "Contact Details\ninfo@example.org\nMusterstraße 12\n10115 Berlin",
    ).name,
    undefined,
  );
});

test("extracts a business signature with a role, company, and combined address", () => {
  assert.deepEqual(
    parseContactPaste(`Christian Großstück
Inside Sales Manager New Business
B2B Sales – Inside Sales New Channels | im Auftrag der Example Germany GmbH & Co. OHG

Beispielstr. 1, 04109 Leipzig

T +49 89 1234 5678 9

christian.grossstueck.external@example.org`),
    {
      name: "Christian Großstück",
      email: "christian.grossstueck.external@example.org",
      address: "Beispielstr. 1",
      postalCode: "04109",
      city: "Leipzig",
      phone: "+49 89 1234 5678 9",
    },
  );
});

test("splits combined German address lines with or without a comma", () => {
  for (const separator of [", ", " "]) {
    const fields = parseContactPaste(
      `Jane Smith\nMusterstraße 12A${separator}10115 Berlin`,
    );
    assert.equal(fields.name, "Jane Smith");
    assert.equal(fields.address, "Musterstraße 12A");
    assert.equal(fields.postalCode, "10115");
    assert.equal(fields.city, "Berlin");
  }
});

test("uses matching email evidence across signature details and spelling variants", () => {
  for (const [name, email] of [
    ["Qiong Wu", "qiong.wu@example.org"],
    ["Anna Müller", "anna.mueller@example.org"],
    ["Anna Müller", "anna.muller@example.org"],
    ["Christian Großstück", "christian.grossstueck.external@example.org"],
    ["Élodie Müller-Santos", "elodie.mueller-santos@example.org"],
    ["Marie-Claire Dupont", "marie-claire.dupont@example.org"],
  ]) {
    assert.equal(
      parseContactPaste(`${name}\nProject Manager\nExample GmbH\n${email}`)
        .name,
      name,
    );
  }
});

test("does not use generic, partial, or unrelated email addresses as name evidence", () => {
  for (const email of [
    "info@example.org",
    "christian@example.org",
    "christian.grossstueckother@example.org",
    "anna.mueller@example.org",
  ]) {
    assert.equal(
      parseContactPaste(`Christian Großstück\nInside Sales Manager\n${email}`)
        .name,
      undefined,
    );
  }
  assert.equal(
    parseContactPaste("Sales Manager\nsales.manager@example.org").name,
    undefined,
  );
});

test("extracts titled names and explicit pronouns from a signature", () => {
  assert.deepEqual(
    parseContactPaste(`Dr. med. Patricia Neugebauer (she/her) (what’s this?)
Medical Crewing Coordinator
E-mail: patricia@example.org
internet: www.example.org
instagram: @examplecrew
twitter: https://twitter.com/examplecrew
facebook: www.facebook.com/examplecrew`),
    {
      name: "Dr. med. Patricia Neugebauer",
      pronouns: "she/her",
      email: "patricia@example.org",
      website: "https://www.example.org",
    },
  );
});

test("prefers the internet label over earlier social links", () => {
  assert.equal(
    parseContactPaste(
      "twitter: https://twitter.com/example\ninternet: www.example.org",
    ).website,
    "https://www.example.org",
  );
  assert.equal(
    parseContactPaste("twitter: https://twitter.com/example").website,
    undefined,
  );
});

test("does not infer pronouns or accept an unrelated titled name", () => {
  const fields = parseContactPaste(
    "Dr. med. Patricia Neugebauer\nE-mail: anna@example.org",
  );
  assert.equal(fields.name, undefined);
  assert.equal(fields.pronouns, undefined);
  assert.equal(
    parseContactPaste("Name: Dr. Patricia Neugebauer (she/her) (what's this?)")
      .name,
    "Dr. Patricia Neugebauer",
  );
});
