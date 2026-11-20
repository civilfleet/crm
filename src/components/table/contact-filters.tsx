"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { DebouncedInput } from "@/components/records/list-filters";
import type { FilterDefinition } from "@/components/records/record-list-toolbar";
import {
  type FilterModel,
  recordListFetcher,
} from "@/components/records/use-record-list";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LANGUAGE_LEVEL_LABELS,
  LANGUAGE_LEVELS,
  LANGUAGE_OPTIONS,
  type LanguageLevel,
  languageName,
} from "@/lib/languages";
import type { ContactFilter } from "@/types";
import { contactFilterSchema } from "@/validations/contacts";

/*
  The contact filters, as chips: a field that is present, missing or
  contains a text; an attribute; a language spoken; a group; an event role;
  a website form sent; a consent given; a distance from a postal code; the
  created date. Each chip holds one filter exactly as the
  contacts API reads it (`filters=`, validations/contacts), so a saved view
  is checked by the same schema the server uses.
*/

type ContactField = Extract<ContactFilter, { type: "contactField" }>["field"];

export const CONTACT_FIELD_LABELS: Record<ContactField, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  signal: "Signal",
  pronouns: "Pronouns",
  address: "Address",
  postalCode: "Postal code",
  state: "State",
  city: "City",
  country: "Country",
  website: "Website",
  notes: "Notes",
};

const CONTACT_FIELDS = Object.keys(CONTACT_FIELD_LABELS) as ContactField[];

/** One chip: which entry of the Filter menu, and the filter it holds. */
export type ContactListFilter = {
  key: string;
  kind: string;
  filter: ContactFilter;
};

const FIELD_KIND_PREFIX = "field:";

/** The level select's "any level" choice (a Select item cannot be empty). */
const ANY_LEVEL = "any";

const PLACE_FIELDS = new Set<ContactField>([
  "address",
  "postalCode",
  "city",
  "state",
  "country",
]);

/** The Filter menu, by heading, in its order. */
const CONTACT_FILTER_KINDS: Array<{
  kind: string;
  label: string;
  group: string;
  keywords?: string[];
}> = [
  ...CONTACT_FIELDS.filter((field) => !PLACE_FIELDS.has(field)).map(
    (field) => ({
      kind: `${FIELD_KIND_PREFIX}${field}`,
      label: CONTACT_FIELD_LABELS[field],
      group: "Contact details",
    }),
  ),
  ...CONTACT_FIELDS.filter((field) => PLACE_FIELDS.has(field)).map((field) => ({
    kind: `${FIELD_KIND_PREFIX}${field}`,
    label: CONTACT_FIELD_LABELS[field],
    group: "Place",
  })),
  {
    kind: "distance",
    label: "Within distance of…",
    group: "Place",
    keywords: ["radius", "near", "postal code", "km"],
  },
  {
    kind: "attribute",
    label: "Attribute",
    group: "Profile",
    keywords: ["custom field"],
  },
  {
    kind: "language",
    label: "Speaks",
    group: "Profile",
    keywords: ["language"],
  },
  { kind: "group", label: "Group", group: "Profile" },
  {
    kind: "createdAt",
    label: "Created date",
    group: "Profile",
    keywords: ["added", "new"],
  },
  {
    kind: "form",
    label: "Sent a form",
    group: "Activity & consent",
    keywords: ["website", "petition", "signed", "submission", "confirmed"],
  },
  {
    kind: "consent",
    label: "Gave consent",
    group: "Activity & consent",
    keywords: ["marketing", "newsletter", "updates", "opt-in", "gdpr"],
  },
  {
    kind: "eventRole",
    label: "Event role",
    group: "Activity & consent",
    keywords: ["event", "participant"],
  },
];

/** What a consent is for, in words. */
export const CONSENT_PURPOSE_LABELS: Record<"marketing", string> = {
  marketing: "Marketing (updates, newsletter)",
};

/** The consent select's "either way" choice (a Select item cannot be empty). */
const ANY_CONSENT = "any";

// The distance and the created date make sense once; the rest may repeat.
const SINGLE_KINDS = new Set(["distance", "createdAt"]);

const createFilter = (kind: string): ContactFilter => {
  if (kind.startsWith(FIELD_KIND_PREFIX)) {
    const field = kind.slice(FIELD_KIND_PREFIX.length) as ContactField;
    // Names and places are searched in; the rest is mostly present or not.
    return field === "name" || field === "pronouns" || field === "city"
      ? { type: "contactField", field, operator: "contains", value: "" }
      : { type: "contactField", field, operator: "has" };
  }
  switch (kind) {
    case "attribute":
      return { type: "attribute", key: "", operator: "contains", value: "" };
    case "language":
      return { type: "language", language: "" };
    case "group":
      return { type: "group", groupId: "" };
    case "eventRole":
      return { type: "eventRole", eventRoleId: "" };
    case "form":
      return { type: "form", formId: "", status: "confirmed" };
    case "consent":
      return { type: "consent", purpose: "marketing" };
    case "distance":
      return {
        type: "distance",
        postalCode: "",
        countryCode: "",
        radiusKm: 50,
      };
    default:
      return { type: "createdAt" };
  }
};

/** The Filter menu entry a filter belongs to. */
export const kindOf = (filter: ContactFilter) =>
  filter.type === "contactField"
    ? `${FIELD_KIND_PREFIX}${filter.field}`
    : filter.type;

/** Whether a filter says enough to narrow the list. */
export const isContactFilterComplete = (filter: ContactFilter) =>
  contactFilterSchema.safeParse(filter).success;

export const contactFilterModel: FilterModel<ContactListFilter> = {
  create: (kind) => ({ key: kind, kind, filter: createFilter(kind) }),
  isActive: (item) => isContactFilterComplete(item.filter),
  read: (saved) => {
    if (!saved || typeof saved !== "object") return null;
    const item = saved as Record<string, unknown>;
    const parsed = contactFilterSchema.safeParse(item.filter);
    if (!parsed.success || typeof item.key !== "string") return null;
    return { key: item.key, kind: kindOf(parsed.data), filter: parsed.data };
  },
  multiple: (kind) => !SINGLE_KINDS.has(kind),
};

/** The filters as the contacts API reads them. */
export const toContactApiFilters = (items: ContactListFilter[]) =>
  items.map((item) => item.filter);

const summarize = (
  filter: ContactFilter,
  names: {
    groups: Map<string, string>;
    eventRoles: Map<string, string>;
    forms: Map<string, string>;
  },
) => {
  switch (filter.type) {
    case "contactField": {
      const label = CONTACT_FIELD_LABELS[filter.field];
      if (filter.operator === "contains") {
        return filter.value?.trim()
          ? `${label} contains “${filter.value.trim()}”`
          : `${label} contains…`;
      }
      return filter.operator === "has"
        ? `${label} present`
        : `${label} missing`;
    }
    case "attribute": {
      const keyLabel = filter.key || "Attribute";
      const operator = filter.operator === "equals" ? "equals" : "contains";
      return filter.value?.trim()
        ? `${keyLabel} ${operator} “${filter.value.trim()}”`
        : `${keyLabel} ${operator}…`;
    }
    case "language": {
      if (!filter.language) return "Speaks…";
      const level = filter.minLevel
        ? ` (${LANGUAGE_LEVEL_LABELS[filter.minLevel].toLowerCase()} or better)`
        : "";
      return `Speaks ${languageName(filter.language)}${level}`;
    }
    case "group": {
      const name = names.groups.get(filter.groupId);
      return name ? `Group: ${name}` : "Group: choose…";
    }
    case "eventRole": {
      const name = names.eventRoles.get(filter.eventRoleId);
      return name ? `Role: ${name}` : "Role: choose…";
    }
    case "form": {
      if (!filter.formId) return "Sent a form: choose…";
      const title = names.forms.get(filter.formId) ?? filter.formId;
      const sent =
        filter.status === "any" ? `Sent “${title}”` : `Confirmed “${title}”`;
      if (filter.consent === "granted") return `${sent} · wants updates`;
      if (filter.consent === "not-granted") return `${sent} · no updates`;
      return sent;
    }
    case "consent":
      return filter.purpose === "marketing" ? "Consent: marketing" : "Consent";
    case "createdAt":
      if (filter.from && filter.to) {
        return `Created between ${filter.from} and ${filter.to}`;
      }
      if (filter.from) return `Created after ${filter.from}`;
      if (filter.to) return `Created before ${filter.to}`;
      return "Created date";
    case "distance": {
      const postal = filter.postalCode?.trim();
      const country = filter.countryCode?.trim();
      return postal && country
        ? `Within ${filter.radiusKm}km of ${postal} (${country})`
        : "Within distance";
    }
    default:
      return "Filter";
  }
};

type Options = {
  groups: Array<{ id: string; name: string }>;
  eventRoles: Array<{ id: string; name: string }>;
  attributeKeys: string[];
  /** The team's website forms, newest first. */
  forms: Array<{ formId: string; title: string }>;
};

const ContactFilterEditor = ({
  filter,
  onChange,
  groups,
  eventRoles,
  attributeKeys,
  forms,
}: Options & {
  filter: ContactFilter;
  onChange: (next: ContactFilter) => void;
}) => {
  switch (filter.type) {
    case "contactField":
      return (
        <div className="flex w-64 flex-col gap-2 p-1">
          <Select
            value={filter.operator}
            onValueChange={(value) =>
              onChange({
                ...filter,
                operator: value as "has" | "missing" | "contains",
                value: value === "contains" ? (filter.value ?? "") : undefined,
              })
            }
          >
            <SelectTrigger aria-label="Condition" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="has">Has a value</SelectItem>
              <SelectItem value="missing">Is missing</SelectItem>
              <SelectItem value="contains">Contains</SelectItem>
            </SelectContent>
          </Select>
          {filter.operator === "contains" ? (
            <DebouncedInput
              aria-label="Contains"
              autoFocus
              placeholder="Contains…"
              value={filter.value ?? ""}
              onCommit={(value) => onChange({ ...filter, value })}
              className="h-8"
            />
          ) : null}
        </div>
      );
    case "attribute":
      if (attributeKeys.length === 0) {
        return (
          <p className="w-56 p-1 text-sm text-muted-foreground">
            No attributes in this team yet.
          </p>
        );
      }
      return (
        <div className="flex w-64 flex-col gap-2 p-1">
          <Select
            value={filter.key || undefined}
            onValueChange={(key) => onChange({ ...filter, key })}
          >
            <SelectTrigger aria-label="Attribute" className="h-8">
              <SelectValue placeholder="Choose an attribute" />
            </SelectTrigger>
            <SelectContent>
              {attributeKeys.map((key) => (
                <SelectItem key={key} value={key}>
                  {key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filter.operator}
            onValueChange={(operator) =>
              onChange({
                ...filter,
                operator: operator as "contains" | "equals",
              })
            }
          >
            <SelectTrigger aria-label="Condition" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contains">Contains</SelectItem>
              <SelectItem value="equals">Equals</SelectItem>
            </SelectContent>
          </Select>
          <DebouncedInput
            aria-label="Value"
            placeholder="Value"
            value={filter.value}
            onCommit={(value) => onChange({ ...filter, value })}
            className="h-8"
          />
        </div>
      );
    case "language":
      return (
        <div className="flex w-64 flex-col gap-2 p-1">
          <Combobox
            value={filter.language}
            onChange={(language) => onChange({ ...filter, language })}
            placeholder="Choose a language"
            searchPlaceholder="Search language..."
            emptyStateText="No language found."
            options={LANGUAGE_OPTIONS}
          />
          <Select
            value={filter.minLevel ?? ANY_LEVEL}
            onValueChange={(value) =>
              onChange({
                ...filter,
                minLevel:
                  value === ANY_LEVEL ? undefined : (value as LanguageLevel),
              })
            }
          >
            <SelectTrigger aria-label="Level" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_LEVEL}>Any level</SelectItem>
              {LANGUAGE_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {LANGUAGE_LEVEL_LABELS[level]} or better
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case "group":
      return (
        <div className="w-56 p-1">
          <Select
            value={filter.groupId || undefined}
            onValueChange={(groupId) => onChange({ ...filter, groupId })}
          >
            <SelectTrigger aria-label="Group" className="h-8">
              <SelectValue placeholder="Choose a group" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case "eventRole":
      return (
        <div className="w-56 p-1">
          <Select
            value={filter.eventRoleId || undefined}
            onValueChange={(eventRoleId) =>
              onChange({ ...filter, eventRoleId })
            }
          >
            <SelectTrigger aria-label="Event role" className="h-8">
              <SelectValue placeholder="Choose a role" />
            </SelectTrigger>
            <SelectContent>
              {eventRoles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case "form":
      if (forms.length === 0) {
        return (
          <p className="w-56 p-1 text-sm text-muted-foreground">
            No website form has been received yet.
          </p>
        );
      }
      return (
        <div className="flex w-72 flex-col gap-2 p-1">
          <Select
            value={filter.formId || undefined}
            onValueChange={(formId) => onChange({ ...filter, formId })}
          >
            <SelectTrigger aria-label="Form" className="h-8">
              <SelectValue placeholder="Choose a form" />
            </SelectTrigger>
            <SelectContent>
              {forms.map((form) => (
                <SelectItem key={form.formId} value={form.formId}>
                  {form.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filter.status ?? "confirmed"}
            onValueChange={(status) =>
              onChange({ ...filter, status: status as "confirmed" | "any" })
            }
          >
            <SelectTrigger aria-label="Which people" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="confirmed">Confirmed their e-mail</SelectItem>
              <SelectItem value="any">Everyone who sent it</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filter.consent ?? ANY_CONSENT}
            onValueChange={(consent) =>
              onChange({
                ...filter,
                consent:
                  consent === ANY_CONSENT
                    ? undefined
                    : (consent as "granted" | "not-granted"),
              })
            }
          >
            <SelectTrigger aria-label="Marketing consent" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_CONSENT}>
                With or without consent
              </SelectItem>
              <SelectItem value="granted">
                Wants updates (marketing consent)
              </SelectItem>
              <SelectItem value="not-granted">Doesn’t want updates</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Consent counts as it holds now, wherever it was given. Unconfirmed
            submissions are removed after 7 days.
          </p>
        </div>
      );
    case "consent":
      return (
        <div className="flex w-72 flex-col gap-2 p-1">
          <Select
            value={filter.purpose}
            onValueChange={(purpose) =>
              onChange({ ...filter, purpose: purpose as "marketing" })
            }
          >
            <SelectTrigger aria-label="Purpose" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CONSENT_PURPOSE_LABELS).map(
                ([purpose, label]) => (
                  <SelectItem key={purpose} value={purpose}>
                    {label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Only consents that hold now: confirmed and not withdrawn.
          </p>
        </div>
      );
    case "createdAt":
      return (
        <div className="grid w-72 grid-cols-2 gap-2 p-1">
          <Input
            aria-label="Created from"
            type="date"
            value={filter.from ?? ""}
            max={filter.to}
            onChange={(event) =>
              onChange({ ...filter, from: event.target.value || undefined })
            }
            className="h-8"
          />
          <Input
            aria-label="Created until"
            type="date"
            value={filter.to ?? ""}
            min={filter.from}
            onChange={(event) =>
              onChange({ ...filter, to: event.target.value || undefined })
            }
            className="h-8"
          />
        </div>
      );
    case "distance":
      return (
        <div className="grid w-72 grid-cols-2 gap-2 p-1">
          <DebouncedInput
            aria-label="Postal code"
            placeholder="Postal code"
            value={filter.postalCode}
            onCommit={(postalCode) => onChange({ ...filter, postalCode })}
            className="h-8"
          />
          <DebouncedInput
            aria-label="Country code"
            placeholder="Country (e.g. DE)"
            maxLength={2}
            value={filter.countryCode}
            onCommit={(countryCode) =>
              onChange({ ...filter, countryCode: countryCode.toUpperCase() })
            }
            className="h-8"
          />
          <DebouncedInput
            aria-label="Radius in km"
            type="number"
            min={1}
            max={2000}
            placeholder="Radius (km)"
            value={String(filter.radiusKm ?? "")}
            onCommit={(radius) =>
              onChange({ ...filter, radiusKm: Number(radius) })
            }
            className="col-span-2 h-8"
          />
        </div>
      );
    default:
      return null;
  }
};

/** The Filter menu entries and chips for the contacts list. */
export const contactFilterDefinitions = (
  options: Options,
): FilterDefinition<ContactListFilter>[] => {
  const names = {
    groups: new Map(options.groups.map((group) => [group.id, group.name])),
    eventRoles: new Map(options.eventRoles.map((role) => [role.id, role.name])),
    forms: new Map(options.forms.map((form) => [form.formId, form.title])),
  };
  return CONTACT_FILTER_KINDS.map(({ kind, label, group, keywords }) => ({
    key: kind,
    label,
    group,
    keywords,
    disabled:
      (kind === "group" && options.groups.length === 0) ||
      (kind === "eventRole" && options.eventRoles.length === 0) ||
      (kind === "attribute" && options.attributeKeys.length === 0) ||
      (kind === "form" && options.forms.length === 0),
    summary: (item) => summarize(item.filter, names),
    editor: (item, onChange) => (
      <ContactFilterEditor
        {...options}
        filter={item.filter}
        onChange={(filter) => onChange({ ...item, filter })}
      />
    ),
  }));
};

/**
 * The Filter menu entries and chips, with what they choose from (groups,
 * event roles, attributes, forms) loaded for the team.
 */
export const useContactFilterDefinitions = (teamId: string) => {
  const { data: rolesData } = useSWR<{
    data?: Array<{ id: string; name: string }>;
  }>(`/api/event-roles?teamId=${teamId}`, recordListFetcher);
  const { data: groupsData } = useSWR<{
    data?: Array<{ id: string; name: string }>;
  }>(`/api/groups?teamId=${teamId}`, recordListFetcher);
  // Every attribute in the team, not only those on this page.
  const { data: attributeKeysData } = useSWR<{ data?: string[] }>(
    `/api/contacts/attribute-keys?teamId=${teamId}`,
    recordListFetcher,
  );
  // A team has few forms; the newest first.
  const { data: formsData } = useSWR<{
    data?: Array<{ formId: string; title: string }>;
  }>(`/api/forms?teamId=${teamId}&pageSize=100`, recordListFetcher);
  return useMemo(
    () =>
      contactFilterDefinitions({
        groups: groupsData?.data ?? [],
        eventRoles: rolesData?.data ?? [],
        attributeKeys: attributeKeysData?.data ?? [],
        forms: (formsData?.data ?? []).map(({ formId, title }) => ({
          formId,
          title,
        })),
      }),
    [
      groupsData?.data,
      rolesData?.data,
      attributeKeysData?.data,
      formsData?.data,
    ],
  );
};
