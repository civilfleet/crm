import {
  CONTACT_SUBMODULE_FIELDS,
  CONTACT_SUBMODULES,
  type ContactSubmodule,
} from "@/constants/contact-submodules";
import prisma from "@/lib/prisma";
import { Roles } from "@/types";

export const getAllowedContactSubmodules = async (
  teamId: string,
  userId?: string,
  roles: Roles[] = [],
) => {
  if (!userId) return [] as ContactSubmodule[];
  if (roles.includes(Roles.Admin)) {
    return [...CONTACT_SUBMODULES] as ContactSubmodule[];
  }

  const [accessEntries, userGroups] = await Promise.all([
    prisma.contactFieldAccess.findMany({
      where: { teamId },
      select: { fieldKey: true, groupId: true },
    }),
    prisma.userGroup.findMany({
      where: { userId, group: { teamId } },
      select: { groupId: true },
    }),
  ]);
  const accessMap = new Map<string, Set<string>>();
  for (const entry of accessEntries) {
    const groups = accessMap.get(entry.fieldKey) ?? new Set<string>();
    groups.add(entry.groupId);
    accessMap.set(entry.fieldKey, groups);
  }
  const userGroupIds = new Set(userGroups.map(({ groupId }) => groupId));

  return CONTACT_SUBMODULES.filter((submodule) =>
    CONTACT_SUBMODULE_FIELDS[submodule].some((fieldKey) => {
      const allowedGroups = accessMap.get(fieldKey);
      return (
        !allowedGroups?.size ||
        [...userGroupIds].some((groupId) => allowedGroups.has(groupId))
      );
    }),
  ) as ContactSubmodule[];
};
