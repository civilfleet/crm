import prisma from "@/lib/prisma";

export const getContactFieldAccessMap = async (teamId: string) => {
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

export const isFieldVisible = (
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
