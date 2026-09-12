import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import { getContactVisibility } from "@/services/contacts/access";
import {
  getContactFieldAccessMap,
  isFieldVisible,
} from "@/services/contacts/field-access";
import type { Roles } from "@/types";
import prisma from "@/lib/prisma";
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
  createdAt: log.createdAt,
});

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

  return logs
    .filter((log) => {
      const key = log.fieldName?.replace(/^profileAttribute\./, "");
      return !key || !hiddenKeys.includes(key);
    })
    .map((log) => {
      const mapped = mapChangeLog(log);
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

export {
  createChangeLog,
  getContactChangeLogs,
  logContactCreation,
  logFieldUpdate,
};
