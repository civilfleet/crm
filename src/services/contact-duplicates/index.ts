import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getContactVisibility } from "@/services/contacts/access";
import { ChangeAction, type Roles } from "@/types";

/*
  Possible duplicates noted when a website form or event registration made a
  new contact: an existing contact had the same phone number. Intake matches
  people by e-mail only, so this is left to a person: merge the two, or
  dismiss the note. The note lives in the new contact's creation entry
  (metadata.possibleDuplicates); dismissing it is a history entry too.
*/

type Viewer = { userId?: string; userName?: string; roles?: Roles[] };

export type DuplicateHint = {
  contact: { id: string; name: string };
  reason: "phone";
};

const DISMISSED_FIELD = "possibleDuplicate";

const metadataOf = (metadata: Prisma.JsonValue | null) =>
  metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};

/** The contact's open notes, for contacts the user may see. */
export const getDuplicateHints = async (
  teamId: string,
  contactId: string,
  viewer: Viewer,
): Promise<DuplicateHint[]> => {
  const visibility = await getContactVisibility({
    teamId,
    userId: viewer.userId,
    roles: viewer.roles,
  });
  const logs = await prisma.contactChangeLog.findMany({
    where: {
      contactId,
      contact: visibility.where,
      OR: [
        { action: ChangeAction.CREATED },
        { action: ChangeAction.UPDATED, fieldName: DISMISSED_FIELD },
      ],
    },
    select: { action: true, metadata: true, newValue: true },
  });
  const dismissed = new Set(
    logs
      .filter((log) => log.action === ChangeAction.UPDATED)
      .map((log) => metadataOf(log.metadata).duplicateOfId),
  );
  const noted = logs.flatMap((log) => {
    if (log.action !== ChangeAction.CREATED) return [];
    const list = metadataOf(log.metadata).possibleDuplicates;
    return Array.isArray(list)
      ? list.flatMap((entry) =>
          entry &&
          typeof entry === "object" &&
          typeof (entry as { contactId?: unknown }).contactId === "string"
            ? [(entry as { contactId: string }).contactId]
            : [],
        )
      : [];
  });
  const open = [...new Set(noted)].filter(
    (id) => id !== contactId && !dismissed.has(id),
  );
  if (!open.length) return [];
  // Only contacts that still exist (not merged away) and the user may see.
  const others = await prisma.contact.findMany({
    where: { AND: [{ id: { in: open } }, visibility.where] },
    select: { id: true, name: true },
  });
  return others.map((other) => ({ contact: other, reason: "phone" }));
};

/** Records that a person looked and the two are different people. */
export const dismissDuplicateHint = async (
  teamId: string,
  contactId: string,
  duplicateOfId: string,
  viewer: Viewer,
) => {
  const visibility = await getContactVisibility({
    teamId,
    userId: viewer.userId,
    roles: viewer.roles,
  });
  const contact = await prisma.contact.findFirst({
    where: { AND: [{ id: contactId }, visibility.where] },
    select: { id: true },
  });
  if (!contact) return null;
  return prisma.contactChangeLog.create({
    data: {
      contactId,
      action: ChangeAction.UPDATED,
      fieldName: DISMISSED_FIELD,
      oldValue: JSON.stringify(duplicateOfId),
      newValue: JSON.stringify("dismissed"),
      metadata: { duplicateOfId },
      userId: viewer.userId,
      userName: viewer.userName,
    },
  });
};
