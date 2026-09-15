import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContactImportHeaderMap,
  buildDefaultContactImportSourceMapping,
  getCsvContactAddress,
  getCsvContactName,
} from "@/lib/contact-csv-import";

test("maps and combines Klaviyo-style contact columns", () => {
  const headers = [
    "Email",
    "First Name",
    "Last Name",
    "Street",
    "House Number",
  ];
  const headerMap = buildContactImportHeaderMap(headers);
  const row = ["ada@example.org", "Ada", "Lovelace", "Example Road", "12 A"];

  assert.equal(getCsvContactName(row, headerMap), "Ada Lovelace");
  assert.equal(getCsvContactAddress(row, headerMap), "Example Road 12 A");
  assert.deepEqual(buildDefaultContactImportSourceMapping(headers), {
    Email: "email",
    "First Name": "firstName",
    "Last Name": "lastName",
    Street: "street",
    "House Number": "houseNumber",
  });
});

test("prefers explicitly mapped full fields and falls back when they are blank", () => {
  const headers = [
    "Display Name",
    "Given",
    "Family",
    "Complete Address",
    "Road",
    "No.",
  ];
  const headerMap = buildContactImportHeaderMap(headers, {
    name: "Display Name",
    firstName: "Given",
    lastName: "Family",
    address: "Complete Address",
    street: "Road",
    houseNumber: "No.",
  });

  assert.equal(
    getCsvContactName(["Countess Ada", "Ada", "Lovelace"], headerMap),
    "Countess Ada",
  );
  assert.equal(
    getCsvContactName(["", "Ada", "Lovelace"], headerMap),
    "Ada Lovelace",
  );
  assert.equal(
    getCsvContactAddress(
      ["", "", "", "Example Road 12", "Other Road", "7"],
      headerMap,
    ),
    "Example Road 12",
  );
  assert.equal(
    getCsvContactAddress(["", "", "", "", "Other Road", "7"], headerMap),
    "Other Road 7",
  );
});
