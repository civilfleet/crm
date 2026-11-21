import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import { getContactVisibility } from "@/services/contacts/access";
import {
  getContactFieldAccessMap,
  isFieldVisible,
} from "@/services/contacts/field-access";
import type { Roles } from "@/types";
import { ChangeAction, type ContactChangeLog } from "@/types";

type ChangeLogMetadata = Prisma.JsonObject;

type CreateChangeLogInput = {
  contactId: string;
  action: ChangeAction;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  userId?: string;
  userName?: string;
  metadata?: ChangeLogMetadata;
  proposalId?: string;
};

type ContactChangeLogWithDefaults = Prisma.ContactChangeLogGetPayload<
  Record<string, never>
>;

const normalizeMetadata = (
  metadata: Prisma.JsonValue | null,
): Record<string, unknown> | undefined => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }
  return metadata as Record<string, unknown>;
};

const mapChangeLog = (log: ContactChangeLogWithDefaults): ContactChangeLog => ({
  id: log.id,
  contactId: log.contactId,
  action: log.action as ChangeAction,
  fieldName: log.fieldName ?? undefined,
  oldValue: log.oldValue ?? undefined,
  newValue: log.newValue ?? undefined,
  userId: log.userId ?? undefined,
  userName: log.userName ?? undefined,
  metadata: normalizeMetadata(log.metadata),
  proposalId: log.proposalId ?? undefined,
  createdAt: log.createdAt,
});

/** Fields whose values are group or organization ids. */
const ID_FIELDS = new Set(["groupIds", "groupId", "organizationIds"]);

const idsIn = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    const items = Array.isArray(value) ? value : [value];
    return items.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
};

/**
 * Names for the group and organization ids in these entries, so the history
 * shows "Crew" instead of an id. Ids from another team stay unnamed.
 */
const getValueLabels = async (
  logs: {
    fieldName: string | null;
    oldValue: string | null;
    newValue: string | null;
  }[],
  teamId: string,
) => {
  const groupIds = new Set<string>();
  const organizationIds = new Set<string>();
  for (const log of logs) {
    if (!log.fieldName || !ID_FIELDS.has(log.fieldName)) continue;
    const target =
      log.fieldName === "organizationIds" ? organizationIds : groupIds;
    for (const id of [...idsIn(log.oldValue), ...idsIn(log.newValue)])
      target.add(id);
  }
  const [groups, organizations] = await Promise.all([
    groupIds.size
      ? prisma.group.findMany({
          where: { teamId, id: { in: [...groupIds] } },
          select: { id: true, name: true },
        })
      : [],
    organizationIds.size
      ? prisma.organization.findMany({
          where: { teamId, id: { in: [...organizationIds] } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  return new Map<string, string>([
    ...groups.map((group): [string, string] => [group.id, group.name]),
    ...organizations.flatMap((organization): [string, string][] =>
      organization.name ? [[organization.id, organization.name]] : [],
    ),
  ]);
};

const getContactChangeLogs = async (
  contactId: string,
  teamId: string,
  userId: string,
  roles: Roles[] = [],
) => {
  const visibility = await getContactVisibility({ teamId, userId, roles });
  const contact = await prisma.contact.findFirst({
    where: { AND: [{ id: contactId }, visibility.where] },
    select: { id: true },
  });
  if (!contact) throw new ApiError(404, "Contact not found");
  const accessMap = await getContactFieldAccessMap(teamId);
  const hiddenKeys = Array.from(accessMap.keys()).filter(
    (key) => !isFieldVisible(key, accessMap, visibility.userGroupIds),
  );
  const logs = await prisma.contactChangeLog.findMany({
    where: {
      contactId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const visibleLogs = logs.filter((log) => {
    const key = log.fieldName?.replace(/^profileAttribute\./, "");
    return !key || !hiddenKeys.includes(key);
  });
  const labels = await getValueLabels(visibleLogs, teamId);

  return visibleLogs.map((log) => {
    const ids = ID_FIELDS.has(log.fieldName ?? "")
      ? [...idsIn(log.oldValue), ...idsIn(log.newValue)]
      : [];
    const mapped: ContactChangeLog = {
      ...mapChangeLog(log),
      ...(ids.length
        ? {
            valueLabels: Object.fromEntries(
              ids.flatMap((id) => {
                const name = labels.get(id);
                return name ? [[id, name]] : [];
              }),
            ),
          }
        : {}),
    };
    if (!hiddenKeys.length) return mapped;
    // Aggregate history can contain snapshots of fields now hidden from this user.
    return {
      ...mapped,
      metadata: undefined,
      ...(!log.fieldName ||
      ["merge", "profileAttributes"].includes(log.fieldName)
        ? { oldValue: undefined, newValue: undefined }
        : {}),
    };
  });
};

const createChangeLog = async (
  input: CreateChangeLogInput,
  tx?: Prisma.TransactionClient,
) => {
  const log = await (tx ?? prisma).contactChangeLog.create({
    data: {
      contactId: input.contactId,
      action: input.action,
      fieldName: input.fieldName,
      oldValue: input.oldValue,
      newValue: input.newValue,
      userId: input.userId,
      userName: input.userName,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      ...(input.proposalId ? { proposalId: input.proposalId } : {}),
    },
  });

  return mapChangeLog(log);
};

// Helper function to log contact creation
const logContactCreation = async (
  contactId: string,
  userId?: string,
  userName?: string,
  tx?: Prisma.TransactionClient,
  metadata?: ChangeLogMetadata,
) => {
  return createChangeLog(
    {
      contactId,
      action: ChangeAction.CREATED,
      userId,
      userName,
      metadata,
    },
    tx,
  );
};

// Helper function to log field updates
const logFieldUpdate = async (
  contactId: string,
  fieldName: string,
  oldValue: unknown,
  newValue: unknown,
  userId?: string,
  userName?: string,
  tx?: Prisma.TransactionClient,
  metadata?: ChangeLogMetadata,
) => {
  // Convert values to strings for storage
  const oldStr =
    oldValue !== undefined && oldValue !== null
      ? JSON.stringify(oldValue)
      : undefined;
  const newStr =
    newValue !== undefined && newValue !== null
      ? JSON.stringify(newValue)
      : undefined;

  return createChangeLog(
    {
      contactId,
      action: ChangeAction.UPDATED,
      fieldName,
      oldValue: oldStr,
      newValue: newStr,
      userId,
      userName,
      metadata,
    },
    tx,
  );
};

/**
 * Record a change an intake wanted but must not apply (it would overwrite an
 * existing value). Skipped when the same change is already pending. Returns
 * whether a new proposal was recorded.
 */
/**
 * Records a value an intake wanted to change (PROPOSED), one per submission:
 * even the same value again is its own proposal, so whether it shows for
 * review depends only on its own submission (confirmed or not), and removing
 * an unconfirmed submission removes only its own. The review groups equal
 * proposals (src/services/contact-proposals).
 */
const proposeFieldChange = async (
  tx: Prisma.TransactionClient,
  input: {
    contactId: string;
    fieldName: string;
    oldValue: unknown;
    newValue: unknown;
    userName: string;
    metadata: ChangeLogMetadata;
  },
) => {
  await createChangeLog(
    {
      contactId: input.contactId,
      action: ChangeAction.PROPOSED,
      fieldName: input.fieldName,
      oldValue: JSON.stringify(input.oldValue),
      newValue: JSON.stringify(input.newValue),
      userName: input.userName,
      metadata: input.metadata,
    },
    tx,
  );
  return true;
};

/**
 * The entry that records how a contact was created, if any. Callers have
 * already checked access to the contact; the entry names no field, so field
 * visibility does not apply.
 */
const getContactCreationLog = async (
  contactId: string,
): Promise<ContactChangeLog | null> => {
  const log = await prisma.contactChangeLog.findFirst({
    where: { contactId, action: ChangeAction.CREATED },
    orderBy: { createdAt: "asc" },
  });
  return log ? mapChangeLog(log) : null;
};

export {
  createChangeLog,
  getContactChangeLogs,
  getContactCreationLog,
  logContactCreation,
  logFieldUpdate,
  proposeFieldChange,
};
