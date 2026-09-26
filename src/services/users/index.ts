import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ensureDefaultGroup } from "@/services/groups";
import { type AppModule, DEFAULT_TEAM_MODULES, type Roles } from "@/types";
import type { UpdateTeamUserInput } from "@/validations/users";

export interface User {
  name?: string;
  address?: string;
  email: string;
  phone?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  organizationId?: string;

  teamId?: string;
  roles: Roles[];
}

const resolveTeamModules = (modules?: AppModule[] | null): AppModule[] =>
  modules && modules.length > 0 ? modules : [...DEFAULT_TEAM_MODULES];

const getAdminUser = async (userId: string) => {
  const userPromise = prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      address: true,
      email: true,
      phone: true,
      postalCode: true,
      city: true,
      country: true,
      roles: true,
    },
  });
  const teamsPromise = prisma.teams.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      modules: true,
    },
  });
  const organizationsPromise = prisma.organization.findMany({
    where: {
      portalAccessEnabled: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  const [user, teams, organizations] = await Promise.all([
    userPromise,
    teamsPromise,
    organizationsPromise,
  ]);

  return {
    ...user,
    teams: teams.map((team) => ({
      ...team,
      modules: Array.from(
        new Set<AppModule>([...resolveTeamModules(team.modules), "ADMIN"]),
      ),
    })),
    organizations,
  };
};

const getUserCurrent = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      address: true,
      email: true,
      phone: true,
      postalCode: true,
      city: true,
      country: true,
      roles: true,
      organizations: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      teams: {
        select: {
          id: true,
          name: true,

          email: true,
          ownerId: true,
          modules: true,
        },
      },
    },
  });

  if (!user) {
    return user;
  }

  const teamIds = user.teams.map((team) => team.id);
  const teamModulesByTeam = new Map(
    user.teams.map((team) => [
      team.id,
      resolveTeamModules(team.modules ?? null),
    ]),
  );
  const modulesByTeam = new Map<string, Set<AppModule>>();
  let defaultGroups: Array<{
    teamId: string;
    modulePermissions: Array<{ module: string }>;
  }> = [];

  if (teamIds.length > 0) {
    await Promise.all(teamIds.map((id) => ensureDefaultGroup(id)));

    const [memberships, defaultGroupsResult] = await Promise.all([
      prisma.userGroup.findMany({
        where: {
          userId,
          group: {
            teamId: {
              in: teamIds,
            },
          },
        },
        include: {
          group: {
            select: {
              teamId: true,
              modulePermissions: true,
            },
          },
        },
      }),
      prisma.group.findMany({
        where: {
          teamId: {
            in: teamIds,
          },
          isDefaultGroup: true,
        },
        include: {
          modulePermissions: true,
        },
      }),
    ]);
    defaultGroups = defaultGroupsResult;

    for (const membership of memberships) {
      const teamId = membership.group.teamId;
      const teamModules: AppModule[] = teamModulesByTeam.get(teamId) ?? [
        ...DEFAULT_TEAM_MODULES,
      ];
      const allowedModules = new Set<AppModule>([...teamModules, "ADMIN"]);
      const set = modulesByTeam.get(teamId) ?? new Set<AppModule>();

      if (!membership.group.modulePermissions.length) {
        for (const module of teamModules) {
          set.add(module);
        }
      } else {
        for (const permission of membership.group.modulePermissions) {
          const moduleName = permission.module as AppModule;
          if (allowedModules.has(moduleName)) {
            set.add(moduleName);
          }
        }
      }

      modulesByTeam.set(teamId, set);
    }
  }

  let defaultGroupsByTeam: Map<string, AppModule[]> = new Map();

  if (teamIds.length > 0) {
    defaultGroupsByTeam = new Map(
      defaultGroups.map((group) => {
        const teamModules: AppModule[] = teamModulesByTeam.get(
          group.teamId,
        ) ?? [...DEFAULT_TEAM_MODULES];
        const baseModules = group.modulePermissions.length
          ? group.modulePermissions.map(
              (permission) => permission.module as AppModule,
            )
          : [...teamModules];
        const cappedModules = baseModules.filter((module) =>
          teamModules.includes(module),
        );
        return [group.teamId, cappedModules];
      }),
    );
  }

  const teamsWithModules = user.teams.map((team) => {
    const teamModules: AppModule[] = teamModulesByTeam.get(team.id) ?? [
      ...DEFAULT_TEAM_MODULES,
    ];
    const allowedModules = new Set<AppModule>([...teamModules, "ADMIN"]);
    const set = modulesByTeam.get(team.id);

    const modules = new Set<AppModule>(set ?? []);

    const fallback = defaultGroupsByTeam.get(team.id);
    if (!modules.size && fallback?.length) {
      for (const module of fallback) {
        modules.add(module);
      }
    }

    if (!modules.size) {
      for (const module of teamModules) {
        modules.add(module);
      }
    }

    if (team.ownerId === userId) {
      modules.add("ADMIN");
    }

    const cappedModules = Array.from(modules).filter((module) =>
      allowedModules.has(module),
    );

    return {
      ...team,
      modules: cappedModules,
    };
  });

  return {
    ...user,
    teams: teamsWithModules,
  };
};

const getCurrentUserProfile = async (userId: string, isAdmin: boolean) => {
  const [user, memberships] = await Promise.all([
    isAdmin ? getAdminUser(userId) : getUserCurrent(userId),
    prisma.userGroup.findMany({
      where: {
        userId,
      },
      select: {
        createdAt: true,
        group: {
          select: {
            id: true,
            name: true,
            teamId: true,
            isDefaultGroup: true,
            canAccessAllContacts: true,
            modulePermissions: {
              select: {
                module: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
  ]);

  if (!user) {
    return user;
  }

  const membershipsByTeam = new Map<
    string,
    Array<{
      id: string;
      name: string;
      isDefaultGroup: boolean;
      canAccessAllContacts: boolean;
      modules: AppModule[];
      joinedAt: Date;
    }>
  >();

  for (const membership of memberships) {
    const teamMemberships =
      membershipsByTeam.get(membership.group.teamId) ?? [];

    teamMemberships.push({
      id: membership.group.id,
      name: membership.group.name,
      isDefaultGroup: membership.group.isDefaultGroup,
      canAccessAllContacts: membership.group.canAccessAllContacts,
      modules: membership.group.modulePermissions.map(
        (permission) => permission.module as AppModule,
      ),
      joinedAt: membership.createdAt,
    });

    membershipsByTeam.set(membership.group.teamId, teamMemberships);
  }

  return {
    ...user,
    teams: user.teams.map((team) => ({
      ...team,
      memberships: membershipsByTeam.get(team.id) ?? [],
    })),
  };
};

const getUsers = async (
  {
    teamId,
    organizationId,
    fundingRequestId,
  }: {
    teamId?: string;
    organizationId?: string;
    fundingRequestId?: string;
  },
  searchQuery: string,
  pagination?: {
    page: number;
    pageSize: number;
  },
) => {
  const whereConditions = [];

  if (fundingRequestId) {
    const fundingRequest = await prisma.fundingRequest.findUnique({
      where: { id: fundingRequestId },
      select: { organizationId: true },
    });

    if (fundingRequest?.organizationId) {
      whereConditions.push({
        organizations: { some: { id: fundingRequest.organizationId } },
      });
    }
  }

  if (teamId) {
    // GET teams and organizations user.
    // const organizationIds = await prisma.organization
    //   .findMany({
    //     where: { teamId },
    //     select: { id: true },
    //   })
    //   .then((orgs) => orgs.map((org) => org.id));

    // whereConditions.push({
    //   OR: [
    //     ...(organizationIds.length > 0
    //       ? [{ organizations: { some: { id: { in: organizationIds } } } }]
    //       : []),
    //     { teams: { some: { id: teamId } } },
    //   ],
    // });

    // GET only teams user.
    whereConditions.push({ teams: { some: { id: teamId } } });
  } else if (organizationId) {
    whereConditions.push({ organizations: { some: { id: organizationId } } });
  }

  const where = {
    AND: [
      {
        OR: ["name", "email", "address", "city", "country"].map((field) => ({
          [field]: { contains: searchQuery, mode: "insensitive" },
        })),
      },
      ...whereConditions,
    ],
  } as Prisma.UserWhereInput;

  const include = {
    accounts: {
      select: {
        provider: true,
      },
    },
    ...(teamId
      ? {
          groups: {
            where: {
              group: {
                teamId,
              },
            },
            include: {
              group: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        }
      : {}),
  };

  const page = Math.max(pagination?.page ?? 1, 1);
  const pageSize = Math.max(pagination?.pageSize ?? 10, 1);
  const skip = (page - 1) * pageSize;

  if (!pagination) {
    const data = await prisma.user.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
    });
    return { data, total: data.length };
  }

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { data, total };
};

const getUsersForDonation = async ({
  teamId,
  fundingRequestId,
}: {
  teamId: string;
  fundingRequestId: string;
}) => {
  const fundingRequest = await prisma.fundingRequest.findUnique({
    where: { id: fundingRequestId, teamId },
    select: { organizationId: true },
  });

  if (!fundingRequest)
    throw new Error("Funding request not found in this team");

  return await prisma.user.findMany({
    where: {
      OR: [
        { organizations: { some: { id: fundingRequest.organizationId } } },
        { teams: { some: { id: teamId } } },
      ],
    },
    include: {
      accounts: {
        select: {
          provider: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

const createUser = async (user: User) => {
  const teamId = user.teamId;
  const organizationId = user.organizationId;

  const existingUser = await prisma.user.findUnique({
    where: { email: user.email },
    select: {
      id: true,
      roles: true,
    },
  });

  const connectOrganizations = organizationId
    ? {
        organizations: {
          connect: [{ id: organizationId }],
        },
      }
    : {};

  const connectTeams = teamId
    ? {
        teams: {
          connect: { id: teamId },
        },
      }
    : {};

  const updatableFields = [
    "name",
    "address",
    "phone",
    "postalCode",
    "city",
    "country",
  ] as const;

  if (existingUser) {
    const updatedRoles = Array.from(
      new Set([...(existingUser.roles || []), ...(user.roles || [])]),
    );

    const data: Record<string, unknown> = {
      roles: {
        set: updatedRoles,
      },
      ...connectOrganizations,
      ...connectTeams,
    };

    for (const field of updatableFields) {
      const value = user[field];
      if (value !== undefined && value !== null) {
        data[field] = value;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { email: user.email },
      data,
    });

    if (teamId) {
      await ensureDefaultGroup(teamId);
    }

    return updatedUser;
  }

  const {
    organizationId: _organizationId,
    teamId: _teamId,
    ...userData
  } = user;
  void _organizationId;
  void _teamId;
  const newUser = await prisma.user.create({
    data: {
      ...userData,
      ...connectOrganizations,
      ...connectTeams,
      fundingRequests: undefined,
    },
  });

  if (teamId) {
    await ensureDefaultGroup(teamId);
  }

  return newUser;
};

const getUserById = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id,
    },
  });

  return user;
};

const getTeamUserById = async (id: string, teamId: string) => {
  await ensureDefaultGroup(teamId);

  const [team, user, availableGroups] = await Promise.all([
    prisma.teams.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, ownerId: true },
    }),
    prisma.user.findFirst({
      where: {
        id,
        teams: { some: { id: teamId } },
      },
      select: {
        id: true,
        name: true,
        address: true,
        email: true,
        phone: true,
        postalCode: true,
        city: true,
        country: true,
        roles: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        accounts: {
          select: { provider: true },
        },
        groups: {
          where: { group: { teamId } },
          select: {
            createdAt: true,
            group: {
              select: {
                id: true,
                name: true,
                description: true,
                isDefaultGroup: true,
                canAccessAllContacts: true,
                modulePermissions: {
                  select: { module: true },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.group.findMany({
      where: { teamId },
      select: {
        id: true,
        name: true,
        description: true,
        isDefaultGroup: true,
        canAccessAllContacts: true,
        modulePermissions: {
          select: { module: true },
        },
      },
      orderBy: [{ isDefaultGroup: "desc" }, { name: "asc" }],
    }),
  ]);

  if (!team || !user) {
    return null;
  }

  return {
    ...user,
    isOwner: team.ownerId === user.id,
    team: { id: team.id, name: team.name },
    groups: user.groups.map((membership) => ({
      joinedAt: membership.createdAt,
      ...membership.group,
      modules: membership.group.modulePermissions.map(
        (permission) => permission.module as AppModule,
      ),
      modulePermissions: undefined,
    })),
    availableGroups: availableGroups.map((group) => ({
      ...group,
      modules: group.modulePermissions.map(
        (permission) => permission.module as AppModule,
      ),
      modulePermissions: undefined,
    })),
  };
};

const updateTeamUser = async (userId: string, input: UpdateTeamUserInput) => {
  const normalizeOptional = (value?: string) => value?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const [team, targetUser, requestedGroups] = await Promise.all([
      tx.teams.findUnique({
        where: { id: input.teamId },
        select: { ownerId: true },
      }),
      tx.user.findFirst({
        where: {
          id: userId,
          teams: { some: { id: input.teamId } },
        },
        select: { id: true },
      }),
      tx.group.findMany({
        where: {
          teamId: input.teamId,
          id: { in: input.groupIds },
        },
        select: { id: true, name: true, isDefaultGroup: true },
      }),
    ]);

    if (!team || !targetUser) {
      throw new Error("User not found in this team");
    }

    if (requestedGroups.length !== new Set(input.groupIds).size) {
      throw new Error("One or more groups do not belong to this team");
    }

    if (requestedGroups.some((group) => group.isDefaultGroup)) {
      throw new Error("Default group membership is managed automatically");
    }

    const selectedGroupIds = new Set(requestedGroups.map((group) => group.id));
    if (team.ownerId === userId) {
      const adminGroup = await tx.group.findFirst({
        where: { teamId: input.teamId, name: "Admin" },
        select: { id: true },
      });
      if (adminGroup) {
        selectedGroupIds.add(adminGroup.id);
      }
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: normalizeOptional(input.phone),
        address: normalizeOptional(input.address),
        postalCode: normalizeOptional(input.postalCode),
        city: normalizeOptional(input.city),
        country: normalizeOptional(input.country),
      },
    });

    await tx.userGroup.deleteMany({
      where: {
        userId,
        group: { teamId: input.teamId },
      },
    });

    if (selectedGroupIds.size > 0) {
      await tx.userGroup.createMany({
        data: Array.from(selectedGroupIds, (groupId) => ({ userId, groupId })),
      });
    }

    await ensureDefaultGroup(input.teamId, tx);

    return tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
  });
};

const getTeamsUsers = async (teamId: string) => {
  const users = await prisma.user.findMany({
    where: {
      teams: {
        some: {
          id: teamId,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return users;
};

const deleteUser = async (
  userId: string,
  organizationId?: string,
  teamId?: string,
) => {
  if (organizationId) {
    // Remove user from organization
    await prisma.user.update({
      where: { id: userId },
      data: {
        organizations: {
          disconnect: { id: organizationId },
        },
      },
    });
  }

  if (teamId) {
    await prisma.userGroup.deleteMany({
      where: {
        userId,
        group: {
          teamId,
        },
      },
    });

    // Remove user from team
    await prisma.user.update({
      where: { id: userId },
      data: {
        teams: {
          disconnect: { id: teamId },
        },
      },
    });
  }

  return true;
};

export {
  createUser,
  deleteUser,
  getAdminUser,
  getCurrentUserProfile,
  getTeamsUsers,
  getTeamUserById,
  getUserById,
  getUserCurrent,
  getUsers,
  getUsersForDonation,
  updateTeamUser,
};
