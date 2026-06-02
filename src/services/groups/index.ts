import type { Prisma } from "@prisma/client";
import {
  CONTACT_SUBMODULE_FIELDS,
  type ContactSubmodule,
} from "@/constants/contact-submodules";
import prisma from "@/lib/prisma";
import {
  APP_MODULES,
  type AppModule,
  DEFAULT_TEAM_MODULES,
  type Group,
} from "@/types";

type CreateGroupInput = {
  teamId: string;
  name: string;
  description?: string;
  canAccessAllContacts?: boolean;
  userIds?: string[]; // Optional initial users
  modules?: AppModule[];
  contactSubmodules?: ContactSubmodule[];
};

type UpdateGroupInput = {
  id: string;
  teamId: string;
  name?: string;
  description?: string;
  canAccessAllContacts?: boolean;
  modules?: AppModule[];
  contactSubmodules?: ContactSubmodule[];
};

type AddUsersToGroupInput = {
  groupId: string;
  teamId: string;
  userIds: string[];
};

type RemoveUsersFromGroupInput = {
  groupId: string;
  teamId: string;
  userIds: string[];
};

type GroupWithDefaults = Prisma.GroupGetPayload<{
  include: {
    modulePermissions: true;
  };
}>;

const DEFAULT_GROUP_NAME = "Default Access";
const ADMIN_GROUP_NAME = "Admin";

const getAdminGroupModules = (teamModules: AppModule[]): AppModule[] =>
  Array.from(new Set<AppModule>(["ADMIN", ...teamModules]));

const syncGroupModules = async (
  groupId: string,
  modules: AppModule[],
  client: Prisma.TransactionClient | typeof prisma = prisma,
) => {
  await client.groupModulePermission.deleteMany({
    where: {
      groupId,
      module: {
        notIn: modules,
      },
    },
  });

  await client.groupModulePermission.createMany({
    data: modules.map((module) => ({
      groupId,
      module,
    })),
    skipDuplicates: true,
  });
};

const ensureAdminGroup = async (
  teamId: string,
  teamModules: AppModule[],
  client: Prisma.TransactionClient | typeof prisma = prisma,
) => {
  const adminModules = getAdminGroupModules(teamModules);
  let adminGroup = await client.group.findFirst({
    where: {
      teamId,
      name: ADMIN_GROUP_NAME,
    },
    include: {
      modulePermissions: true,
    },
  });

  if (!adminGroup) {
    adminGroup = await client.group.create({
      data: {
        teamId,
        name: ADMIN_GROUP_NAME,
        description: "Team administrators",
        canAccessAllContacts: true,
        modulePermissions: {
          create: adminModules.map((module) => ({ module })),
        },
      },
      include: {
        modulePermissions: true,
      },
    });
  }

  if (!adminGroup.canAccessAllContacts) {
    adminGroup = await client.group.update({
      where: { id: adminGroup.id },
      data: { canAccessAllContacts: true },
      include: {
        modulePermissions: true,
      },
    });
  }

  await syncGroupModules(adminGroup.id, adminModules, client);

  const team = await client.teams.findUnique({
    where: { id: teamId },
    select: { ownerId: true },
  });

  if (team?.ownerId) {
    await client.userGroup.createMany({
      data: [
        {
          groupId: adminGroup.id,
          userId: team.ownerId,
        },
      ],
      skipDuplicates: true,
    });
  }

  return client.group.findUniqueOrThrow({
    where: { id: adminGroup.id },
    include: {
      modulePermissions: true,
    },
  });
};

const resolveTeamModules = (modules?: AppModule[] | null) =>
  modules && modules.length > 0 ? modules : [...DEFAULT_TEAM_MODULES];

const getTeamModules = async (
  teamId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) => {
  const team = await client.teams.findUnique({
    where: { id: teamId },
    select: { modules: true },
  });

  return resolveTeamModules(team?.modules ?? null);
};

const ensureDefaultGroup = async (
  teamId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) => {
  const teamModules = await getTeamModules(teamId, client);
  let defaultGroup = await client.group.findFirst({
    where: {
      teamId,
      isDefaultGroup: true,
    },
    include: {
      modulePermissions: true,
    },
  });

  if (!defaultGroup) {
    const existing = await client.group.findFirst({
      where: {
        teamId,
        name: DEFAULT_GROUP_NAME,
      },
      include: {
        modulePermissions: true,
      },
    });

    if (existing) {
      defaultGroup = await client.group.update({
        where: { id: existing.id },
        data: { isDefaultGroup: true, canAccessAllContacts: true },
        include: {
          modulePermissions: true,
        },
      });
    } else {
      defaultGroup = await client.group.create({
        data: {
          teamId,
          name: DEFAULT_GROUP_NAME,
          description: "Default access group",
          isDefaultGroup: true,
          canAccessAllContacts: true,
          modulePermissions: {
            create: teamModules.map((module) => ({ module })),
          },
        },
        include: {
          modulePermissions: true,
        },
      });
    }
  }

  if (!defaultGroup) {
    throw new Error("Default group could not be ensured");
  }

  let ensuredDefaultGroup: GroupWithDefaults = defaultGroup;

  if (!ensuredDefaultGroup.canAccessAllContacts) {
    await client.group.update({
      where: { id: ensuredDefaultGroup.id },
      data: { canAccessAllContacts: true },
    });

    ensuredDefaultGroup = await client.group.findUniqueOrThrow({
      where: { id: ensuredDefaultGroup.id },
      include: {
        modulePermissions: true,
      },
    });
  }

  if (!ensuredDefaultGroup.modulePermissions.length) {
    await client.groupModulePermission.createMany({
      data: teamModules.map((module) => ({
        groupId: ensuredDefaultGroup.id,
        module,
      })),
      skipDuplicates: true,
    });

    ensuredDefaultGroup = await client.group.findUniqueOrThrow({
      where: { id: ensuredDefaultGroup.id },
      include: {
        modulePermissions: true,
      },
    });
  }

  await ensureAdminGroup(teamId, teamModules, client);

  const teamUsers = await client.teams.findUnique({
    where: { id: teamId },
    select: {
      users: {
        select: {
          id: true,
        },
      },
    },
  });

  if (teamUsers?.users?.length) {
    const teamUserIds = teamUsers.users.map((user) => user.id);

    const usersWithOtherGroups = await client.userGroup.findMany({
      where: {
        userId: { in: teamUserIds },
        group: {
          teamId,
          isDefaultGroup: false,
        },
      },
      select: {
        userId: true,
      },
      distinct: ["userId"],
    });

    const userIdsWithOtherGroups = new Set(
      usersWithOtherGroups.map((entry) => entry.userId),
    );

    const userIdsNeedingDefault = teamUserIds.filter(
      (userId) => !userIdsWithOtherGroups.has(userId),
    );

    if (userIdsNeedingDefault.length) {
      await client.userGroup.createMany({
        data: userIdsNeedingDefault.map((userId) => ({
          groupId: ensuredDefaultGroup.id,
          userId,
        })),
        skipDuplicates: true,
      });
    }

    if (userIdsWithOtherGroups.size) {
      await client.userGroup.deleteMany({
        where: {
          groupId: ensuredDefaultGroup.id,
          userId: { in: Array.from(userIdsWithOtherGroups) },
        },
      });
    }
  }

  return ensuredDefaultGroup;
};

const mapGroup = (group: GroupWithDefaults): Group => ({
  id: group.id,
  teamId: group.teamId,
  name: group.name,
  description: group.description ?? undefined,
  canAccessAllContacts: group.canAccessAllContacts,
  isDefaultGroup: group.isDefaultGroup,
  modules: group.modulePermissions.length
    ? group.modulePermissions.map(
        (permission) => permission.module as AppModule,
      )
    : [...DEFAULT_TEAM_MODULES],
  createdAt: group.createdAt,
  updatedAt: group.updatedAt,
});

const getSubmoduleFieldKeys = (submodules: ContactSubmodule[]) => {
  const keys = new Set<string>();
  submodules.forEach((submodule) => {
    CONTACT_SUBMODULE_FIELDS[submodule].forEach((fieldKey) => {
      keys.add(fieldKey);
    });
  });
  return Array.from(keys);
};

const getAllSubmoduleFieldKeys = () =>
  Array.from(new Set(Object.values(CONTACT_SUBMODULE_FIELDS).flat()));

const computeGroupSubmodules = (fieldKeys: Set<string>): ContactSubmodule[] =>
  (Object.keys(CONTACT_SUBMODULE_FIELDS) as ContactSubmodule[]).filter(
    (submodule) => {
      const requiredKeys = CONTACT_SUBMODULE_FIELDS[submodule];
      if (!requiredKeys.length) {
        return false;
      }
      return requiredKeys.every((key) => fieldKeys.has(key));
    },
  );

const syncContactFieldAccess = async (
  client: Prisma.TransactionClient,
  teamId: string,
  groupId: string,
  submodules?: ContactSubmodule[],
) => {
  if (!submodules) {
    return;
  }

  const allSubmoduleKeys = getAllSubmoduleFieldKeys();
  const selectedKeys = getSubmoduleFieldKeys(submodules);

  if (allSubmoduleKeys.length) {
    await client.contactFieldAccess.deleteMany({
      where: {
        teamId,
        groupId,
        fieldKey: { in: allSubmoduleKeys },
      },
    });
  }

  if (selectedKeys.length) {
    await client.contactFieldAccess.createMany({
      data: selectedKeys.map((fieldKey) => ({
        teamId,
        groupId,
        fieldKey,
      })),
      skipDuplicates: true,
    });
  }
};

const getTeamGroups = async (teamId: string) => {
  await ensureDefaultGroup(teamId);

  const [groups, accessEntries] = await Promise.all([
    prisma.group.findMany({
      where: {
        teamId,
      },
      orderBy: {
        name: "asc",
      },
      include: {
        modulePermissions: true,
        users: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    }),
    prisma.contactFieldAccess.findMany({
      where: { teamId },
      select: {
        groupId: true,
        fieldKey: true,
      },
    }),
  ]);

  const accessByGroup = new Map<string, Set<string>>();
  accessEntries.forEach((entry) => {
    const existing = accessByGroup.get(entry.groupId);
    if (existing) {
      existing.add(entry.fieldKey);
      return;
    }
    accessByGroup.set(entry.groupId, new Set([entry.fieldKey]));
  });

  return groups.map((group) => {
    const fieldKeys = accessByGroup.get(group.id) ?? new Set<string>();
    const contactSubmodules = computeGroupSubmodules(fieldKeys);

    return {
      ...mapGroup(group),
      contactSubmodules,
      users: group.users.map((ug) => ({
        userId: ug.userId,
        user: {
          id: ug.user.id,
          name: ug.user.name,
          email: ug.user.email,
        },
      })),
    };
  });
};

const getGroupById = async (groupId: string, teamId: string) => {
  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      teamId,
    },
    include: {
      modulePermissions: true,
    },
  });

  if (!group) {
    return null;
  }

  const accessEntries = await prisma.contactFieldAccess.findMany({
    where: { teamId, groupId },
    select: { fieldKey: true },
  });
  const fieldKeys = new Set(accessEntries.map((entry) => entry.fieldKey));

  return {
    ...mapGroup(group),
    contactSubmodules: computeGroupSubmodules(fieldKeys),
  };
};

const getGroupWithUsers = async (groupId: string, teamId: string) => {
  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      teamId,
    },
    include: {
      users: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      modulePermissions: true,
    },
  });

  if (!group) {
    return null;
  }

  const accessEntries = await prisma.contactFieldAccess.findMany({
    where: { teamId, groupId },
    select: { fieldKey: true },
  });
  const fieldKeys = new Set(accessEntries.map((entry) => entry.fieldKey));

  return {
    ...mapGroup(group),
    contactSubmodules: computeGroupSubmodules(fieldKeys),
    users: group.users.map((ug) => ({
      id: ug.user.id,
      name: ug.user.name,
      email: ug.user.email,
    })),
  };
};

const createGroup = async (input: CreateGroupInput) => {
  const {
    teamId,
    name,
    description,
    canAccessAllContacts,
    userIds,
    modules,
    contactSubmodules,
  } = input;

  const teamModules = await getTeamModules(teamId);
  const allowedModules = new Set<AppModule>([...teamModules, "ADMIN"]);
  const baseModules = modules?.length ? modules : [...teamModules];
  const modulesToAssign: AppModule[] = Array.from(
    new Set(
      baseModules.filter(
        (module): module is AppModule =>
          APP_MODULES.includes(module) && allowedModules.has(module),
      ),
    ),
  );

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.group.create({
      data: {
        teamId,
        name,
        description,
        canAccessAllContacts: canAccessAllContacts ?? false,
        modulePermissions: {
          create: modulesToAssign.map((module) => ({ module })),
        },
        users:
          userIds && userIds.length > 0
            ? {
                create: userIds.map((userId) => ({
                  userId,
                })),
              }
            : undefined,
      },
      include: {
        modulePermissions: true,
      },
    });

    await syncContactFieldAccess(tx, teamId, created.id, contactSubmodules);

    await ensureDefaultGroup(teamId, tx);

    return created;
  });

  return mapGroup(group);
};

const updateGroup = async (input: UpdateGroupInput) => {
  const {
    id,
    teamId,
    name,
    description,
    canAccessAllContacts,
    modules,
    contactSubmodules,
  } = input;

  const result = await prisma.$transaction(async (tx) => {
    const existingGroup = await tx.group.findFirst({
      where: {
        id,
        teamId,
      },
      select: {
        name: true,
      },
    });

    if (!existingGroup) {
      throw new Error("Group not found");
    }

    const isAdminGroup = existingGroup.name === ADMIN_GROUP_NAME;

    await tx.group.update({
      where: {
        id,
        teamId,
      },
      data: {
        name: isAdminGroup ? undefined : name,
        description,
        canAccessAllContacts: isAdminGroup ? true : canAccessAllContacts,
      },
    });

    if (modules !== undefined || isAdminGroup) {
      const teamModules = await getTeamModules(teamId, tx);
      const allowedModules = new Set<AppModule>([...teamModules, "ADMIN"]);
      const requestedModules = modules ?? [];
      const modulesToAssign: AppModule[] = isAdminGroup
        ? getAdminGroupModules(teamModules)
        : Array.from(
            new Set(
              (requestedModules.length ? requestedModules : [...teamModules]).filter(
                (module): module is AppModule =>
                  APP_MODULES.includes(module) && allowedModules.has(module),
              ),
            ),
          );

      await tx.groupModulePermission.deleteMany({
        where: { groupId: id },
      });

      if (modulesToAssign.length) {
        await tx.groupModulePermission.createMany({
          data: modulesToAssign.map((module) => ({
            groupId: id,
            module,
          })),
        });
      }
    }

    await syncContactFieldAccess(tx, teamId, id, contactSubmodules);

    await ensureDefaultGroup(teamId, tx);

    const updated = await tx.group.findUniqueOrThrow({
      where: { id },
      include: {
        modulePermissions: true,
      },
    });

    return updated;
  });

  return mapGroup(result);
};

const deleteGroups = async (teamId: string, ids: string[]) => {
  if (!ids.length) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const defaultGroup = await ensureDefaultGroup(teamId, tx);
    const adminGroup = await tx.group.findFirst({
      where: {
        teamId,
        name: ADMIN_GROUP_NAME,
      },
      select: {
        id: true,
      },
    });

    if (ids.includes(defaultGroup.id)) {
      throw new Error("Default group cannot be deleted");
    }

    if (adminGroup && ids.includes(adminGroup.id)) {
      throw new Error("Admin group cannot be deleted");
    }

    await tx.group.deleteMany({
      where: {
        id: { in: ids },
        teamId,
      },
    });

    await ensureDefaultGroup(teamId, tx);
  });
};

const addUsersToGroup = async (input: AddUsersToGroupInput) => {
  const { groupId, teamId, userIds } = input;

  // Verify group belongs to team
  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      teamId,
    },
  });

  if (!group) {
    throw new Error("Group not found");
  }

  if (group.isDefaultGroup) {
    throw new Error("Cannot manually assign users to the default group");
  }

  // Get existing user-group relationships
  const existing = await prisma.userGroup.findMany({
    where: {
      groupId,
      userId: { in: userIds },
    },
    select: { userId: true },
  });

  const existingUserIds = new Set(existing.map((ug) => ug.userId));
  const newUserIds = userIds.filter((id) => !existingUserIds.has(id));

  if (newUserIds.length > 0) {
    await prisma.userGroup.createMany({
      data: newUserIds.map((userId) => ({
        groupId,
        userId,
      })),
    });
  }

  await ensureDefaultGroup(teamId);
};

const removeUsersFromGroup = async (input: RemoveUsersFromGroupInput) => {
  const { groupId, teamId, userIds } = input;

  // Verify group belongs to team
  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      teamId,
    },
  });

  if (!group) {
    throw new Error("Group not found");
  }

  if (group.isDefaultGroup) {
    throw new Error("Cannot manually remove users from the default group");
  }

  await prisma.userGroup.deleteMany({
    where: {
      groupId,
      userId: { in: userIds },
    },
  });

  await ensureDefaultGroup(teamId);
};

const getUserGroups = async (userId: string, teamId: string) => {
  const userGroups = await prisma.userGroup.findMany({
    where: {
      userId,
      group: {
        teamId,
      },
    },
    include: {
      group: {
        include: {
          modulePermissions: true,
        },
      },
    },
  });

  return userGroups.map((ug) => mapGroup(ug.group));
};

const getUserModuleAccess = async (
  userId: string,
  teamId: string,
): Promise<AppModule[]> => {
  const team = await prisma.teams.findUnique({
    where: { id: teamId },
    select: { ownerId: true, modules: true },
  });
  const teamModules = resolveTeamModules(team?.modules ?? null);
  const allowedModules = new Set<AppModule>([...teamModules, "ADMIN"]);

  const groups = await getUserGroups(userId, teamId);

  if (!groups.length) {
    const defaultGroup = await ensureDefaultGroup(teamId);
    const baseModules =
      defaultGroup.modulePermissions.length > 0
        ? defaultGroup.modulePermissions.map(
            (permission) => permission.module as AppModule,
          )
        : [...teamModules];
    const cappedBaseModules = baseModules.filter((module) =>
      teamModules.includes(module),
    );

    if (team?.ownerId === userId) {
      return Array.from(new Set<AppModule>([...cappedBaseModules, "ADMIN"]));
    }

    return cappedBaseModules;
  }

  const modules = new Set<AppModule>();

  for (const group of groups) {
    for (const moduleName of group.modules) {
      if (allowedModules.has(moduleName)) {
        modules.add(moduleName);
      }
    }
  }

  if (team?.ownerId === userId) {
    modules.add("ADMIN");
  }

  return modules.size ? Array.from(modules) : [...teamModules];
};

export {
  addUsersToGroup,
  createGroup,
  deleteGroups,
  ensureDefaultGroup,
  getGroupById,
  getGroupWithUsers,
  getTeamGroups,
  getUserGroups,
  getUserModuleAccess,
  mapGroup,
  removeUsersFromGroup,
  updateGroup,
};
