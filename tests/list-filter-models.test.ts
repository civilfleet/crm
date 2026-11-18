import assert from "node:assert/strict";
import test from "node:test";
import * as languages from "@/lib/languages";
import * as contactValidations from "@/validations/contacts";
import { loadModule } from "./helpers/load-module";

/*
  The filter models decide what a list sends to the server and what comes
  back from a saved view. A saved view from an older version, or edited by
  hand, must never reach the server in a shape it rejects.
*/

const Component = () => null;
const ui = {
  "@/components/ui/combobox": { Combobox: Component },
  "@/components/ui/input": { Input: Component },
  "@/components/ui/label": { Label: Component },
  "@/components/ui/select": {
    Select: Component,
    SelectContent: Component,
    SelectItem: Component,
    SelectTrigger: Component,
    SelectValue: Component,
  },
};

type Model<F> = {
  create: (kind: string) => F;
  isActive: (filter: F) => boolean;
  read: (saved: unknown) => F | null;
  multiple?: (kind: string) => boolean;
};

const listFilters = loadModule<{
  listFilterModel: (kinds: unknown[]) => Model<Record<string, unknown>>;
  DebouncedInput: unknown;
}>("src/components/records/list-filters.tsx", {
  ...ui,
  "@/components/records/record-list-toolbar": { optionFilter: () => ({}) },
});

const contactFilters = loadModule<{
  contactFilterModel: Model<{
    key: string;
    kind: string;
    filter: Record<string, unknown>;
  }>;
  toContactApiFilters: (items: unknown[]) => unknown[];
}>("src/components/table/contact-filters.tsx", {
  ...ui,
  "@/components/records/list-filters": listFilters,
  "@/lib/languages": languages,
  "@/validations/contacts": contactValidations,
});

const organizationFilters = loadModule<{
  organizationFilterModel: Model<Record<string, unknown>>;
  toOrganizationApiFilters: (items: unknown[]) => unknown[];
}>("src/components/table/organization-filters.tsx", {
  ...ui,
  "@/components/records/list-filters": listFilters,
  "@/lib/languages": languages,
});

test("list filters: options, text and dates read back only when valid", () => {
  const model = listFilters.listFilterModel([
    {
      key: "type",
      label: "Type",
      type: "options",
      options: [{ value: "a", label: "A" }],
    },
    {
      key: "eventType",
      label: "Event type",
      type: "options",
      options: [],
      dynamicOptions: true,
    },
    { key: "state", label: "State", type: "text" },
    { key: "start", label: "Start", type: "dateRange" },
  ]);

  assert.deepEqual(model.read({ key: "type", values: ["a", "gone"] }), {
    key: "type",
    values: ["a"],
  });
  assert.equal(model.read({ key: "type", values: ["gone"] }), null);
  // Options that load from the server keep a saved value.
  assert.deepEqual(model.read({ key: "eventType", values: ["x"] }), {
    key: "eventType",
    values: ["x"],
  });
  assert.deepEqual(model.read({ key: "state", text: "Bayern" }), {
    key: "state",
    text: "Bayern",
  });
  assert.equal(model.read({ key: "state", text: "   " }), null);
  assert.deepEqual(
    model.read({ key: "start", from: "2027-01-01", to: "not a date" }),
    { key: "start", from: "2027-01-01", to: undefined },
  );
  assert.equal(model.read({ key: "unknown", values: ["a"] }), null);
  assert.equal(model.read("nonsense"), null);

  assert.equal(model.isActive(model.create("state")), false);
  assert.equal(model.isActive({ key: "state", text: "x" }), true);
});

test("contact filters: only filters the API accepts are active or restored", () => {
  const { contactFilterModel: model, toContactApiFilters } = contactFilters;

  const city = model.create("field:city");
  assert.deepEqual(city.filter, {
    type: "contactField",
    field: "city",
    operator: "contains",
    value: "",
  });
  // "Contains" with nothing to contain narrows nothing.
  assert.equal(model.isActive(city), false);
  const berlin = { ...city, filter: { ...city.filter, value: "Berlin" } };
  assert.equal(model.isActive(berlin), true);

  assert.equal(model.isActive(model.create("field:email")), true);
  assert.equal(model.isActive(model.create("group")), false);
  assert.equal(model.multiple?.("field:city"), true);
  assert.equal(model.multiple?.("distance"), false);
  assert.equal(model.multiple?.("createdAt"), false);

  // A saved filter is checked by the same schema the server uses.
  assert.deepEqual(model.read({ key: "field:city#3", filter: berlin.filter }), {
    key: "field:city#3",
    kind: "field:city",
    filter: berlin.filter,
  });
  assert.equal(
    model.read({
      key: "x",
      filter: { type: "contactField", field: "salary", operator: "has" },
    }),
    null,
  );
  assert.equal(
    model.read({ key: "x", filter: { type: "group", groupId: "not-a-uuid" } }),
    null,
  );

  // "Speaks" needs a known language; the level is optional.
  const speaks = model.create("language");
  assert.equal(model.isActive(speaks), false);
  assert.equal(model.multiple?.("language"), true);
  const arabic = {
    ...speaks,
    filter: { type: "language", language: "ar", minLevel: "FLUENT" },
  };
  assert.equal(model.isActive(arabic), true);
  assert.equal(
    model.read({
      key: "x",
      filter: { type: "language", language: "klingon" },
    }),
    null,
  );
  assert.equal(
    model.read({
      key: "x",
      filter: { type: "language", language: "ar", minLevel: "GOOD" },
    }),
    null,
  );

  // The API gets the filters themselves, without the chips' keys.
  assert.deepEqual(toContactApiFilters([berlin, arabic]), [
    berlin.filter,
    arabic.filter,
  ]);
});

test("organization filters: a field, an operator that fits, and a value", () => {
  const { organizationFilterModel: model, toOrganizationApiFilters } =
    organizationFilters;
  const created = model.create("field");

  assert.equal(model.isActive(created), false);
  assert.equal(
    model.isActive({ ...created, field: "members", operator: "gt", value: "" }),
    false,
  );
  const members = { ...created, field: "members", operator: "gt", value: "50" };
  assert.equal(model.isActive(members), true);
  // True and false need no value.
  const active = { ...created, field: "active", operator: "isTrue" };
  assert.equal(model.isActive(active), true);
  assert.equal(model.multiple?.("field"), true);

  assert.equal(model.read({ ...members, operator: "like" }), null);
  assert.equal(model.read({ ...members, field: "" }), null);
  assert.deepEqual(model.read(members), members);

  // A language: active once a known one is chosen, restored as saved.
  const uses = model.create("language");
  assert.deepEqual(uses, { key: "language", kind: "language", language: "" });
  assert.equal(model.isActive(uses), false);
  const italian = { ...uses, language: "it" };
  assert.equal(model.isActive(italian), true);
  assert.equal(model.isActive({ ...uses, language: "klingon" }), false);
  assert.deepEqual(model.read(italian), italian);

  assert.deepEqual(toOrganizationApiFilters([members, active, italian]), [
    { type: "field", key: "members", operator: "gt", value: "50" },
    { type: "field", key: "active", operator: "isTrue" },
    { type: "language", language: "it" },
  ]);
});
