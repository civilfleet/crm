import assert from "node:assert/strict";
import test from "node:test";
import {
  creationSource,
  describeCreation,
  describeListChange,
  displayValue,
  fieldLabel,
  isNoOpChange,
} from "@/lib/contact-change-format";
import { ChangeAction } from "@/types";

const json = (value: unknown) => JSON.stringify(value);

test("field keys read as words", () => {
  assert.equal(fieldLabel("postalCode"), "Postcode");
  assert.equal(fieldLabel("isBipoc"), "BIPoC");
  assert.equal(fieldLabel("profileAttribute.Vessel"), "Vessel");
  assert.equal(fieldLabel("socialLink.INSTAGRAM"), "Instagram");
  assert.equal(fieldLabel("language.ar"), "Language: Arabic");
  assert.equal(fieldLabel("someNewField"), "Some New Field");
});

test("values read as plain text, not JSON", () => {
  assert.equal(displayValue("isBipoc", json(true)), "Yes");
  assert.equal(displayValue("gender", json("NON_BINARY")), "Non-binary");
  assert.equal(
    displayValue("genderRequestPreference", json("NO_ANSWER")),
    "Prefer not to answer",
  );
  assert.equal(
    displayValue("breakUntil", json("2026-09-25T12:00:00.000Z")),
    "Sep 25, 2026",
  );
  assert.equal(displayValue("phone", undefined), "");
  assert.equal(displayValue("name", json("Ada")), "Ada");
});

test("profile attributes read the same in both stored shapes", () => {
  const field = "profileAttribute.skills";
  assert.equal(
    displayValue(
      field,
      json({ key: "skills", type: "STRING", value: "copy writing" }),
    ),
    "copy writing",
  );
  assert.equal(
    displayValue(
      field,
      json({ key: "skills", type: "STRING", stringValue: "copy writing" }),
    ),
    "copy writing",
  );
  assert.equal(
    displayValue(
      field,
      json({ key: "age", type: "NUMBER", numberValue: "42" }),
    ),
    "42",
  );
  assert.equal(
    displayValue(
      field,
      json({ key: "home", type: "LOCATION", value: { label: "Berlin" } }),
    ),
    "Berlin",
  );
  assert.equal(
    displayValue(
      field,
      json({
        key: "home",
        type: "LOCATION",
        latitude: "52.5",
        longitude: "13.4",
      }),
    ),
    "52.5, 13.4",
  );
});

test("an update that changed nothing visible is a no-op", () => {
  // The entry from the report: same value, saved in two shapes.
  assert.equal(
    isNoOpChange({
      action: ChangeAction.UPDATED,
      fieldName: "profileAttribute.skills",
      oldValue: json({ key: "skills", type: "STRING", value: "copy writing" }),
      newValue: json({
        key: "skills",
        type: "STRING",
        stringValue: "copy writing",
      }),
    }),
    true,
  );
  assert.equal(
    isNoOpChange({
      action: ChangeAction.UPDATED,
      fieldName: "profileAttribute.skills",
      oldValue: json({ key: "skills", type: "STRING", value: "copy writing" }),
      newValue: json({ key: "skills", type: "STRING", value: "copywriting" }),
    }),
    false,
  );
  assert.equal(
    isNoOpChange({ action: ChangeAction.UPDATED, fieldName: "merge" }),
    false,
  );
});

test("lists show what was added and removed", () => {
  assert.deepEqual(
    describeListChange("groupIds", json(["g1", "g2"]), json(["g2", "g3"]), {
      g1: "Crew",
      g2: "Office",
      g3: "Medics",
    }),
    { added: ["Medics"], removed: ["Crew"] },
  );
  assert.deepEqual(
    describeListChange("organizationIds", json([]), json(["gone"])),
    { added: ["an organisation that no longer exists"], removed: [] },
  );
  assert.deepEqual(
    describeListChange(
      "emails",
      json([{ email: "a@x.org", kind: "PRIMARY" }]),
      json([
        { email: "a@x.org", kind: "PRIMARY" },
        { email: "b@x.org", kind: "ALIAS" },
      ]),
    ),
    { added: ["b@x.org"], removed: [] },
  );
  assert.deepEqual(
    describeListChange("additionalEmails", json("a@x.org"), json("b@x.org")),
    { added: ["b@x.org"], removed: [] },
  );
});

test("a new contact's source is named", () => {
  assert.equal(
    creationSource({ source: "website-form", formTitle: "Volunteer" }),
    "the website form “Volunteer”",
  );
  assert.equal(creationSource({ source: "manual" }), undefined);
  assert.equal(
    creationSource({ source: "inbound-email" }),
    "an incoming email",
  );
});

test("imports name themselves as the source", () => {
  assert.equal(creationSource({ source: "zammad" }), "a Zammad ticket");
  assert.equal(creationSource({ source: "klaviyo" }), "a Klaviyo import");
});

test("a creation names the person who made it, or where it came from", () => {
  assert.deepEqual(
    describeCreation({
      userId: "u1",
      userName: "Ana",
      metadata: { source: "manual" },
    }),
    { who: "Ana", source: undefined },
  );
  assert.deepEqual(
    describeCreation({
      metadata: { source: "event-registration", eventTitle: "Open day" },
    }),
    { source: "a registration for “Open day”" },
  );
  // Automatic paths name themselves through the source, not as a person.
  assert.deepEqual(
    describeCreation({
      userName: "Inbound email sync",
      metadata: { source: "inbound-email" },
    }),
    { source: "an incoming email" },
  );
  // Older Klaviyo entries carried the label in place of a name.
  assert.deepEqual(describeCreation({ userName: "Klaviyo import" }), {
    source: "a Klaviyo import",
  });
  assert.deepEqual(describeCreation({}), { who: undefined });
});
