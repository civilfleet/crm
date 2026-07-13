import { type $Enums, Prisma } from "@prisma/client";
import {
  CONTACT_SUBMODULE_FIELDS,
  CONTACT_SUBMODULES,
  type ContactSubmodule,
} from "@/constants/contact-submodules";
import { normalizeCountryCode } from "@/lib/countries";
import { parseCsv, stringifyCsv } from "@/lib/csv";
import { normalizePostalCode } from "@/lib/geo";
import prisma from "@/lib/prisma";
import { parseVCardContacts } from "@/lib/vcard";
import { getContactVisibility } from "@/services/contacts/access";
import {
  createChangeLog,
  logContactCreation,
  logFieldUpdate,
} from "@/services/contact-change-logs";
import {
  assertPendingUploadsAvailable,
  consumePendingUploads,
} from "@/services/file/pending-uploads";
import { ensureDefaultGroup, mapGroup } from "@/services/groups";
import {
  ContactAttributeType,
  ContactEmailKind,
  ChangeAction,
  type ContactFilter,
  type ContactGender,
  type ContactEmail as ContactEmailType,
  type ContactLocationValue,
  type ContactProfileAttribute,
  type ContactRequestPreference,
  type ContactSocialLink,
  type Contact as ContactType,
  Roles,
} from "@/types";

const RESTRICTED_CONTACT_FIELDS = [
  "gender",
  "genderRequestPreference",
  "isBipoc",
  "racismRequestPreference",
  "otherMargins",
  "onboardingDate",
  "breakUntil",
] as const;

type RestrictedContactField = (typeof RESTRICTED_CONTACT_FIELDS)[number];

const resolvePostalCentroid = async (
  tx: Prisma.TransactionClient,
  countryCode?: string,
  postalCode?: string,
) => {
  if (!countryCode || !postalCode) {
    return null;
  }

  return tx.postalCodeCentroid.findUnique({
    where: {
      countryCode_postalCode: {
        countryCode,
        postalCode,
      },
    },
    select: {
      latitude: true,
      longitude: true,
    },
  });
};

type CreateContactInput = {
  teamId: string;
  name?: string;
  pronouns?: string;
  gender?: ContactGender | null;
  genderRequestPreference?: ContactRequestPreference | null;
  isBipoc?: boolean | null;
  racismRequestPreference?: ContactRequestPreference | null;
  otherMargins?: string;
  onboardingDate?: string;
  breakUntil?: string;
  address?: string;
  postalCode?: string;
  state?: string;
  city?: string;
  country?: string;
  email?: string;
  additionalEmails?: ContactEmailType[];
  phone?: string;
  signal?: string;
  website?: string;
  notes?: string;
  socialLinks?: ContactSocialLink[];
  organizationIds?: string[];
  groupId?: string;
  groupIds?: string[];
  profileAttributes?: ContactProfileAttribute[];
  files?: {
    name: string;
    type: string;
    url: string;
    pendingUploadId?: string;
  }[];
};

type UpdateContactInput = {
  contactId: string;
  teamId: string;
  name?: string;
  pronouns?: string;
  gender?: ContactGender | null;
  genderRequestPreference?: ContactRequestPreference | null;
  isBipoc?: boolean | null;
  racismRequestPreference?: ContactRequestPreference | null;
  otherMargins?: string;
  onboardingDate?: string;
  breakUntil?: string;
  address?: string;
  postalCode?: string;
  state?: string;
  city?: string;
  country?: string;
  email?: string;
  additionalEmails?: ContactEmailType[];
  phone?: string;
  signal?: string;
  website?: string;
  notes?: string;
  socialLinks?: ContactSocialLink[];
  organizationIds?: string[];
  groupId?: string;
  groupIds?: string[];
  profileAttributes?: ContactProfileAttribute[];
  files?: {
    name: string;
    type: string;
    url: string;
    pendingUploadId?: string;
  }[];
};

type MergeContactsPreviewInput = {
  teamId: string;
  contactIds: string[];
};

type MergeContactsInput = {
  teamId: string;
  targetContactId: string;
  sourceContactIds: string[];
  primaryEmail: string;
  preservedEmails: ContactEmailType[];
  fieldSelections?: Record<string, unknown>;
};

type ImportContactsFromCsvInput = {
  teamId: string;
  csv: string;
  columnMapping?: Partial<Record<ContactImportField, string>>;
  userId?: string;
  userName?: string;
};

type ImportContactsFromVCardInput = {
  teamId: string;
  vcard: string;
  userId?: string;
  userName?: string;
};

type ContactImportSkippedRow = {
  rowNumber: number;
  reason: string;
};

type ContactImportResult = {
  created: number;
  skipped: number;
  totalRows: number;
  skippedRows: ContactImportSkippedRow[];
};

type NormalizedAttribute = {
  key: string;
  type: ContactAttributeType;
  stringValue?: string;
  numberValue?: Prisma.Decimal;
  dateValue?: Date;
  locationLabel?: string;
  latitude?: Prisma.Decimal;
  longitude?: Prisma.Decimal;
};

type ContactWithAttributes = Prisma.ContactGetPayload<{
  include: {
    attributes: true;
    emails: true;
    socialLinks: true;
    group: {
      include: {
        modulePermissions: true;
      };
    };
    groups: {
      include: {
        group: {
          include: {
            modulePermissions: true;
          };
        };
      };
    };
    events: {
      include: {
        event: true;
        roles: {
          include: {
            eventRole: true;
          };
        };
      };
    };
    registrations: {
      include: {
        event: true;
      };
    };
    organizations: {
      include: {
        organization: {
          select: {
            id: true;
            name: true;
            email: true;
          };
        };
      };
    };
    files: true;
  };
}>;

const contactInclude = {
  attributes: true,
  emails: true,
  socialLinks: true,
  group: {
    include: {
      modulePermissions: true,
    },
  },
  groups: {
    include: {
      group: {
        include: {
          modulePermissions: true,
        },
      },
    },
  },
  events: {
    include: {
      event: true,
      roles: {
        include: {
          eventRole: true,
        },
      },
    },
  },
  registrations: {
    include: {
      event: true,
    },
  },
  organizations: {
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
  files: true,
} satisfies Prisma.ContactInclude;

const normalizeGroupIds = (groupIds?: string[], groupId?: string) =>
  Array.from(new Set([...(groupIds ?? []), ...(groupId ? [groupId] : [])]));

const validateContactGroupIds = async (
  tx: Prisma.TransactionClient,
  teamId: string,
  groupIds: string[],
) => {
  if (!groupIds.length) {
    return;
  }

  const matchingGroups = await tx.group.findMany({
    where: {
      teamId,
      id: {
        in: groupIds,
      },
    },
    select: {
      id: true,
    },
  });

  if (matchingGroups.length !== groupIds.length) {
    throw new Error("One or more selected groups do not belong to this team.");
  }
};

const syncContactGroups = async (
  tx: Prisma.TransactionClient,
  contactId: string,
  teamId: string,
  groupIds: string[],
) => {
  await validateContactGroupIds(tx, teamId, groupIds);

  await tx.contactGroup.deleteMany({
    where: {
      contactId,
      groupId: {
        notIn: groupIds,
      },
    },
  });

  if (groupIds.length) {
    await tx.contactGroup.createMany({
      data: groupIds.map((groupId) => ({
        contactId,
        groupId,
      })),
      skipDuplicates: true,
    });
  }
};

const getContactFieldAccessMap = async (teamId: string) => {
  const entries = await prisma.contactFieldAccess.findMany({
    where: { teamId },
    select: {
      fieldKey: true,
      groupId: true,
    },
  });

  const map = new Map<string, Set<string>>();
  entries.forEach((entry) => {
    const existing = map.get(entry.fieldKey);
    if (existing) {
      existing.add(entry.groupId);
      return;
    }
    map.set(entry.fieldKey, new Set([entry.groupId]));
  });

  return map;
};

const getUserGroupIdsForTeam = async (userId: string, teamId: string) => {
  const memberships = await prisma.userGroup.findMany({
    where: {
      userId,
      group: {
        teamId,
      },
    },
    select: {
      groupId: true,
    },
  });

  return memberships.map((membership) => membership.groupId);
};

const isFieldVisible = (
  fieldKey: string,
  accessMap: Map<string, Set<string>>,
  userGroupIds: string[],
) => {
  const allowedGroups = accessMap.get(fieldKey);
  if (!allowedGroups || allowedGroups.size === 0) {
    return true;
  }
  return userGroupIds.some((groupId) => allowedGroups.has(groupId));
};

const getAllowedContactSubmodules = async (
  teamId: string,
  userId?: string,
): Promise<ContactSubmodule[]> => {
  if (!userId) {
    return [];
  }

  const [accessMap, userGroupIds] = await Promise.all([
    getContactFieldAccessMap(teamId),
    getUserGroupIdsForTeam(userId, teamId),
  ]);

  return CONTACT_SUBMODULES.filter((submodule) => {
    const fields = CONTACT_SUBMODULE_FIELDS[submodule];
    if (!fields.length) {
      return false;
    }
    return fields.some((fieldKey) =>
      isFieldVisible(fieldKey, accessMap, userGroupIds),
    );
  });
};

const filterContactByAccess = (
  contact: ContactType,
  accessMap: Map<string, Set<string>>,
  userGroupIds: string[],
) => {
  const filtered: ContactType = { ...contact };

  RESTRICTED_CONTACT_FIELDS.forEach((fieldKey) => {
    if (!isFieldVisible(fieldKey, accessMap, userGroupIds)) {
      (filtered as Record<RestrictedContactField, unknown>)[fieldKey] =
        undefined;
    }
  });

  filtered.profileAttributes = filtered.profileAttributes.filter((attribute) =>
    isFieldVisible(attribute.key, accessMap, userGroupIds),
  );

  return filtered;
};

const applyContactFieldAccess = async <
  T extends CreateContactInput | UpdateContactInput,
>(
  input: T,
  userId?: string,
) => {
  if (!userId) {
    return input;
  }

  const [accessMap, userGroupIds] = await Promise.all([
    getContactFieldAccessMap(input.teamId),
    getUserGroupIdsForTeam(userId, input.teamId),
  ]);

  const sanitized: T = { ...input };

  RESTRICTED_CONTACT_FIELDS.forEach((fieldKey) => {
    if (Object.hasOwn(sanitized, fieldKey)) {
      if (!isFieldVisible(fieldKey, accessMap, userGroupIds)) {
        delete (sanitized as Record<RestrictedContactField, unknown>)[fieldKey];
      }
    }
  });

  if (sanitized.profileAttributes?.length) {
    sanitized.profileAttributes = sanitized.profileAttributes.filter(
      (attribute) => isFieldVisible(attribute.key, accessMap, userGroupIds),
    );
  }

  return sanitized;
};

const normalizeAttributes = (
  attributes: ContactProfileAttribute[] = [],
): NormalizedAttribute[] => {
  const seenKeys = new Set<string>();
  const normalized: NormalizedAttribute[] = [];

  attributes.forEach((attribute) => {
    const key = attribute.key.trim();
    if (!key || seenKeys.has(key)) {
      return;
    }

    switch (attribute.type) {
      case ContactAttributeType.STRING: {
        if (typeof attribute.value === "string" && attribute.value.trim()) {
          normalized.push({
            key,
            type: ContactAttributeType.STRING,
            stringValue: attribute.value.trim(),
          });
          seenKeys.add(key);
        }
        break;
      }
      case ContactAttributeType.DATE: {
        if (typeof attribute.value === "string" && attribute.value.trim()) {
          const parsed = new Date(attribute.value);
          if (!Number.isNaN(parsed.getTime())) {
            const isoValue = parsed.toISOString();
            normalized.push({
              key,
              type: ContactAttributeType.DATE,
              dateValue: parsed,
              stringValue: isoValue,
            });
            seenKeys.add(key);
          }
        }
        break;
      }
      case ContactAttributeType.NUMBER: {
        if (
          typeof attribute.value === "number" &&
          Number.isFinite(attribute.value)
        ) {
          normalized.push({
            key,
            type: ContactAttributeType.NUMBER,
            numberValue: new Prisma.Decimal(attribute.value),
            stringValue: attribute.value.toString(),
          });
          seenKeys.add(key);
        }
        break;
      }
      case ContactAttributeType.LOCATION: {
        const { value } = attribute;
        if (!value || typeof value !== "object") {
          break;
        }

        const location: NormalizedAttribute = {
          key,
          type: ContactAttributeType.LOCATION,
        };

        if (value.label?.trim()) {
          location.locationLabel = value.label.trim();
        }

        if (
          typeof value.latitude === "number" &&
          Number.isFinite(value.latitude)
        ) {
          location.latitude = new Prisma.Decimal(value.latitude);
        }

        if (
          typeof value.longitude === "number" &&
          Number.isFinite(value.longitude)
        ) {
          location.longitude = new Prisma.Decimal(value.longitude);
        }

        if (location.locationLabel || location.latitude || location.longitude) {
          normalized.push(location);
          seenKeys.add(key);
        }
        break;
      }
      default:
        break;
    }
  });

  return normalized;
};

const normalizeSocialLinks = (links: ContactSocialLink[] = []) => {
  const seenPlatforms = new Set<string>();
  const normalized: ContactSocialLink[] = [];

  links.forEach((link) => {
    const platform = link.platform.trim();
    const handle = link.handle.trim();
    if (!platform || !handle) {
      return;
    }

    const key = platform.toLowerCase();
    if (seenPlatforms.has(key)) {
      return;
    }
    seenPlatforms.add(key);

    normalized.push({
      platform: key,
      handle,
    });
  });

  return normalized;
};

const normalizeContactEmail = (email?: string | null) =>
  email?.trim().toLowerCase() || undefined;

const normalizeAdditionalEmails = (
  emails: ContactEmailType[] = [],
  primaryEmail?: string,
) => {
  const normalizedPrimary = normalizeContactEmail(primaryEmail);
  const seen = new Set<string>();
  const normalized: ContactEmailType[] = [];

  emails.forEach((entry) => {
    const email = normalizeContactEmail(entry.email);
    if (!email || email === normalizedPrimary || seen.has(email)) {
      return;
    }

    seen.add(email);
    normalized.push({
      id: entry.id,
      email,
      kind:
        entry.kind === ContactEmailKind.SHARED
          ? ContactEmailKind.SHARED
          : ContactEmailKind.ALIAS,
      label: entry.label?.trim() || undefined,
    });
  });

  return normalized;
};

const assertIdentityEmailsAvailable = async (
  tx: Prisma.TransactionClient,
  teamId: string,
  emails: string[],
  allowedContactIds: string[] = [],
) => {
  const identityEmails = Array.from(
    new Set(emails.map(normalizeContactEmail).filter((email): email is string => Boolean(email))),
  );

  if (!identityEmails.length) {
    return;
  }

  const conflicts = await tx.contactEmail.findMany({
    where: {
      teamId,
      email: { in: identityEmails },
      kind: { in: [ContactEmailKind.PRIMARY, ContactEmailKind.ALIAS] },
      ...(allowedContactIds.length
        ? { contactId: { notIn: allowedContactIds } }
        : {}),
    },
    select: { email: true },
  });

  if (conflicts.length > 0) {
    throw new Error(
      `Email already belongs to another contact: ${conflicts[0].email}`,
    );
  }
};

const setContactEmails = async (
  tx: Prisma.TransactionClient,
  {
    teamId,
    contactId,
    primaryEmail,
    additionalEmails,
    allowedContactIds = [],
  }: {
    teamId: string;
    contactId: string;
    primaryEmail: string;
    additionalEmails: ContactEmailType[];
    allowedContactIds?: string[];
  },
) => {
  const normalizedPrimary = normalizeContactEmail(primaryEmail);
  if (!normalizedPrimary) {
    throw new Error("Primary email is required.");
  }

  const normalizedAdditional = normalizeAdditionalEmails(
    additionalEmails,
    normalizedPrimary,
  );
  const identityEmails = [
    normalizedPrimary,
    ...normalizedAdditional
      .filter((entry) => entry.kind === ContactEmailKind.ALIAS)
      .map((entry) => entry.email),
  ];

  await assertIdentityEmailsAvailable(tx, teamId, identityEmails, [
    contactId,
    ...allowedContactIds,
  ]);

  await tx.contactEmail.deleteMany({
    where: {
      contactId,
      OR: [
        { kind: ContactEmailKind.PRIMARY },
        {
          email: {
            notIn: normalizedAdditional.map((entry) => entry.email),
          },
        },
      ],
    },
  });

  await tx.contactEmail.upsert({
    where: {
      contactId_email: {
        contactId,
        email: normalizedPrimary,
      },
    },
    create: {
      teamId,
      contactId,
      email: normalizedPrimary,
      kind: ContactEmailKind.PRIMARY,
    },
    update: {
      kind: ContactEmailKind.PRIMARY,
      label: null,
    },
  });

  for (const entry of normalizedAdditional) {
    await tx.contactEmail.upsert({
      where: {
        contactId_email: {
          contactId,
          email: entry.email,
        },
      },
      create: {
        teamId,
        contactId,
        email: entry.email,
        kind: entry.kind,
        label: entry.label,
      },
      update: {
        kind: entry.kind,
        label: entry.label ?? null,
      },
    });
  }
};

const findContactByIdentityEmail = async (
  teamId: string,
  email: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) => {
  const normalizedEmail = normalizeContactEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const contactEmail = await client.contactEmail.findFirst({
    where: {
      teamId,
      email: normalizedEmail,
      kind: { in: [ContactEmailKind.PRIMARY, ContactEmailKind.ALIAS] },
    },
    select: {
      contact: {
        select: {
          id: true,
          groupId: true,
          groups: {
            select: {
              groupId: true,
            },
          },
        },
      },
    },
  });

  return contactEmail?.contact ?? null;
};

const normalizeCsvHeader = (header: string) =>
  header.toLowerCase().replace(/[^a-z0-9]/g, "");

const CONTACT_IMPORT_HEADER_ALIASES = {
  name: ["name", "fullname", "contactname"],
  email: ["email", "emailaddress", "e-mail", "mail"],
  phone: ["phone", "phonenumber", "mobile", "telephone"],
  signal: ["signal", "signalphone"],
  pronouns: ["pronouns"],
  address: ["address", "street"],
  postalCode: ["postalcode", "postcode", "zip", "zipcode"],
  state: ["state", "region", "province"],
  city: ["city", "town"],
  country: ["country"],
  website: ["website", "url", "homepage"],
  notes: ["notes", "note", "additionalinfo", "additionalinformation"],
  group: ["group", "groupname"],
  groupId: ["groupid"],
} as const;

type ContactImportField = keyof typeof CONTACT_IMPORT_HEADER_ALIASES;

const CONTACT_IMPORT_FIELDS = Object.keys(
  CONTACT_IMPORT_HEADER_ALIASES,
) as ContactImportField[];

const isContactImportField = (field: string): field is ContactImportField =>
  CONTACT_IMPORT_FIELDS.includes(field as ContactImportField);

const buildContactImportHeaderMap = (
  headers: string[],
  columnMapping?: Partial<Record<ContactImportField, string>>,
) => {
  const normalizedHeaderToIndex = new Map<string, number>();

  headers.forEach((header, index) => {
    const normalized = normalizeCsvHeader(header);
    if (normalized && !normalizedHeaderToIndex.has(normalized)) {
      normalizedHeaderToIndex.set(normalized, index);
    }
  });

  const fieldToIndex = new Map<ContactImportField, number>();

  Object.entries(columnMapping ?? {}).forEach(([field, header]) => {
    if (!isContactImportField(field) || typeof header !== "string") {
      return;
    }

    const normalizedHeader = normalizeCsvHeader(header);
    const index = normalizedHeaderToIndex.get(normalizedHeader);
    if (index !== undefined) {
      fieldToIndex.set(field, index);
    }
  });

  Object.entries(CONTACT_IMPORT_HEADER_ALIASES).forEach(([field, aliases]) => {
    const importField = field as ContactImportField;
    if (fieldToIndex.has(importField)) {
      return;
    }

    const matchingAlias = aliases.find((alias) =>
      normalizedHeaderToIndex.has(normalizeCsvHeader(alias)),
    );

    if (!matchingAlias) {
      return;
    }

    fieldToIndex.set(
      importField,
      normalizedHeaderToIndex.get(normalizeCsvHeader(matchingAlias)) ?? -1,
    );
  });

  return fieldToIndex;
};

const getCsvValue = (
  row: string[],
  headerMap: Map<ContactImportField, number>,
  field: ContactImportField,
) => {
  const index = headerMap.get(field);
  if (index === undefined || index < 0) {
    return undefined;
  }

  const value = row[index]?.trim();
  return value ? value : undefined;
};

const toProfileAttribute = (
  attribute: ContactWithAttributes["attributes"][number],
): ContactProfileAttribute | null => {
  switch (attribute.type) {
    case ContactAttributeType.STRING:
      return attribute.stringValue
        ? {
            key: attribute.key,
            type: ContactAttributeType.STRING,
            value: attribute.stringValue,
          }
        : null;
    case ContactAttributeType.DATE:
      return attribute.dateValue
        ? {
            key: attribute.key,
            type: ContactAttributeType.DATE,
            value: attribute.dateValue.toISOString(),
          }
        : null;
    case ContactAttributeType.NUMBER:
      return attribute.numberValue !== null &&
        attribute.numberValue !== undefined
        ? {
            key: attribute.key,
            type: ContactAttributeType.NUMBER,
            value: attribute.numberValue.toNumber(),
          }
        : null;
    case ContactAttributeType.LOCATION: {
      const value: ContactLocationValue = {};

      if (attribute.locationLabel) {
        value.label = attribute.locationLabel;
      }

      if (attribute.latitude) {
        value.latitude = attribute.latitude.toNumber();
      }

      if (attribute.longitude) {
        value.longitude = attribute.longitude.toNumber();
      }

      return Object.keys(value).length > 0
        ? {
            key: attribute.key,
            type: ContactAttributeType.LOCATION,
            value,
          }
        : null;
    }
    default:
      return null;
  }
};

const mapContactGender = (
  gender?: $Enums.ContactGender | null,
): ContactGender | undefined =>
  gender ? (gender as ContactGender) : undefined;

const mapFileChangeValue = (
  files: { name?: string | null; type: string; url: string }[],
) =>
  files.map((file) => ({
    name: file.name ?? file.url,
    type: file.type,
    url: file.url,
  }));

const mapContactRequestPreference = (
  preference?: $Enums.ContactRequestPreference | null,
): ContactRequestPreference | undefined =>
  preference ? (preference as ContactRequestPreference) : undefined;

const mapContact = (contact: ContactWithAttributes): ContactType => ({
  id: contact.id,
  teamId: contact.teamId,
  name: contact.name,
  pronouns: contact.pronouns ?? undefined,
  gender: mapContactGender(contact.gender),
  genderRequestPreference: mapContactRequestPreference(
    contact.genderRequestPreference,
  ),
  isBipoc: contact.isBipoc ?? undefined,
  racismRequestPreference: mapContactRequestPreference(
    contact.racismRequestPreference,
  ),
  otherMargins: contact.otherMargins ?? undefined,
  onboardingDate: contact.onboardingDate ?? undefined,
  breakUntil: contact.breakUntil ?? undefined,
  address: contact.address ?? undefined,
  postalCode: contact.postalCode ?? undefined,
  state: contact.state ?? undefined,
  city: contact.city ?? undefined,
  country: contact.country ?? undefined,
  countryCode: contact.countryCode ?? undefined,
  latitude: contact.latitude ? contact.latitude.toNumber() : undefined,
  longitude: contact.longitude ? contact.longitude.toNumber() : undefined,
  email:
    contact.emails.find((entry) => entry.kind === ContactEmailKind.PRIMARY)
      ?.email ?? undefined,
  emails: contact.emails.map((entry) => ({
    id: entry.id,
    email: entry.email,
    kind: entry.kind as ContactEmailKind,
    label: entry.label ?? undefined,
  })),
  additionalEmails: contact.emails
    .filter((entry) => entry.kind !== ContactEmailKind.PRIMARY)
    .map((entry) => ({
      id: entry.id,
      email: entry.email,
      kind: entry.kind as ContactEmailKind,
      label: entry.label ?? undefined,
    })),
  phone: contact.phone ?? undefined,
  signal: contact.signal ?? undefined,
  website: contact.website ?? undefined,
  notes: contact.notes ?? undefined,
  socialLinks: contact.socialLinks.map((link) => ({
    platform: link.platform,
    handle: link.handle,
  })),
  organizations: contact.organizations.map(({ organization }) => ({
    id: organization.id,
    name: organization.name,
    email: organization.email,
  })),
  groupId:
    contact.groups[0]?.groupId ?? contact.groupId ?? undefined,
  groupIds:
    contact.groups.length > 0
      ? contact.groups.map((entry) => entry.groupId)
      : contact.groupId
        ? [contact.groupId]
        : [],
  group:
    contact.groups[0]?.group
      ? mapGroup(contact.groups[0].group)
      : contact.group
        ? mapGroup(contact.group)
        : undefined,
  groups:
    contact.groups.length > 0
      ? contact.groups.map((entry) => mapGroup(entry.group))
      : contact.group
        ? [mapGroup(contact.group)]
        : [],
  profileAttributes: contact.attributes
    .map(toProfileAttribute)
    .filter((attribute): attribute is ContactProfileAttribute =>
      Boolean(attribute),
    ),
  files: contact.files.map((file) => ({
    id: file.id,
    name: file.name ?? file.url,
    type: file.type,
    url: file.url,
  })),
  events: (() => {
    const eventMap = new Map<
      string,
      {
        event: {
          id: string;
          teamId: string;
          title: string;
          description?: string;
          location?: string;
          startDate: Date;
          endDate?: Date;
          createdAt: Date;
          updatedAt: Date;
        };
        roles: {
          eventRole: {
            id: string;
            teamId: string;
            name: string;
            color?: string;
            createdAt: Date;
            updatedAt: Date;
          };
        }[];
        participationTypes: Set<"linked" | "registered">;
        registration?: { id: string; createdAt: Date };
      }
    >();

    const upsertEvent = (
      eventId: string,
      entry: Partial<{
        event: {
          id: string;
          teamId: string;
          title: string;
          description?: string;
          location?: string;
          startDate: Date;
          endDate?: Date;
          createdAt: Date;
          updatedAt: Date;
        };
        roles: {
          eventRole: {
            id: string;
            teamId: string;
            name: string;
            color?: string;
            createdAt: Date;
            updatedAt: Date;
          };
        }[];
        participationType: "linked" | "registered";
        registration: { id: string; createdAt: Date };
      }>,
    ) => {
      const existing = eventMap.get(eventId);
      if (existing) {
        if (entry.event) {
          existing.event = entry.event;
        }
        if (entry.roles) {
          existing.roles = entry.roles;
        }
        if (entry.participationType) {
          existing.participationTypes.add(entry.participationType);
        }
        if (entry.registration) {
          existing.registration = entry.registration;
        }
        return;
      }

      if (!entry.event) {
        return;
      }

      eventMap.set(eventId, {
        event: entry.event,
        roles: entry.roles ?? [],
        participationTypes: new Set(
          entry.participationType ? [entry.participationType] : [],
        ),
        registration: entry.registration,
      });
    };

    const mapEventDetails = (
      event: ContactWithAttributes["events"][number]["event"],
    ) => ({
      id: event.id,
      teamId: event.teamId,
      eventTypeId: event.eventTypeId ?? undefined,
      title: event.title,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      isOnline: event.isOnline,
      expectedGuests: event.expectedGuests ?? undefined,
      hasRemuneration: event.hasRemuneration,
      address: event.address ?? undefined,
      city: event.city ?? undefined,
      postalCode: event.postalCode ?? undefined,
      timeZone: event.timeZone ?? undefined,
      merchNeeded: event.merchNeeded,
      startDate: event.startDate,
      endDate: event.endDate ?? undefined,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    });

    (contact.events || []).forEach((eventContact) => {
      upsertEvent(eventContact.event.id, {
        event: mapEventDetails(eventContact.event),
        roles: eventContact.roles.map((role) => ({
          eventRole: {
            id: role.eventRole.id,
            teamId: role.eventRole.teamId,
            name: role.eventRole.name,
            color: role.eventRole.color ?? undefined,
            createdAt: role.eventRole.createdAt,
            updatedAt: role.eventRole.updatedAt,
          },
        })),
        participationType: "linked",
      });
    });

    (contact.registrations || []).forEach((registration) => {
      upsertEvent(registration.event.id, {
        event: mapEventDetails(registration.event),
        participationType: "registered",
        registration: {
          id: registration.id,
          createdAt: registration.createdAt,
        },
      });
    });

    return Array.from(eventMap.values())
      .map((entry) => ({
        event: entry.event,
        roles: entry.roles,
        participationTypes: Array.from(entry.participationTypes),
        registration: entry.registration,
      }))
      .sort(
        (a, b) => a.event.startDate.getTime() - b.event.startDate.getTime(),
      );
  })(),
  createdAt: contact.createdAt,
  updatedAt: contact.updatedAt,
});

async function getTeamContacts(
  teamId: string,
  query?: string,
  userId?: string,
  filters?: ContactFilter[],
  roles?: Roles[],
): Promise<ContactType[]>;
async function getTeamContacts(
  teamId: string,
  query: string | undefined,
  userId: string | undefined,
  filters: ContactFilter[] | undefined,
  roles: Roles[] | undefined,
  pagination: { page: number; pageSize: number },
): Promise<{ data: ContactType[]; total: number }>;
async function getTeamContacts(
  teamId: string,
  query?: string,
  userId?: string,
  filters?: ContactFilter[],
  roles: Roles[] = [],
  pagination?: { page: number; pageSize: number },
) {
  await ensureDefaultGroup(teamId);

  const andConditions: Prisma.ContactWhereInput[] = [
    {
      teamId,
    },
  ];

  const visibility = await getContactVisibility({ teamId, userId, roles });
  const userGroupIds = visibility.userGroupIds;
  andConditions[0] = visibility.where;

  if (query) {
    const searchConditions: Prisma.ContactWhereInput[] = [
      { name: { contains: query, mode: "insensitive" } },
      { pronouns: { contains: query, mode: "insensitive" } },
      { otherMargins: { contains: query, mode: "insensitive" } },
      { address: { contains: query, mode: "insensitive" } },
      { postalCode: { contains: query, mode: "insensitive" } },
      { state: { contains: query, mode: "insensitive" } },
      { city: { contains: query, mode: "insensitive" } },
      { country: { contains: query, mode: "insensitive" } },
      { phone: { contains: query, mode: "insensitive" } },
      { signal: { contains: query, mode: "insensitive" } },
      { website: { contains: query, mode: "insensitive" } },
      { notes: { contains: query, mode: "insensitive" } },
      {
        emails: {
          some: {
            email: { contains: query, mode: "insensitive" },
          },
        },
      },
      {
        attributes: {
          some: {
            OR: [
              { key: { contains: query, mode: "insensitive" } },
              { stringValue: { contains: query, mode: "insensitive" } },
              { locationLabel: { contains: query, mode: "insensitive" } },
            ],
          },
        },
      },
    ];

    andConditions.push({
      OR: searchConditions,
    });
  }

  const resolvedFilters = filters ?? [];

  const contactFieldFilters = resolvedFilters.filter(
    (filter): filter is Extract<ContactFilter, { type: "contactField" }> =>
      filter.type === "contactField",
  );

  contactFieldFilters.forEach((filter) => {
    const fieldName = filter.field;
    const trimmedValue = filter.value?.trim() ?? "";

    const containsCondition = (() => {
      switch (fieldName) {
        case "email":
          return {
            emails: {
              some: {
                email: {
                  contains: trimmedValue,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            },
          };
        case "phone":
          return {
            phone: {
              contains: trimmedValue,
              mode: Prisma.QueryMode.insensitive,
            },
          };
        case "signal":
          return {
            signal: {
              contains: trimmedValue,
              mode: Prisma.QueryMode.insensitive,
            },
          };
        case "pronouns":
          return {
            pronouns: {
              contains: trimmedValue,
              mode: Prisma.QueryMode.insensitive,
            },
          };
        case "address":
          return {
            address: {
              contains: trimmedValue,
              mode: Prisma.QueryMode.insensitive,
            },
          };
        case "postalCode":
          return {
            postalCode: {
              contains: trimmedValue,
              mode: Prisma.QueryMode.insensitive,
            },
          };
        case "state":
          return {
            state: {
              contains: trimmedValue,
              mode: Prisma.QueryMode.insensitive,
            },
          };
        case "city":
          return {
            city: {
              contains: trimmedValue,
              mode: Prisma.QueryMode.insensitive,
            },
          };
        case "country":
          return {
            country: {
              contains: trimmedValue,
              mode: Prisma.QueryMode.insensitive,
            },
          };
        case "website":
          return {
            website: {
              contains: trimmedValue,
              mode: Prisma.QueryMode.insensitive,
            },
          };
        case "notes":
          return {
            notes: {
              contains: trimmedValue,
              mode: Prisma.QueryMode.insensitive,
            },
          };
        default:
          return {
            name: {
              contains: trimmedValue,
              mode: Prisma.QueryMode.insensitive,
            },
          };
      }
    })();

    const notNullCondition: Prisma.ContactWhereInput | null = (() => {
      switch (fieldName) {
        case "email":
          return { emails: { some: {} } };
        case "phone":
          return { phone: { not: null } };
        case "signal":
          return { signal: { not: null } };
        case "pronouns":
          return { pronouns: { not: null } };
        case "address":
          return { address: { not: null } };
        case "postalCode":
          return { postalCode: { not: null } };
        case "state":
          return { state: { not: null } };
        case "city":
          return { city: { not: null } };
        case "country":
          return { country: { not: null } };
        case "website":
          return { website: { not: null } };
        case "notes":
          return { notes: { not: null } };
        default:
          return null;
      }
    })();

    const notEmptyCondition = (() => {
      switch (fieldName) {
        case "email":
          return { emails: { some: {} } };
        case "phone":
          return { NOT: { phone: { equals: "" } } };
        case "signal":
          return { NOT: { signal: { equals: "" } } };
        case "pronouns":
          return { NOT: { pronouns: { equals: "" } } };
        case "address":
          return { NOT: { address: { equals: "" } } };
        case "postalCode":
          return { NOT: { postalCode: { equals: "" } } };
        case "state":
          return { NOT: { state: { equals: "" } } };
        case "city":
          return { NOT: { city: { equals: "" } } };
        case "country":
          return { NOT: { country: { equals: "" } } };
        case "website":
          return { NOT: { website: { equals: "" } } };
        case "notes":
          return { NOT: { notes: { equals: "" } } };
        default:
          return { NOT: { name: { equals: "" } } };
      }
    })();

    const missingCondition: Prisma.ContactWhereInput = (() => {
      switch (fieldName) {
        case "email":
          return { emails: { none: {} } };
        case "phone":
          return {
            OR: [{ phone: { equals: null } }, { phone: { equals: "" } }],
          };
        case "pronouns":
          return {
            OR: [{ pronouns: { equals: null } }, { pronouns: { equals: "" } }],
          };
        case "signal":
          return {
            OR: [{ signal: { equals: null } }, { signal: { equals: "" } }],
          };
        case "address":
          return {
            OR: [{ address: { equals: null } }, { address: { equals: "" } }],
          };
        case "postalCode":
          return {
            OR: [
              { postalCode: { equals: null } },
              { postalCode: { equals: "" } },
            ],
          };
        case "state":
          return {
            OR: [{ state: { equals: null } }, { state: { equals: "" } }],
          };
        case "city":
          return {
            OR: [{ city: { equals: null } }, { city: { equals: "" } }],
          };
        case "country":
          return {
            OR: [{ country: { equals: null } }, { country: { equals: "" } }],
          };
        case "website":
          return {
            OR: [{ website: { equals: null } }, { website: { equals: "" } }],
          };
        case "notes":
          return {
            OR: [{ notes: { equals: null } }, { notes: { equals: "" } }],
          };
        default:
          return { name: { equals: "" } };
      }
    })();

    switch (filter.operator) {
      case "contains": {
        if (trimmedValue) {
          andConditions.push(containsCondition);
        }
        break;
      }
      case "has": {
        if (notNullCondition) {
          andConditions.push(notNullCondition);
        }
        andConditions.push(notEmptyCondition);
        break;
      }
      case "missing": {
        andConditions.push(missingCondition);
        break;
      }
      default:
        break;
    }
  });

  const attributeFilters = resolvedFilters.filter(
    (filter): filter is Extract<ContactFilter, { type: "attribute" }> =>
      filter.type === "attribute" && Boolean(filter.key?.trim()),
  );

  attributeFilters.forEach((filter) => {
    const key = filter.key.trim();
    const value = (filter.value ?? "").trim();

    const baseCondition: Prisma.ContactAttributeWhereInput = {
      key: { equals: key },
    };

    if (filter.operator === "contains") {
      if (!value) {
        return;
      }

      andConditions.push({
        attributes: {
          some: {
            ...baseCondition,
            OR: [
              {
                stringValue: {
                  contains: value,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                locationLabel: {
                  contains: value,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          },
        },
      });
      return;
    }

    if (filter.operator === "equals") {
      if (!value) {
        return;
      }

      const orClauses: Prisma.ContactAttributeWhereInput[] = [
        {
          stringValue: {
            equals: value,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          locationLabel: {
            equals: value,
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ];

      const numericValue = Number(value);
      if (!Number.isNaN(numericValue)) {
        orClauses.push({
          numberValue: new Prisma.Decimal(numericValue),
        });
      }

      const dateValue = new Date(value);
      if (!Number.isNaN(dateValue.getTime())) {
        orClauses.push({
          dateValue,
        });
      }

      andConditions.push({
        attributes: {
          some: {
            ...baseCondition,
            OR: orClauses,
          },
        },
      });
    }
  });

  const groupFilters = resolvedFilters.filter(
    (filter): filter is Extract<ContactFilter, { type: "group" }> =>
      filter.type === "group" && Boolean(filter.groupId),
  );
  if (groupFilters.length > 0) {
    andConditions.push({
      OR: groupFilters.map((filter) => ({
        groups: {
          some: {
            groupId: filter.groupId,
          },
        },
      })),
    });
  }

  const contactIdsFilters = resolvedFilters.filter(
    (filter): filter is Extract<ContactFilter, { type: "contactIds" }> =>
      filter.type === "contactIds" &&
      Array.isArray(filter.contactIds) &&
      filter.contactIds.length > 0,
  );
  if (contactIdsFilters.length > 0) {
    const allContactIds = contactIdsFilters.flatMap((f) => f.contactIds);
    andConditions.push({
      id: { in: allContactIds },
    });
  }

  const eventRoleIds = resolvedFilters
    .filter(
      (filter): filter is Extract<ContactFilter, { type: "eventRole" }> =>
        filter.type === "eventRole" && Boolean(filter.eventRoleId),
    )
    .map((filter) => filter.eventRoleId);
  if (eventRoleIds.length > 0) {
    andConditions.push({
      events: {
        some: {
          roles: {
            some: {
              eventRoleId: {
                in: eventRoleIds,
              },
            },
          },
        },
      },
    });
  }

  const createdAtFilter = resolvedFilters.find(
    (filter): filter is Extract<ContactFilter, { type: "createdAt" }> =>
      filter.type === "createdAt" &&
      (Boolean(filter.from) || Boolean(filter.to)),
  );
  if (createdAtFilter) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (createdAtFilter.from) {
      const fromDate = new Date(createdAtFilter.from);
      if (!Number.isNaN(fromDate.getTime())) {
        dateFilter.gte = fromDate;
      }
    }
    if (createdAtFilter.to) {
      const toDate = new Date(createdAtFilter.to);
      if (!Number.isNaN(toDate.getTime())) {
        dateFilter.lte = toDate;
      }
    }
    if (Object.keys(dateFilter).length > 0) {
      andConditions.push({
        createdAt: dateFilter,
      });
    }
  }

  const distanceFilters = resolvedFilters.filter(
    (filter): filter is Extract<ContactFilter, { type: "distance" }> =>
      filter.type === "distance",
  );

  for (const filter of distanceFilters) {
    const normalizedPostal = normalizePostalCode(filter.postalCode);
    const normalizedCountry =
      normalizeCountryCode(filter.countryCode) ??
      normalizeCountryCode(filter.countryCode.toUpperCase());
    const radiusKm = Number(filter.radiusKm);

    if (!normalizedPostal || !normalizedCountry || !Number.isFinite(radiusKm)) {
      andConditions.push({ id: { equals: "__none__" } });
      continue;
    }

    const centroid = await prisma.postalCodeCentroid.findUnique({
      where: {
        countryCode_postalCode: {
          countryCode: normalizedCountry,
          postalCode: normalizedPostal,
        },
      },
      select: {
        latitude: true,
        longitude: true,
      },
    });

    if (!centroid?.latitude || !centroid?.longitude) {
      andConditions.push({ id: { equals: "__none__" } });
      continue;
    }

    const radiusMeters = radiusKm * 1000;

    const nearby = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT "id"
        FROM "Contact"
        WHERE "teamId" = ${teamId}
          AND "latitude" IS NOT NULL
          AND "longitude" IS NOT NULL
          AND ST_DWithin(
            geography(ST_MakePoint("longitude", "latitude")),
            geography(ST_MakePoint(${centroid.longitude}, ${centroid.latitude})),
            ${radiusMeters}
          )
      `,
    );

    const nearbyIds = nearby.map((row) => row.id);
    if (!nearbyIds.length) {
      andConditions.push({ id: { equals: "__none__" } });
      continue;
    }

    andConditions.push({ id: { in: nearbyIds } });
  }

  const where: Prisma.ContactWhereInput =
    andConditions.length === 1 ? andConditions[0] : { AND: andConditions };

  const page = Math.max(pagination?.page ?? 1, 1);
  const pageSize = Math.max(pagination?.pageSize ?? 10, 1);
  const skip = (page - 1) * pageSize;

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: contactInclude,
      orderBy: {
        createdAt: "desc",
      },
      ...(pagination ? { skip, take: pageSize } : {}),
    }),
    pagination ? prisma.contact.count({ where }) : Promise.resolve(0),
  ]);

  const accessMap = await getContactFieldAccessMap(teamId);

  const mapped = contacts
    .map(mapContact)
    .map((contact) => filterContactByAccess(contact, accessMap, userGroupIds));

  if (pagination) {
    return { data: mapped, total };
  }

  return mapped;
}

const getContactById = async (
  contactId: string,
  teamId: string,
  userId?: string,
  roles: Roles[] = [],
) => {
  const contact = await prisma.contact.findFirst({
    where: {
      id: contactId,
      teamId,
    },
    include: contactInclude,
  });

  if (!contact) {
    return null;
  }

  if (!userId) {
    return mapContact(contact);
  }

  if (!roles.includes(Roles.Admin)) {
    const userGroups = await prisma.userGroup.findMany({
      where: {
        userId,
        group: {
          teamId,
        },
      },
      select: {
        groupId: true,
        group: {
          select: {
            canAccessAllContacts: true,
          },
        },
      },
    });
    const hasAllAccessPermission = userGroups.some(
      (entry) => entry.group.canAccessAllContacts,
    );

    if (!hasAllAccessPermission && contact.groups.length > 0) {
      const userGroupIds = new Set(userGroups.map((entry) => entry.groupId));
      const canAccessContact = contact.groups.some((entry) =>
        userGroupIds.has(entry.groupId),
      );

      if (!canAccessContact) {
        return null;
      }
    }
  }

  const [accessMap, userGroupIds] = await Promise.all([
    getContactFieldAccessMap(teamId),
    getUserGroupIdsForTeam(userId, teamId),
  ]);

  return filterContactByAccess(mapContact(contact), accessMap, userGroupIds);
};

const createContact = async (
  input: CreateContactInput,
  userId?: string,
  userName?: string,
) => {
  const sanitizedInput = await applyContactFieldAccess(input, userId);

  const {
    teamId,
    name,
    pronouns,
    gender,
    genderRequestPreference,
    isBipoc,
    racismRequestPreference,
    otherMargins,
    onboardingDate,
    breakUntil,
    address,
    postalCode,
    state,
    city,
    country,
    email,
    additionalEmails,
    phone,
    signal,
    website,
    notes,
    socialLinks,
    organizationIds,
    groupId,
    groupIds,
    profileAttributes,
    files,
  } = sanitizedInput;
  const normalizedGroupIds = normalizeGroupIds(groupIds, groupId);
  const normalizedAttributes = normalizeAttributes(profileAttributes);
  const normalizedSocialLinks = normalizeSocialLinks(socialLinks);
  const normalizedOrganizationIds = Array.from(new Set(organizationIds ?? []));
  const trimmedName = name?.trim() ?? "";
  if (!trimmedName) {
    throw new Error("Name is required");
  }

  const normalizedPronouns = pronouns?.trim() || undefined;
  const normalizedGender = gender ?? undefined;
  const normalizedGenderRequestPreference =
    genderRequestPreference ?? undefined;
  const normalizedIsBipoc = typeof isBipoc === "boolean" ? isBipoc : undefined;
  const normalizedRacismRequestPreference =
    racismRequestPreference ?? undefined;
  const normalizedOtherMargins = otherMargins?.trim() || undefined;
  const normalizedOnboardingDate =
    onboardingDate && !Number.isNaN(Date.parse(onboardingDate))
      ? new Date(onboardingDate)
      : undefined;
  const normalizedBreakUntil =
    breakUntil && !Number.isNaN(Date.parse(breakUntil))
      ? new Date(breakUntil)
      : undefined;
  const normalizedAddress = address?.trim() || undefined;
  const normalizedPostalCode = normalizePostalCode(postalCode);
  const normalizedState = state?.trim() || undefined;
  const normalizedCity = city?.trim() || undefined;
  const normalizedCountry = country?.trim() || undefined;
  const normalizedCountryCode = normalizeCountryCode(normalizedCountry);
  const normalizedEmail = (email ?? "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Email is required");
  }
  const normalizedAdditionalEmails = normalizeAdditionalEmails(
    additionalEmails,
    normalizedEmail,
  );
  const normalizedPhone = phone ? phone.trim() : undefined;
  const normalizedSignal = signal ? signal.trim() : undefined;
  const normalizedWebsite = website?.trim() || undefined;
  const normalizedNotes = notes?.trim() || undefined;

  return prisma.$transaction(async (tx) => {
    await validateContactGroupIds(tx, teamId, normalizedGroupIds);
    await assertIdentityEmailsAvailable(tx, teamId, [
      normalizedEmail,
      ...normalizedAdditionalEmails
        .filter((entry) => entry.kind === ContactEmailKind.ALIAS)
        .map((entry) => entry.email),
    ]);

    const centroid = await resolvePostalCentroid(
      tx,
      normalizedCountryCode,
      normalizedPostalCode,
    );

    const contact = await tx.contact.create({
      data: {
        teamId,
        name: trimmedName,
        pronouns: normalizedPronouns,
        gender: normalizedGender,
        genderRequestPreference: normalizedGenderRequestPreference,
        isBipoc: normalizedIsBipoc,
        racismRequestPreference: normalizedRacismRequestPreference,
        otherMargins: normalizedOtherMargins,
        onboardingDate: normalizedOnboardingDate,
        breakUntil: normalizedBreakUntil,
        address: normalizedAddress,
        postalCode: normalizedPostalCode,
        state: normalizedState,
        city: normalizedCity,
        country: normalizedCountry,
        countryCode: normalizedCountryCode ?? null,
        latitude: centroid?.latitude ?? null,
        longitude: centroid?.longitude ?? null,
        phone: normalizedPhone,
        signal: normalizedSignal,
        website: normalizedWebsite,
        notes: normalizedNotes,
        groupId: normalizedGroupIds[0],
      },
    });

    await syncContactGroups(tx, contact.id, teamId, normalizedGroupIds);
    await setContactEmails(tx, {
      teamId,
      contactId: contact.id,
      primaryEmail: normalizedEmail,
      additionalEmails: normalizedAdditionalEmails,
    });

    if (normalizedAttributes.length > 0) {
      for (const attribute of normalizedAttributes) {
        await tx.contactAttribute.create({
          data: {
            contactId: contact.id,
            key: attribute.key,
            type: attribute.type,
            stringValue: attribute.stringValue,
            numberValue: attribute.numberValue,
            dateValue: attribute.dateValue,
            locationLabel: attribute.locationLabel,
            latitude: attribute.latitude,
            longitude: attribute.longitude,
          },
        });
      }
    }

    if (normalizedSocialLinks.length > 0) {
      await tx.contactSocialLink.createMany({
        data: normalizedSocialLinks.map((link) => ({
          contactId: contact.id,
          platform: link.platform,
          handle: link.handle,
        })),
      });
    }

    if (normalizedOrganizationIds.length > 0) {
      const organizations = await tx.organization.findMany({
        where: {
          id: { in: normalizedOrganizationIds },
          teamId,
        },
        select: { id: true },
      });

      if (organizations.length !== normalizedOrganizationIds.length) {
        throw new Error(
          "One or more selected organizations could not be found.",
        );
      }

      await tx.contactOrganization.createMany({
        data: normalizedOrganizationIds.map((organizationId) => ({
          contactId: contact.id,
          organizationId,
        })),
      });
    }

    const nextFiles = files?.filter((f) => f.name && f.url && f.type) ?? [];

    if (nextFiles.length > 0 && userId) {
      await assertPendingUploadsAvailable({
        files: nextFiles,
        teamId,
        userId,
        tx,
      });
    }

    const fileData = userId
      ? nextFiles.map((f) => ({
          name: f.name,
          type: f.type,
          url: f.url,
          contactId: contact.id,
          createdById: userId,
          updatedById: userId,
        }))
      : [];

    if (fileData.length > 0 && userId) {
      await tx.file.createMany({ data: fileData });
      await consumePendingUploads({
        files: nextFiles,
        teamId,
        userId,
        tx,
      });
    }

    // Log contact creation
    await logContactCreation(contact.id, userId, userName, tx, {
      source: "manual",
      createdVia: "contact-form",
      ...(fileData.length > 0
        ? {
            attachedFiles: mapFileChangeValue(fileData),
          }
        : {}),
    });

    const created = await tx.contact.findUniqueOrThrow({
      where: { id: contact.id },
      include: contactInclude,
    });

    return mapContact(created);
  });
};

const importContactsFromCsv = async ({
  teamId,
  csv,
  columnMapping,
  userId,
  userName,
}: ImportContactsFromCsvInput): Promise<ContactImportResult> => {
  const parsed = parseCsv(csv.replace(/^\uFEFF/, ""));
  const headerMap = buildContactImportHeaderMap(parsed.headers, columnMapping);

  if (!parsed.headers.length || parsed.rows.length === 0) {
    throw new Error("CSV file does not contain any contact rows.");
  }

  if (!headerMap.has("name") || !headerMap.has("email")) {
    throw new Error("CSV file must include name and email columns.");
  }

  if (parsed.rows.length > 1000) {
    throw new Error("CSV import is limited to 1000 contacts at a time.");
  }

  const candidateEmails = parsed.rows
    .map((row) => getCsvValue(row, headerMap, "email")?.toLowerCase())
    .filter((email): email is string => Boolean(email));
  const existingContacts = candidateEmails.length
    ? await prisma.contactEmail.findMany({
        where: {
          teamId,
          email: { in: candidateEmails },
          kind: { in: [ContactEmailKind.PRIMARY, ContactEmailKind.ALIAS] },
        },
        select: { email: true },
      })
    : [];
  const existingEmails = new Set(
    existingContacts
      .map((contact) => contact.email?.toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );

  const groups = await prisma.group.findMany({
    where: { teamId },
    select: { id: true, name: true },
  });
  const groupIds = new Set(groups.map((group) => group.id));
  const groupNameMap = new Map(
    groups.map((group) => [group.name.trim().toLowerCase(), group.id]),
  );

  const seenEmails = new Set<string>();
  const skippedRows: ContactImportSkippedRow[] = [];
  let created = 0;

  for (const [index, row] of parsed.rows.entries()) {
    const rowNumber = index + 2;
    const name = getCsvValue(row, headerMap, "name");
    const email = getCsvValue(row, headerMap, "email")?.toLowerCase();

    if (!name) {
      skippedRows.push({ rowNumber, reason: "Name is required." });
      continue;
    }

    if (!email) {
      skippedRows.push({ rowNumber, reason: "Email is required." });
      continue;
    }

    if (seenEmails.has(email)) {
      skippedRows.push({
        rowNumber,
        reason: "Duplicate email within this CSV file.",
      });
      continue;
    }

    seenEmails.add(email);

    if (existingEmails.has(email)) {
      skippedRows.push({
        rowNumber,
        reason: "A contact with this email already exists.",
      });
      continue;
    }

    const csvGroupId = getCsvValue(row, headerMap, "groupId");
    const csvGroupName = getCsvValue(row, headerMap, "group");
    const groupId = (() => {
      if (csvGroupId && groupIds.has(csvGroupId)) {
        return csvGroupId;
      }

      if (csvGroupName) {
        return groupNameMap.get(csvGroupName.trim().toLowerCase());
      }

      return undefined;
    })();

    if (csvGroupId && !groupId) {
      skippedRows.push({
        rowNumber,
        reason: "Group ID does not belong to this team.",
      });
      continue;
    }

    if (csvGroupName && !groupId) {
      skippedRows.push({
        rowNumber,
        reason: "Group name was not found for this team.",
      });
      continue;
    }

    try {
      await createContact(
        {
          teamId,
          name,
          email,
          pronouns: getCsvValue(row, headerMap, "pronouns"),
          address: getCsvValue(row, headerMap, "address"),
          postalCode: getCsvValue(row, headerMap, "postalCode"),
          state: getCsvValue(row, headerMap, "state"),
          city: getCsvValue(row, headerMap, "city"),
          country: getCsvValue(row, headerMap, "country"),
          phone: getCsvValue(row, headerMap, "phone"),
          signal: getCsvValue(row, headerMap, "signal"),
          website: getCsvValue(row, headerMap, "website"),
          notes: getCsvValue(row, headerMap, "notes"),
          socialLinks: [],
          profileAttributes: [],
          groupIds: groupId ? [groupId] : [],
        },
        userId,
        userName,
      );
      created += 1;
      existingEmails.add(email);
    } catch (error) {
      skippedRows.push({
        rowNumber,
        reason:
          error instanceof Error
            ? error.message
            : "Could not import this contact.",
      });
    }
  }

  return {
    created,
    skipped: skippedRows.length,
    totalRows: parsed.rows.length,
    skippedRows: skippedRows.slice(0, 50),
  };
};

const importContactsFromVCard = async ({
  teamId,
  vcard,
  userId,
  userName,
}: ImportContactsFromVCardInput): Promise<ContactImportResult> => {
  const contacts = parseVCardContacts(vcard);

  if (contacts.length === 0) {
    throw new Error("VCF file does not contain any contacts.");
  }

  if (contacts.length > 1000) {
    throw new Error("VCF import is limited to 1000 contacts at a time.");
  }

  const candidateEmails = contacts.flatMap((contact) =>
    [
      contact.email,
      ...contact.additionalEmails.map(({ email }) => email),
    ].filter((email): email is string => Boolean(email)),
  );
  const existingContacts = candidateEmails.length
    ? await prisma.contactEmail.findMany({
        where: {
          teamId,
          email: { in: candidateEmails },
          kind: { in: [ContactEmailKind.PRIMARY, ContactEmailKind.ALIAS] },
        },
        select: { email: true },
      })
    : [];
  const existingEmails = new Set(
    existingContacts.map(({ email }) => email.toLowerCase()),
  );
  const seenEmails = new Set<string>();
  const skippedRows: ContactImportSkippedRow[] = [];
  let created = 0;

  for (const [index, contact] of contacts.entries()) {
    const rowNumber = index + 1;
    const emails = [
      contact.email,
      ...contact.additionalEmails.map(({ email }) => email),
    ].filter((email): email is string => Boolean(email));

    if (!contact.name) {
      skippedRows.push({ rowNumber, reason: "Name is required." });
      continue;
    }

    if (emails.length === 0 && !contact.phone) {
      skippedRows.push({
        rowNumber,
        reason: "At least one email address or phone number is required.",
      });
      continue;
    }

    if (emails.some((email) => seenEmails.has(email))) {
      skippedRows.push({
        rowNumber,
        reason: "Duplicate email within this VCF file.",
      });
      continue;
    }

    for (const email of emails) {
      seenEmails.add(email);
    }

    if (emails.some((email) => existingEmails.has(email))) {
      skippedRows.push({
        rowNumber,
        reason: "A contact with one of these email addresses already exists.",
      });
      continue;
    }

    try {
      await createContact(
        {
          teamId,
          name: contact.name,
          email: contact.email,
          additionalEmails: contact.additionalEmails.map((entry) => ({
            email: entry.email,
            kind: ContactEmailKind.ALIAS,
            label: entry.label,
          })),
          phone: contact.phone,
          address: contact.address,
          postalCode: contact.postalCode,
          city: contact.city,
          state: contact.state,
          country: contact.country,
          website: contact.website,
          notes: contact.notes,
          socialLinks: [],
          profileAttributes: [],
          groupIds: [],
        },
        userId,
        userName,
      );
      created += 1;
      for (const email of emails) {
        existingEmails.add(email);
      }
    } catch (error) {
      skippedRows.push({
        rowNumber,
        reason:
          error instanceof Error
            ? error.message
            : "Could not import this contact.",
      });
    }
  }

  return {
    created,
    skipped: skippedRows.length,
    totalRows: contacts.length,
    skippedRows: skippedRows.slice(0, 50),
  };
};

const updateContact = async (
  input: UpdateContactInput,
  userId?: string,
  userName?: string,
) => {
  const sanitizedInput = await applyContactFieldAccess(input, userId);

  const {
    contactId,
    teamId,
    name,
    pronouns,
    gender,
    genderRequestPreference,
    isBipoc,
    racismRequestPreference,
    otherMargins,
    onboardingDate,
    breakUntil,
    address,
    postalCode,
    state,
    city,
    country,
    email,
    additionalEmails,
    phone,
    signal,
    website,
    notes,
    groupId,
    groupIds,
    profileAttributes,
    socialLinks,
    organizationIds,
    files,
  } = sanitizedInput;
  const groupsProvided =
    Object.hasOwn(input, "groupIds") || Object.hasOwn(input, "groupId");
  const normalizedGroupIds = groupsProvided
    ? normalizeGroupIds(groupIds, groupId)
    : undefined;
  const normalizedName = typeof name === "string" ? name.trim() : undefined;
  const pronounsProvided = Object.hasOwn(input, "pronouns");
  const addressProvided = Object.hasOwn(input, "address");
  const postalCodeProvided = Object.hasOwn(input, "postalCode");
  const stateProvided = Object.hasOwn(input, "state");
  const cityProvided = Object.hasOwn(input, "city");
  const countryProvided = Object.hasOwn(input, "country");
  const normalizedPronouns = (() => {
    if (!pronounsProvided) {
      return undefined;
    }
    if (typeof pronouns !== "string") {
      return null;
    }
    const trimmed = pronouns.trim();
    return trimmed === "" ? null : trimmed;
  })();
  const normalizedAddress = (() => {
    if (!addressProvided) {
      return undefined;
    }
    if (typeof address !== "string") {
      return null;
    }
    const trimmed = address.trim();
    return trimmed === "" ? null : trimmed;
  })();
  const normalizedPostalCode = (() => {
    if (!postalCodeProvided) {
      return undefined;
    }
    if (typeof postalCode !== "string") {
      return null;
    }
    const normalized = normalizePostalCode(postalCode);
    return normalized ?? null;
  })();
  const normalizedState = (() => {
    if (!stateProvided) {
      return undefined;
    }
    if (typeof state !== "string") {
      return null;
    }
    const trimmed = state.trim();
    return trimmed === "" ? null : trimmed;
  })();
  const normalizedCity = (() => {
    if (!cityProvided) {
      return undefined;
    }
    if (typeof city !== "string") {
      return null;
    }
    const trimmed = city.trim();
    return trimmed === "" ? null : trimmed;
  })();
  const normalizedCountry = (() => {
    if (!countryProvided) {
      return undefined;
    }
    if (typeof country !== "string") {
      return null;
    }
    const trimmed = country.trim();
    return trimmed === "" ? null : trimmed;
  })();
  const normalizedCountryCode = (() => {
    if (!countryProvided) {
      return undefined;
    }
    if (normalizedCountry === null) {
      return null;
    }
    return normalizeCountryCode(normalizedCountry ?? undefined) ?? null;
  })();
  const genderProvided = Object.hasOwn(input, "gender");
  const normalizedGender = genderProvided ? (gender ?? null) : undefined;
  const genderRequestPreferenceProvided = Object.hasOwn(
    input,
    "genderRequestPreference",
  );
  const normalizedGenderRequestPreference = genderRequestPreferenceProvided
    ? (genderRequestPreference ?? null)
    : undefined;
  const bipocProvided = Object.hasOwn(input, "isBipoc");
  const normalizedIsBipoc = (() => {
    if (!bipocProvided) {
      return undefined;
    }
    if (typeof isBipoc === "boolean") {
      return isBipoc;
    }
    return null;
  })();
  const racismPreferenceProvided = Object.hasOwn(
    input,
    "racismRequestPreference",
  );
  const normalizedRacismRequestPreference = racismPreferenceProvided
    ? (racismRequestPreference ?? null)
    : undefined;
  const otherMarginsProvided = Object.hasOwn(input, "otherMargins");
  const normalizedOtherMargins = (() => {
    if (!otherMarginsProvided) {
      return undefined;
    }
    if (typeof otherMargins !== "string") {
      return null;
    }
    const trimmed = otherMargins.trim();
    return trimmed === "" ? null : trimmed;
  })();
  const onboardingProvided = Object.hasOwn(input, "onboardingDate");
  const normalizedOnboardingDate = (() => {
    if (!onboardingProvided) {
      return undefined;
    }
    if (!onboardingDate) {
      return null;
    }
    const parsed = new Date(onboardingDate);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Invalid onboarding date");
    }
    return parsed;
  })();
  const breakUntilProvided = Object.hasOwn(input, "breakUntil");
  const normalizedBreakUntil = (() => {
    if (!breakUntilProvided) {
      return undefined;
    }
    if (!breakUntil) {
      return null;
    }
    const parsed = new Date(breakUntil);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Invalid break until date");
    }
    return parsed;
  })();
  const normalizedEmail =
    email === undefined ? undefined : email.trim().toLowerCase();
  const additionalEmailsProvided = Object.hasOwn(input, "additionalEmails");
  const normalizedPhone = phone === undefined ? undefined : phone.trim();
  const normalizedSignal = signal === undefined ? undefined : signal.trim();
  const websiteProvided = Object.hasOwn(input, "website");
  const normalizedWebsite = (() => {
    if (!websiteProvided) {
      return undefined;
    }
    if (typeof website !== "string") {
      return null;
    }
    const trimmed = website.trim();
    return trimmed === "" ? null : trimmed;
  })();
  const notesProvided = Object.hasOwn(input, "notes");
  const normalizedNotes = (() => {
    if (!notesProvided) {
      return undefined;
    }
    if (typeof notes !== "string") {
      return null;
    }
    const trimmed = notes.trim();
    return trimmed === "" ? null : trimmed;
  })();
  const socialLinksProvided = Object.hasOwn(input, "socialLinks");
  const normalizedSocialLinks = socialLinksProvided
    ? normalizeSocialLinks(socialLinks)
    : [];
  const organizationIdsProvided = Object.hasOwn(input, "organizationIds");
  const normalizedOrganizationIds = organizationIdsProvided
    ? Array.from(new Set(organizationIds ?? []))
    : [];

  return prisma.$transaction(async (tx) => {
    // Get the existing contact
    const existing = await tx.contact.findFirst({
      where: {
        id: contactId,
        teamId,
      },
      include: {
        attributes: true,
        emails: true,
        socialLinks: true,
        groups: true,
        organizations: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!existing) {
      throw new Error("Contact not found");
    }

    // Track changes to basic fields
    const updates: Prisma.ContactUncheckedUpdateInput = {};

    if (normalizedName !== undefined && normalizedName !== existing.name) {
      await logFieldUpdate(
        contactId,
        "name",
        existing.name,
        normalizedName,
        userId,
        userName,
        tx,
      );
      updates.name = normalizedName;
    }

    if (pronounsProvided && normalizedPronouns !== existing.pronouns) {
      await logFieldUpdate(
        contactId,
        "pronouns",
        existing.pronouns,
        normalizedPronouns,
        userId,
        userName,
        tx,
      );
      updates.pronouns = normalizedPronouns;
    }

    if (genderProvided && normalizedGender !== existing.gender) {
      await logFieldUpdate(
        contactId,
        "gender",
        existing.gender,
        normalizedGender,
        userId,
        userName,
        tx,
      );
      updates.gender = normalizedGender;
    }

    if (
      genderRequestPreferenceProvided &&
      normalizedGenderRequestPreference !== existing.genderRequestPreference
    ) {
      await logFieldUpdate(
        contactId,
        "genderRequestPreference",
        existing.genderRequestPreference,
        normalizedGenderRequestPreference,
        userId,
        userName,
        tx,
      );
      updates.genderRequestPreference = normalizedGenderRequestPreference;
    }

    if (bipocProvided && normalizedIsBipoc !== existing.isBipoc) {
      await logFieldUpdate(
        contactId,
        "isBipoc",
        existing.isBipoc,
        normalizedIsBipoc,
        userId,
        userName,
        tx,
      );
      updates.isBipoc = normalizedIsBipoc;
    }

    if (
      racismPreferenceProvided &&
      normalizedRacismRequestPreference !== existing.racismRequestPreference
    ) {
      await logFieldUpdate(
        contactId,
        "racismRequestPreference",
        existing.racismRequestPreference,
        normalizedRacismRequestPreference,
        userId,
        userName,
        tx,
      );
      updates.racismRequestPreference = normalizedRacismRequestPreference;
    }

    if (
      otherMarginsProvided &&
      normalizedOtherMargins !== existing.otherMargins
    ) {
      await logFieldUpdate(
        contactId,
        "otherMargins",
        existing.otherMargins,
        normalizedOtherMargins,
        userId,
        userName,
        tx,
      );
      updates.otherMargins = normalizedOtherMargins;
    }

    if (onboardingProvided) {
      const existingValue = existing.onboardingDate
        ? existing.onboardingDate.toISOString()
        : null;
      const normalizedValue = normalizedOnboardingDate
        ? normalizedOnboardingDate.toISOString()
        : null;
      if (existingValue !== normalizedValue) {
        await logFieldUpdate(
          contactId,
          "onboardingDate",
          existing.onboardingDate,
          normalizedOnboardingDate,
          userId,
          userName,
          tx,
        );
        updates.onboardingDate = normalizedOnboardingDate;
      }
    }

    if (breakUntilProvided) {
      const existingValue = existing.breakUntil
        ? existing.breakUntil.toISOString()
        : null;
      const normalizedValue = normalizedBreakUntil
        ? normalizedBreakUntil.toISOString()
        : null;
      if (existingValue !== normalizedValue) {
        await logFieldUpdate(
          contactId,
          "breakUntil",
          existing.breakUntil,
          normalizedBreakUntil,
          userId,
          userName,
          tx,
        );
        updates.breakUntil = normalizedBreakUntil;
      }
    }

    if (addressProvided && normalizedAddress !== existing.address) {
      await logFieldUpdate(
        contactId,
        "address",
        existing.address,
        normalizedAddress,
        userId,
        userName,
        tx,
      );
      updates.address = normalizedAddress;
    }

    if (postalCodeProvided && normalizedPostalCode !== existing.postalCode) {
      await logFieldUpdate(
        contactId,
        "postalCode",
        existing.postalCode,
        normalizedPostalCode,
        userId,
        userName,
        tx,
      );
      updates.postalCode = normalizedPostalCode;
    }

    if (stateProvided && normalizedState !== existing.state) {
      await logFieldUpdate(
        contactId,
        "state",
        existing.state,
        normalizedState,
        userId,
        userName,
        tx,
      );
      updates.state = normalizedState;
    }

    if (cityProvided && normalizedCity !== existing.city) {
      await logFieldUpdate(
        contactId,
        "city",
        existing.city,
        normalizedCity,
        userId,
        userName,
        tx,
      );
      updates.city = normalizedCity;
    }

    if (countryProvided && normalizedCountry !== existing.country) {
      await logFieldUpdate(
        contactId,
        "country",
        existing.country,
        normalizedCountry,
        userId,
        userName,
        tx,
      );
      updates.country = normalizedCountry;
    }

    if (countryProvided && normalizedCountryCode !== existing.countryCode) {
      updates.countryCode = normalizedCountryCode;
    }

    if (postalCodeProvided || countryProvided) {
      const lookupPostalCode = postalCodeProvided
        ? (normalizedPostalCode ?? undefined)
        : (existing.postalCode ?? undefined);
      const lookupCountryCode =
        (countryProvided
          ? (normalizedCountryCode ?? undefined)
          : (existing.countryCode ?? undefined)) ??
        normalizeCountryCode(
          countryProvided
            ? (normalizedCountry ?? undefined)
            : (existing.country ?? undefined),
        );

      const centroid = await resolvePostalCentroid(
        tx,
        lookupCountryCode,
        normalizePostalCode(lookupPostalCode),
      );

      updates.latitude = centroid?.latitude ?? null;
      updates.longitude = centroid?.longitude ?? null;
    }

    const existingPrimaryEmail =
      existing.emails.find((entry) => entry.kind === ContactEmailKind.PRIMARY)
        ?.email ?? null;

    if (normalizedEmail !== undefined && normalizedEmail !== existingPrimaryEmail) {
      if (!normalizedEmail) {
        throw new Error("Primary email is required.");
      }

      await logFieldUpdate(
        contactId,
        "email",
        existingPrimaryEmail,
        normalizedEmail,
        userId,
        userName,
        tx,
      );
    }

    if (normalizedEmail !== undefined || additionalEmailsProvided) {
      const nextPrimaryEmail = normalizedEmail ?? existingPrimaryEmail;
      if (!nextPrimaryEmail) {
        throw new Error("Primary email is required.");
      }
      const oldEmailValue = existing.emails.map((entry) => ({
        email: entry.email,
        kind: entry.kind,
        label: entry.label,
      }));
      const nextAdditionalEmails = additionalEmailsProvided
        ? normalizeAdditionalEmails(additionalEmails, nextPrimaryEmail)
        : existing.emails
            .filter((entry) => entry.kind !== ContactEmailKind.PRIMARY)
            .map((entry) => ({
              id: entry.id,
              email: entry.email,
              kind: entry.kind as ContactEmailKind,
              label: entry.label ?? undefined,
            }));
      const nextEmailValue = [
        { email: nextPrimaryEmail, kind: ContactEmailKind.PRIMARY },
        ...nextAdditionalEmails,
      ];

      if (JSON.stringify(oldEmailValue) !== JSON.stringify(nextEmailValue)) {
        await logFieldUpdate(
          contactId,
          "emails",
          oldEmailValue,
          nextEmailValue,
          userId,
          userName,
          tx,
        );
      }

      await setContactEmails(tx, {
        teamId,
        contactId,
        primaryEmail: nextPrimaryEmail,
        additionalEmails: nextAdditionalEmails,
      });
    }

    if (normalizedPhone !== undefined && normalizedPhone !== existing.phone) {
      await logFieldUpdate(
        contactId,
        "phone",
        existing.phone,
        normalizedPhone,
        userId,
        userName,
        tx,
      );
      updates.phone = normalizedPhone;
    }

    if (
      normalizedSignal !== undefined &&
      normalizedSignal !== existing.signal
    ) {
      await logFieldUpdate(
        contactId,
        "signal",
        existing.signal,
        normalizedSignal,
        userId,
        userName,
        tx,
      );
      updates.signal = normalizedSignal;
    }

    if (
      normalizedWebsite !== undefined &&
      normalizedWebsite !== existing.website
    ) {
      await logFieldUpdate(
        contactId,
        "website",
        existing.website,
        normalizedWebsite,
        userId,
        userName,
        tx,
      );
      updates.website = normalizedWebsite;
    }

    if (normalizedNotes !== undefined && normalizedNotes !== existing.notes) {
      await logFieldUpdate(
        contactId,
        "notes",
        existing.notes,
        normalizedNotes,
        userId,
        userName,
        tx,
      );
      updates.notes = normalizedNotes;
    }

    if (socialLinksProvided) {
      const existingLinks = new Map(
        existing.socialLinks.map((link) => [link.platform, link]),
      );
      const nextLinks = new Map(
        normalizedSocialLinks.map((link) => [link.platform, link]),
      );

      for (const [platform, link] of existingLinks) {
        if (!nextLinks.has(platform)) {
          await logFieldUpdate(
            contactId,
            `socialLink.${platform}`,
            link.handle,
            null,
            userId,
            userName,
            tx,
          );
          await tx.contactSocialLink.delete({
            where: { id: link.id },
          });
        }
      }

      for (const [platform, link] of nextLinks) {
        const existingLink = existingLinks.get(platform);
        if (!existingLink) {
          await logFieldUpdate(
            contactId,
            `socialLink.${platform}`,
            null,
            link.handle,
            userId,
            userName,
            tx,
          );
          await tx.contactSocialLink.create({
            data: {
              contactId,
              platform: link.platform,
              handle: link.handle,
            },
          });
        } else if (existingLink.handle !== link.handle) {
          await logFieldUpdate(
            contactId,
            `socialLink.${platform}`,
            existingLink.handle,
            link.handle,
            userId,
            userName,
            tx,
          );
          await tx.contactSocialLink.update({
            where: { id: existingLink.id },
            data: { handle: link.handle },
          });
        }
      }
    }

    if (organizationIdsProvided) {
      const organizations = await tx.organization.findMany({
        where: {
          id: { in: normalizedOrganizationIds },
          teamId,
        },
        select: { id: true },
      });

      if (organizations.length !== normalizedOrganizationIds.length) {
        throw new Error(
          "One or more selected organizations could not be found.",
        );
      }

      const existingOrganizationIds = new Set(
        existing.organizations.map((entry) => entry.organizationId),
      );
      const nextOrganizationIds = new Set(normalizedOrganizationIds);

      for (const organizationId of existingOrganizationIds) {
        if (!nextOrganizationIds.has(organizationId)) {
          await tx.contactOrganization.delete({
            where: {
              contactId_organizationId: {
                contactId,
                organizationId,
              },
            },
          });
        }
      }

      for (const organizationId of nextOrganizationIds) {
        if (!existingOrganizationIds.has(organizationId)) {
          await tx.contactOrganization.create({
            data: {
              contactId,
              organizationId,
            },
          });
        }
      }
    }

    if (files !== undefined && userId) {
      const existingFiles = await tx.file.findMany({
        where: { contactId },
        select: { id: true, name: true, type: true, url: true },
      });

      const newUrls = new Set(files.map((f) => f.url));
      const nextFiles = files.filter((f) => f.name && f.url && f.type);
      const oldFileValue = mapFileChangeValue(existingFiles);
      const newFileValue = mapFileChangeValue(nextFiles);

      if (JSON.stringify(oldFileValue) !== JSON.stringify(newFileValue)) {
        await logFieldUpdate(
          contactId,
          "files",
          oldFileValue,
          newFileValue,
          userId,
          userName,
          tx,
        );
      }

      const toRemove = existingFiles.filter((f) => !newUrls.has(f.url));
      if (toRemove.length > 0) {
        await tx.file.deleteMany({
          where: { id: { in: toRemove.map((f) => f.id) } },
        });
      }

      const existingUrls = new Set(existingFiles.map((f) => f.url));
      const toAdd = nextFiles.filter(
        (f) => !existingUrls.has(f.url) && f.name && f.type,
      );

      if (toAdd.length > 0) {
        await assertPendingUploadsAvailable({
          files: toAdd,
          teamId,
          userId,
          tx,
        });
      }

      if (toAdd.length > 0) {
        await tx.file.createMany({
          data: toAdd.map((f) => ({
            name: f.name,
            type: f.type,
            url: f.url,
            contactId,
            createdById: userId,
            updatedById: userId,
          })),
        });
        await consumePendingUploads({
          files: toAdd,
          teamId,
          userId,
          tx,
        });
      }
    }

    if (normalizedGroupIds !== undefined) {
      const existingGroupIds = existing.groups.map((entry) => entry.groupId);
      const groupsChanged =
        existingGroupIds.length !== normalizedGroupIds.length ||
        existingGroupIds.some((id) => !normalizedGroupIds.includes(id));

      if (groupsChanged) {
        await logFieldUpdate(
          contactId,
          "groupIds",
          existingGroupIds,
          normalizedGroupIds,
          userId,
          userName,
          tx,
        );
      }

      await syncContactGroups(tx, contactId, teamId, normalizedGroupIds);
      updates.groupId = normalizedGroupIds[0] ?? null;
    } else if (groupId !== undefined && groupId !== existing.groupId) {
      await logFieldUpdate(
        contactId,
        "groupId",
        existing.groupId,
        groupId,
        userId,
        userName,
        tx,
      );
      updates.groupId = groupId;
    }

    // Update basic contact fields if there are changes
    if (Object.keys(updates).length > 0) {
      await tx.contact.update({
        where: { id: contactId },
        data: updates,
      });
    }

    // Handle profile attributes if provided
    if (profileAttributes !== undefined) {
      const normalizedAttributes = normalizeAttributes(profileAttributes);

      // Get existing attributes as a map
      const existingAttrsMap = new Map(
        existing.attributes.map((attr) => [attr.key, attr]),
      );

      // Get new attributes as a map
      const newAttrsMap = new Map(
        normalizedAttributes.map((attr) => [attr.key, attr]),
      );

      // Find attributes to delete (in existing but not in new)
      for (const [key, existingAttr] of existingAttrsMap) {
        if (!newAttrsMap.has(key)) {
          const oldValue = toProfileAttribute(existingAttr);
          await logFieldUpdate(
            contactId,
            `profileAttribute.${key}`,
            oldValue,
            null,
            userId,
            userName,
            tx,
          );
          await tx.contactAttribute.delete({
            where: { id: existingAttr.id },
          });
        }
      }

      // Find attributes to add or update
      for (const [key, newAttr] of newAttrsMap) {
        const existingAttr = existingAttrsMap.get(key);

        if (!existingAttr) {
          // New attribute - create it
          await logFieldUpdate(
            contactId,
            `profileAttribute.${key}`,
            null,
            newAttr,
            userId,
            userName,
            tx,
          );
          await tx.contactAttribute.create({
            data: {
              contactId,
              key: newAttr.key,
              type: newAttr.type,
              stringValue: newAttr.stringValue,
              numberValue: newAttr.numberValue,
              dateValue: newAttr.dateValue,
              locationLabel: newAttr.locationLabel,
              latitude: newAttr.latitude,
              longitude: newAttr.longitude,
            },
          });
        } else {
          // Check if attribute changed
          const oldValue = toProfileAttribute(existingAttr);
          const hasChanged =
            existingAttr.type !== newAttr.type ||
            existingAttr.stringValue !== newAttr.stringValue ||
            existingAttr.numberValue?.toString() !==
              newAttr.numberValue?.toString() ||
            existingAttr.dateValue?.toISOString() !==
              newAttr.dateValue?.toISOString() ||
            existingAttr.locationLabel !== newAttr.locationLabel ||
            existingAttr.latitude?.toString() !==
              newAttr.latitude?.toString() ||
            existingAttr.longitude?.toString() !==
              newAttr.longitude?.toString();

          if (hasChanged) {
            await logFieldUpdate(
              contactId,
              `profileAttribute.${key}`,
              oldValue,
              newAttr,
              userId,
              userName,
              tx,
            );
            await tx.contactAttribute.update({
              where: { id: existingAttr.id },
              data: {
                type: newAttr.type,
                stringValue: newAttr.stringValue,
                numberValue: newAttr.numberValue,
                dateValue: newAttr.dateValue,
                locationLabel: newAttr.locationLabel,
                latitude: newAttr.latitude,
                longitude: newAttr.longitude,
              },
            });
          }
        }
      }
    }

    // Return updated contact
    const updated = await tx.contact.findUniqueOrThrow({
      where: { id: contactId },
      include: contactInclude,
    });

    return mapContact(updated);
  });
};

const deleteContactFile = async (
  {
    teamId,
    contactId,
    fileId,
  }: {
    teamId: string;
    contactId: string;
    fileId: string;
  },
  userId: string,
  userName?: string,
) => {
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({
      where: {
        id: contactId,
        teamId,
      },
      include: {
        files: {
          select: {
            id: true,
            name: true,
            type: true,
            url: true,
          },
        },
      },
    });

    if (!contact) {
      throw new Error("Contact not found");
    }

    const file = contact.files.find((item) => item.id === fileId);

    if (!file) {
      throw new Error("File not found");
    }

    const oldFileValue = mapFileChangeValue(contact.files);
    const newFileValue = mapFileChangeValue(
      contact.files.filter((item) => item.id !== fileId),
    );

    await tx.file.delete({
      where: { id: fileId },
    });

    await logFieldUpdate(
      contactId,
      "files",
      oldFileValue,
      newFileValue,
      userId,
      userName,
      tx,
    );

    return file;
  });
};

const MERGE_SCALAR_FIELDS = [
  "name",
  "pronouns",
  "gender",
  "genderRequestPreference",
  "isBipoc",
  "racismRequestPreference",
  "otherMargins",
  "onboardingDate",
  "breakUntil",
  "address",
  "postalCode",
  "state",
  "city",
  "country",
  "phone",
  "signal",
  "website",
  "notes",
] as const;

type MergeScalarField = (typeof MERGE_SCALAR_FIELDS)[number];

const normalizeMergeScalarValue = (
  field: MergeScalarField,
  value: unknown,
) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  if (field === "onboardingDate" || field === "breakUntil") {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }
    return date;
  }

  if (field === "isBipoc") {
    return typeof value === "boolean" ? value : null;
  }

  return typeof value === "string" ? value.trim() || null : value;
};

const getMergeFieldValue = (
  contact: ContactWithAttributes,
  field: MergeScalarField,
) => {
  const value = contact[field];
  return value instanceof Prisma.Decimal ? value.toString() : value;
};

const getMergeConflicts = (contacts: ContactWithAttributes[]) =>
  MERGE_SCALAR_FIELDS.flatMap((field) => {
    const values = contacts.map((contact) => ({
      contactId: contact.id,
      value: getMergeFieldValue(contact, field),
    }));
    const distinct = new Set(
      values.map((entry) =>
        entry.value instanceof Date
          ? entry.value.toISOString()
          : JSON.stringify(entry.value ?? null),
      ),
    );

    if (distinct.size <= 1) {
      return [];
    }

    return [{ field, values }];
  });

const previewContactMerge = async (input: MergeContactsPreviewInput) => {
  const contacts = await prisma.contact.findMany({
    where: {
      teamId: input.teamId,
      id: { in: input.contactIds },
    },
    include: contactInclude,
    orderBy: { createdAt: "asc" },
  });

  if (contacts.length !== input.contactIds.length) {
    throw new Error("One or more selected contacts could not be found.");
  }

  return {
    contacts: contacts.map(mapContact),
    conflicts: getMergeConflicts(contacts),
  };
};

const mergeContacts = async (
  input: MergeContactsInput,
  userId?: string,
  userName?: string,
) => {
  const sourceContactIds = input.sourceContactIds.filter(
    (id) => id !== input.targetContactId,
  );

  if (!sourceContactIds.length) {
    throw new Error("Select at least one source contact to merge.");
  }

  const allContactIds = [input.targetContactId, ...sourceContactIds];

  return prisma.$transaction(async (tx) => {
    const contacts = await tx.contact.findMany({
      where: {
        teamId: input.teamId,
        id: { in: allContactIds },
      },
      include: {
        ...contactInclude,
        events: {
          include: {
            roles: true,
            event: true,
          },
        },
      },
    });

    if (contacts.length !== allContactIds.length) {
      throw new Error("One or more selected contacts could not be found.");
    }

    const target = contacts.find(
      (contact) => contact.id === input.targetContactId,
    );
    if (!target) {
      throw new Error("Target contact not found.");
    }

    const sources = contacts.filter((contact) =>
      sourceContactIds.includes(contact.id),
    );
    const preservedEmails = normalizeAdditionalEmails(
      input.preservedEmails,
      input.primaryEmail,
    );
    const selectedIdentityEmails = [
      input.primaryEmail,
      ...preservedEmails
        .filter((entry) => entry.kind === ContactEmailKind.ALIAS)
        .map((entry) => entry.email),
    ];

    await assertIdentityEmailsAvailable(
      tx,
      input.teamId,
      selectedIdentityEmails,
      allContactIds,
    );

    await tx.contactEmail.deleteMany({
      where: { contactId: { in: sourceContactIds } },
    });

    await setContactEmails(tx, {
      teamId: input.teamId,
      contactId: input.targetContactId,
      primaryEmail: input.primaryEmail,
      additionalEmails: preservedEmails,
      allowedContactIds: sourceContactIds,
    });

    const updates: Prisma.ContactUncheckedUpdateInput = {};

    for (const field of MERGE_SCALAR_FIELDS) {
      if (!Object.hasOwn(input.fieldSelections ?? {}, field)) {
        continue;
      }
      const normalized = normalizeMergeScalarValue(
        field,
        input.fieldSelections?.[field],
      );
      if (normalized !== undefined) {
        (updates as Record<string, unknown>)[field] = normalized;
      }
    }

    if (Object.hasOwn(updates, "postalCode") || Object.hasOwn(updates, "country")) {
      const nextPostal =
        typeof updates.postalCode === "string"
          ? updates.postalCode
          : target.postalCode;
      const nextCountry =
        typeof updates.country === "string" ? updates.country : target.country;
      const nextCountryCode = normalizeCountryCode(nextCountry ?? undefined);
      const centroid = await resolvePostalCentroid(
        tx,
        nextCountryCode,
        normalizePostalCode(nextPostal ?? undefined),
      );
      updates.countryCode = nextCountryCode ?? null;
      updates.latitude = centroid?.latitude ?? null;
      updates.longitude = centroid?.longitude ?? null;
    }

    await tx.contact.update({
      where: { id: input.targetContactId },
      data: updates,
    });

    const sourceGroups = sources.flatMap((contact) =>
      contact.groups.map((group) => ({
        contactId: input.targetContactId,
        groupId: group.groupId,
      })),
    );
    if (sourceGroups.length) {
      await tx.contactGroup.createMany({
        data: sourceGroups,
        skipDuplicates: true,
      });
    }

    const targetGroupIds = new Set([
      ...target.groups.map((group) => group.groupId),
      ...sourceGroups.map((group) => group.groupId),
    ]);
    await tx.contact.update({
      where: { id: input.targetContactId },
      data: { groupId: Array.from(targetGroupIds)[0] ?? null },
    });

    const sourceOrganizations = sources.flatMap((contact) =>
      contact.organizations.map((entry) => ({
        contactId: input.targetContactId,
        organizationId: entry.organizationId,
      })),
    );
    if (sourceOrganizations.length) {
      await tx.contactOrganization.createMany({
        data: sourceOrganizations,
        skipDuplicates: true,
      });
    }

    const sourceListMembers = await tx.contactListMember.findMany({
      where: { contactId: { in: sourceContactIds } },
      select: { listId: true },
    });
    if (sourceListMembers.length) {
      await tx.contactListMember.createMany({
        data: sourceListMembers.map((entry) => ({
          listId: entry.listId,
          contactId: input.targetContactId,
        })),
        skipDuplicates: true,
      });
    }

    await tx.file.updateMany({
      where: { contactId: { in: sourceContactIds } },
      data: { contactId: input.targetContactId },
    });
    await tx.contactEngagement.updateMany({
      where: { contactId: { in: sourceContactIds } },
      data: { contactId: input.targetContactId },
    });
    await tx.inboundEmailMessage.updateMany({
      where: { contactId: { in: sourceContactIds } },
      data: { contactId: input.targetContactId },
    });
    await tx.emailRecipient.updateMany({
      where: { contactId: { in: sourceContactIds } },
      data: { contactId: input.targetContactId },
    });
    await tx.eventRegistration.updateMany({
      where: { contactId: { in: sourceContactIds } },
      data: { contactId: input.targetContactId },
    });
    await tx.organization.updateMany({
      where: { contactPersonId: { in: sourceContactIds } },
      data: { contactPersonId: input.targetContactId },
    });

    const eventContacts = await tx.eventContact.findMany({
      where: { contactId: { in: sourceContactIds } },
      include: { roles: true },
    });
    for (const eventContact of eventContacts) {
      await tx.eventContact.createMany({
        data: [
          {
            eventId: eventContact.eventId,
            contactId: input.targetContactId,
          },
        ],
        skipDuplicates: true,
      });
      if (eventContact.roles.length) {
        await tx.eventContactRole.createMany({
          data: eventContact.roles.map((role) => ({
            eventId: role.eventId,
            contactId: input.targetContactId,
            eventRoleId: role.eventRoleId,
          })),
          skipDuplicates: true,
        });
      }
    }

    const targetAttributeKeys = new Set(target.attributes.map((attr) => attr.key));
    for (const source of sources) {
      for (const attribute of source.attributes) {
        if (targetAttributeKeys.has(attribute.key)) {
          continue;
        }
        targetAttributeKeys.add(attribute.key);
        await tx.contactAttribute.create({
          data: {
            contactId: input.targetContactId,
            key: attribute.key,
            type: attribute.type,
            stringValue: attribute.stringValue,
            numberValue: attribute.numberValue,
            dateValue: attribute.dateValue,
            locationLabel: attribute.locationLabel,
            latitude: attribute.latitude,
            longitude: attribute.longitude,
          },
        });
      }
    }

    const targetSocialPlatforms = new Set(
      target.socialLinks.map((link) => link.platform),
    );
    for (const source of sources) {
      for (const link of source.socialLinks) {
        if (targetSocialPlatforms.has(link.platform)) {
          continue;
        }
        targetSocialPlatforms.add(link.platform);
        await tx.contactSocialLink.create({
          data: {
            contactId: input.targetContactId,
            platform: link.platform,
            handle: link.handle,
          },
        });
      }
    }

    const accessReviews = await tx.contactAccessReview.findMany({
      where: { contactId: { in: sourceContactIds } },
      select: { id: true },
    });
    for (const review of accessReviews) {
      try {
        await tx.contactAccessReview.update({
          where: { id: review.id },
          data: { contactId: input.targetContactId },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          await tx.contactAccessReview.delete({ where: { id: review.id } });
          continue;
        }
        throw error;
      }
    }

    await tx.contactChangeLog.updateMany({
      where: { contactId: { in: sourceContactIds } },
      data: { contactId: input.targetContactId },
    });

    await createChangeLog(
      {
        contactId: input.targetContactId,
        action: ChangeAction.UPDATED,
        fieldName: "merge",
        userId,
        userName,
        metadata: JSON.parse(
          JSON.stringify({
            sourceContactIds,
            primaryEmail: normalizeContactEmail(input.primaryEmail) ?? null,
            preservedEmails,
            fieldSelections: input.fieldSelections ?? {},
          }),
        ) as Prisma.JsonObject,
      },
      tx,
    );

    await tx.contact.deleteMany({
      where: { id: { in: sourceContactIds } },
    });

    const merged = await tx.contact.findUniqueOrThrow({
      where: { id: input.targetContactId },
      include: contactInclude,
    });

    return mapContact(merged);
  });
};

const deleteContacts = async (teamId: string, ids: string[]) => {
  if (!ids.length) {
    return;
  }

  await prisma.contact.deleteMany({
    where: {
      id: { in: ids },
      teamId,
    },
  });
};

const getTeamContactAttributeKeys = async (
  teamId: string,
  userId?: string,
  roles: Roles[] = [],
) => {
  const contacts = await getTeamContacts(
    teamId,
    undefined,
    userId,
    undefined,
    roles,
  );

  const keys = new Set<string>();

  contacts.forEach((contact) => {
    contact.profileAttributes?.forEach((attribute) => {
      const key = attribute?.key?.trim();
      if (key) {
        keys.add(key);
      }
    });
  });

  return Array.from(keys).sort((a, b) => a.localeCompare(b));
};

const exportContacts = async (
  teamId: string,
  userId?: string,
  roles: Roles[] = [],
  options: { contactIds?: string[]; fields: string[]; attributes: string[] } = {
    contactIds: [],
    fields: [],
    attributes: [],
  },
) => {
  let contacts: ContactType[] = [];

  if (options.contactIds && options.contactIds.length > 0) {
    contacts = await getTeamContacts(
      teamId,
      undefined,
      userId,
      [{ type: "contactIds", contactIds: options.contactIds }],
      roles,
    );
  } else {
    contacts = await getTeamContacts(
      teamId,
      undefined,
      userId,
      undefined,
      roles,
    );
  }

  const { fields, attributes } = options;
  const headers = [...fields, ...attributes];

  const rows = contacts.map((contact) => {
    return headers.map((header) => {
      if (fields.includes(header)) {
        const val = contact[header as keyof typeof contact];
        if (val instanceof Date) {
          return val.toISOString();
        }
        return val ? String(val) : "";
      } else {
        const attr = contact.profileAttributes?.find((a) => a.key === header);
        if (!attr) return "";
        if (attr.type === "LOCATION") {
          const locationVal = attr.value as {
            label?: string;
            latitude?: number;
            longitude?: number;
          };
          return (
            locationVal.label ??
            `${locationVal.latitude},${locationVal.longitude}`
          );
        }
        return String(attr.value);
      }
    });
  });

  return stringifyCsv(headers, rows);
};

export {
  createContact,
  deleteContactFile,
  deleteContacts,
  getAllowedContactSubmodules,
  getContactById,
  getTeamContactAttributeKeys,
  getTeamContacts,
  importContactsFromCsv,
  importContactsFromVCard,
  mergeContacts,
  previewContactMerge,
  updateContact,
  exportContacts,
  findContactByIdentityEmail,
};
