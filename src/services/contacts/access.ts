import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { Roles } from "@/types";

export type ContactVisibility = {
  where: Prisma.ContactWhereInput;
  userGroupIds: string[];
};

export const getContactVisibility = async ({
  teamId,
  userId,
  roles = [],
}: {
  teamId: string;
  userId?: string;
  roles?: Roles[];
}): Promise<ContactVisibility> => {
  const userGroups = userId
    ? await prisma.userGroup.findMany({
        where: { userId, group: { teamId } },
        include: { group: { select: { canAccessAllContacts: true } } },
      })
    : [];
  const userGroupIds = userGroups.map(({ groupId }) => groupId);

  if (
    roles.includes(Roles.Admin) ||
    userGroups.some(({ group }) => group.canAccessAllContacts)
  ) {
    return { where: { teamId }, userGroupIds };
  }

  return {
    where: {
      teamId,
      OR: [
        { groups: { none: {} } },
        ...(userGroupIds.length
          ? [{ groups: { some: { groupId: { in: userGroupIds } } } }]
          : []),
      ],
    },
    userGroupIds,
  };
};
