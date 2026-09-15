export const CONTACT_IMPORT_FIELDS = [
  {
    field: "name",
    label: "Full name",
    aliases: ["name", "fullname", "contactname"],
  },
  {
    field: "firstName",
    label: "First name",
    aliases: ["firstname", "givenname"],
  },
  {
    field: "lastName",
    label: "Last name",
    aliases: ["lastname", "surname", "familyname"],
  },
  {
    field: "email",
    label: "Email",
    aliases: ["email", "emailaddress", "e-mail", "mail"],
    required: true,
  },
  {
    field: "phone",
    label: "Phone",
    aliases: ["phone", "phonenumber", "mobile", "telephone"],
  },
  {
    field: "signal",
    label: "Signal",
    aliases: ["signal", "signalphone"],
  },
  {
    field: "pronouns",
    label: "Pronouns",
    aliases: ["pronouns"],
  },
  {
    field: "address",
    label: "Full address",
    aliases: [
      "address",
      "fulladdress",
      "streetaddress",
      "address1",
      "addressline1",
    ],
  },
  {
    field: "street",
    label: "Street name",
    aliases: ["street", "streetname", "addressstreet"],
  },
  {
    field: "houseNumber",
    label: "House number",
    aliases: ["housenumber", "houseno", "streetnumber", "streetno"],
  },
  {
    field: "postalCode",
    label: "Postal code",
    aliases: ["postalcode", "postcode", "zip", "zipcode"],
  },
  {
    field: "city",
    label: "City",
    aliases: ["city", "town"],
  },
  {
    field: "state",
    label: "State",
    aliases: ["state", "region", "province"],
  },
  {
    field: "country",
    label: "Country",
    aliases: ["country"],
  },
  {
    field: "website",
    label: "Website",
    aliases: ["website", "url", "homepage"],
  },
  {
    field: "notes",
    label: "Notes",
    aliases: ["notes", "note", "additionalinfo", "additionalinformation"],
  },
  {
    field: "group",
    label: "Group name",
    aliases: ["group", "groupname"],
  },
  {
    field: "groupId",
    label: "Group ID",
    aliases: ["groupid"],
  },
] as const;

export type ContactImportField =
  (typeof CONTACT_IMPORT_FIELDS)[number]["field"];
export type ContactImportColumnMapping = Partial<
  Record<ContactImportField, string>
>;
export type ContactImportSourceMapping = Record<
  string,
  ContactImportField | "__none__"
>;

export const normalizeContactImportHeader = (header: string) =>
  header.toLowerCase().replace(/[^a-z0-9]/g, "");

export const buildContactImportHeaderMap = (
  headers: string[],
  columnMapping?: ContactImportColumnMapping,
) => {
  const normalizedHeaderToIndex = new Map<string, number>();

  headers.forEach((header, index) => {
    const normalized = normalizeContactImportHeader(header);
    if (normalized && !normalizedHeaderToIndex.has(normalized)) {
      normalizedHeaderToIndex.set(normalized, index);
    }
  });

  const fieldToIndex = new Map<ContactImportField, number>();

  Object.entries(columnMapping ?? {}).forEach(([field, header]) => {
    if (!CONTACT_IMPORT_FIELDS.some((entry) => entry.field === field)) return;
    if (typeof header !== "string") return;

    const index = normalizedHeaderToIndex.get(
      normalizeContactImportHeader(header),
    );
    if (index !== undefined) {
      fieldToIndex.set(field as ContactImportField, index);
    }
  });

  CONTACT_IMPORT_FIELDS.forEach(({ field, aliases }) => {
    if (fieldToIndex.has(field)) return;
    const alias = aliases.find((value) =>
      normalizedHeaderToIndex.has(normalizeContactImportHeader(value)),
    );
    if (!alias) return;
    const index = normalizedHeaderToIndex.get(
      normalizeContactImportHeader(alias),
    );
    if (index !== undefined) fieldToIndex.set(field, index);
  });

  return fieldToIndex;
};

export const buildDefaultContactImportSourceMapping = (headers: string[]) => {
  const headerMap = buildContactImportHeaderMap(headers);
  const sourceMapping: ContactImportSourceMapping = Object.fromEntries(
    headers.map((header) => [header, "__none__"]),
  );

  headerMap.forEach((index, field) => {
    const header = headers[index];
    if (header) sourceMapping[header] = field;
  });

  return sourceMapping;
};

export const toContactImportColumnMapping = (
  sourceMapping: ContactImportSourceMapping,
) => {
  const columnMapping: ContactImportColumnMapping = {};
  Object.entries(sourceMapping).forEach(([header, field]) => {
    if (field !== "__none__") columnMapping[field] = header;
  });
  return columnMapping;
};

export const getCsvValue = (
  row: string[],
  headerMap: Map<ContactImportField, number>,
  field: ContactImportField,
) => {
  const index = headerMap.get(field);
  if (index === undefined) return undefined;
  return row[index]?.trim() || undefined;
};

const joinCsvValues = (
  row: string[],
  headerMap: Map<ContactImportField, number>,
  fields: ContactImportField[],
) =>
  fields
    .map((field) => getCsvValue(row, headerMap, field))
    .filter((value): value is string => Boolean(value))
    .join(" ") || undefined;

export const getCsvContactName = (
  row: string[],
  headerMap: Map<ContactImportField, number>,
) =>
  getCsvValue(row, headerMap, "name") ??
  joinCsvValues(row, headerMap, ["firstName", "lastName"]);

export const getCsvContactAddress = (
  row: string[],
  headerMap: Map<ContactImportField, number>,
) =>
  getCsvValue(row, headerMap, "address") ??
  joinCsvValues(row, headerMap, ["street", "houseNumber"]);

export const hasContactNameMapping = (
  fields: ReadonlyArray<ContactImportField | "__none__">,
) =>
  fields.includes("name") ||
  fields.includes("firstName") ||
  fields.includes("lastName");
