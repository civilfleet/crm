/*
  Turns contact change-log entries (field keys and JSON-encoded values, see
  src/services/contact-change-logs) into words people can read in the
  contact's Change History. Pure, so it can be tested without React.
*/
import { format } from "date-fns";
import { languageName } from "@/lib/languages";
import { ChangeAction, type ContactChangeLog } from "@/types";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  pronouns: "Pronouns",
  gender: "Gender",
  genderRequestPreference: "Open to gender-related requests",
  isBipoc: "BIPoC",
  racismRequestPreference: "Open to racism-related requests",
  otherMargins: "Other marginalisations",
  onboardingDate: "Onboarding date",
  breakUntil: "On break until",
  address: "Address",
  postalCode: "Postcode",
  state: "State",
  city: "City",
  country: "Country",
  email: "Main email",
  emails: "Emails",
  additionalEmails: "Additional emails",
  phone: "Phone",
  signal: "Signal",
  website: "Website",
  notes: "Notes",
  organizationIds: "Organisations",
  groupIds: "Groups",
  groupId: "Group",
  files: "Files",
  deletedAt: "Trash",
  possibleDuplicate: "Possible duplicate",
  merge: "Merge",
};

/** Fields whose value is a list: shown as what was added and removed. */
const LIST_FIELDS = new Set([
  "emails",
  "additionalEmails",
  "files",
  "groupIds",
  "organizationIds",
]);

const ENUM_LABELS: Record<string, string> = {
  FEMALE: "Female",
  MALE: "Male",
  NON_BINARY: "Non-binary",
  OTHER: "Other",
  NO_ANSWER: "Prefer not to answer",
  YES: "Yes",
  NO: "No",
};

const ENUM_FIELDS = new Set([
  "gender",
  "genderRequestPreference",
  "racismRequestPreference",
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

const titleCase = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (first) => first.toUpperCase())
    .trim();

/** "profileAttribute.skills" → "skills", "language.ar" → "Language: Arabic". */
export const fieldLabel = (fieldName?: string) => {
  if (!fieldName) return "";
  if (fieldName.startsWith("profileAttribute.")) {
    return fieldName.slice("profileAttribute.".length);
  }
  if (fieldName.startsWith("language.")) {
    return `Language: ${languageName(fieldName.slice("language.".length))}`;
  }
  if (fieldName.startsWith("socialLink.")) {
    return titleCase(fieldName.slice("socialLink.".length).toLowerCase());
  }
  return FIELD_LABELS[fieldName] ?? titleCase(fieldName);
};

const parse = (raw?: string): unknown => {
  if (raw === undefined || raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const formatScalar = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (ISO_DATE.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return format(date, "PP");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(formatScalar).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => {
        const text = formatScalar(entry);
        return text ? `${titleCase(key)}: ${text}` : "";
      })
      .filter(Boolean)
      .join(", ");
  }
  return String(value);
};

const formatLocation = (label: unknown, lat: unknown, long: unknown) => {
  if (typeof label === "string" && label) return label;
  if (lat !== undefined && lat !== null && long !== undefined && long !== null)
    return `${lat}, ${long}`;
  return "";
};

/**
 * A profile attribute's value, in either stored shape: `{ key, type, value }`
 * (as read back) or `{ key, type, stringValue, numberValue, ... }` (as saved).
 */
const formatProfileAttribute = (value: unknown): string => {
  if (!value || typeof value !== "object") return formatScalar(value);
  const attribute = value as Record<string, unknown>;
  if (attribute.type === "LOCATION") {
    const location =
      attribute.value && typeof attribute.value === "object"
        ? (attribute.value as Record<string, unknown>)
        : undefined;
    return location
      ? formatLocation(location.label, location.latitude, location.longitude)
      : formatLocation(
          attribute.locationLabel,
          attribute.latitude,
          attribute.longitude,
        );
  }
  if ("value" in attribute) return formatScalar(attribute.value);
  if (attribute.type === "NUMBER" && attribute.numberValue != null)
    return formatScalar(Number(attribute.numberValue));
  if (attribute.type === "DATE" && attribute.dateValue != null)
    return formatScalar(attribute.dateValue);
  return formatScalar(attribute.stringValue);
};

export type ValueLabels = Record<string, string>;

/** One value of a field, as plain text ("" when there is none). */
export const displayValue = (
  fieldName: string | undefined,
  raw: string | undefined,
  labels: ValueLabels = {},
): string => {
  const value = parse(raw);
  if (value === undefined || value === null) return "";
  const field = fieldName ?? "";
  if (field.startsWith("profileAttribute.")) {
    return formatProfileAttribute(value);
  }
  if (ENUM_FIELDS.has(field) && typeof value === "string") {
    return ENUM_LABELS[value] ?? titleCase(value.toLowerCase());
  }
  if (field === "groupId" && typeof value === "string") {
    return labels[value] ?? "a group that no longer exists";
  }
  if (LIST_FIELDS.has(field)) return listItems(field, value, labels).join(", ");
  return formatScalar(value);
};

const listItems = (
  field: string,
  value: unknown,
  labels: ValueLabels,
): string[] => {
  if (value === undefined || value === null) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .map((item) => {
      if (field === "groupIds" || field === "organizationIds") {
        const fallback =
          field === "groupIds"
            ? "a group that no longer exists"
            : "an organisation that no longer exists";
        return typeof item === "string" ? (labels[item] ?? fallback) : "";
      }
      if (item && typeof item === "object") {
        const entry = item as Record<string, unknown>;
        if (typeof entry.email === "string") {
          return entry.kind === "PRIMARY"
            ? `${entry.email} (main)`
            : entry.email;
        }
        if (typeof entry.name === "string") return entry.name;
      }
      return formatScalar(item);
    })
    .filter(Boolean);
};

export type ListChange = { added: string[]; removed: string[] };

/** What was added to and removed from a list field. */
export const describeListChange = (
  fieldName: string,
  oldRaw: string | undefined,
  newRaw: string | undefined,
  labels: ValueLabels = {},
): ListChange => {
  const before = listItems(fieldName, parse(oldRaw), labels);
  const after = listItems(fieldName, parse(newRaw), labels);
  // "Additional emails" is logged with the main email as the old value and
  // the new alias as the new one: only the alias was added.
  if (fieldName === "additionalEmails") return { added: after, removed: [] };
  return {
    added: after.filter((item) => !before.includes(item)),
    removed: before.filter((item) => !after.includes(item)),
  };
};

export const isListField = (fieldName?: string) =>
  !!fieldName && LIST_FIELDS.has(fieldName);

/**
 * An update that changed nothing a person can see (older saves logged every
 * profile attribute, changed or not). Hidden from the history.
 */
export const isNoOpChange = (
  log: Pick<ContactChangeLog, "action" | "fieldName" | "oldValue" | "newValue">,
  labels: ValueLabels = {},
) => {
  if (log.action !== ChangeAction.UPDATED || !log.fieldName) return false;
  if (log.fieldName === "merge" || log.fieldName === "possibleDuplicate")
    return false;
  if (isListField(log.fieldName)) {
    const { added, removed } = describeListChange(
      log.fieldName,
      log.oldValue,
      log.newValue,
      labels,
    );
    return added.length === 0 && removed.length === 0;
  }
  return (
    displayValue(log.fieldName, log.oldValue, labels) ===
    displayValue(log.fieldName, log.newValue, labels)
  );
};

/** Where a new contact came from, from its creation entry's details. */
export const creationSource = (metadata?: Record<string, unknown>) => {
  if (!metadata) return undefined;
  const text = (value: unknown) =>
    typeof value === "string" && value ? value : undefined;
  switch (metadata.source) {
    case "manual":
      return undefined;
    case "website-form": {
      const title = text(metadata.formTitle);
      return title ? `the website form “${title}”` : "a website form";
    }
    case "event-registration": {
      const title = text(metadata.eventTitle);
      return title ? `a registration for “${title}”` : "an event registration";
    }
    case "inbound-email":
      return "an incoming email";
    default:
      return text(metadata.source)?.replace(/[_-]+/g, " ").toLowerCase();
  }
};
