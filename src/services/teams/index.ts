import { normalizeLoginDomain } from "@/lib/auth-routing";
import prisma from "@/lib/prisma";
import { ensureDefaultGroup } from "@/services/groups";
import { Roles } from "@/types";
import type { CreateTeamInput } from "@/validations/team";

const getTeamsByRoles = async (_roles: string[] | null) => {
  return prisma.teams.findMany({
    select: {
      id: true,
      name: true,
      email: true,
    },
  });
};

const createTeam = async (teamData: CreateTeamInput) => {
  const TeamUser = teamData.user;

  const {
    user: _user,
    loginDomain,
    bankDetails: _bankDetails,
    ...sanitizedTeamData
  } = teamData;
  void _user;
  void _bankDetails;

  const query = {
    data: {
      ...sanitizedTeamData,
      loginDomain: normalizeLoginDomain(loginDomain),
      users: {},
    },
    select: {
      id: true,
      name: true,
      email: true,

      users: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
        },
      },
    },
  };
  // TODO: Check if user already exists

  const user = await prisma.user.findUnique({
    where: {
      email: TeamUser.email,
    },
  });

  if (user?.id) {
    query.data.users = {
      connect: {
        id: user.id,
      },
    };
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        roles: {
          set: Array.from(new Set([...user.roles, Roles.Team])),
        },
      },
    });
  } else {
    query.data.users = {
      create: {
        ...TeamUser,
        roles: [Roles.Team] as Roles[],
      },
    };
  }

  const team = await prisma.teams.create(query);

  const ownerId = user?.id ?? team.users?.[0]?.id;
  if (ownerId) {
    await prisma.teams.update({
      where: { id: team.id },
      data: { ownerId },
    });
  }
  await ensureDefaultGroup(team.id);
  return {
    team,
  };
};

const ensureTeamOwner = async (teamId: string) => {
  const team = await prisma.teams.findUnique({
    where: { id: teamId },
    select: { ownerId: true },
  });

  if (team?.ownerId) {
    return team.ownerId;
  }

  const fallbackOwner = await prisma.user.findFirst({
    where: {
      teams: {
        some: {
          id: teamId,
        },
      },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (fallbackOwner?.id) {
    await prisma.teams.update({
      where: { id: teamId },
      data: { ownerId: fallbackOwner.id },
    });
    return fallbackOwner.id;
  }

  return null;
};

const transferTeamOwnership = async (
  teamId: string,
  actorUserId: string,
  newOwnerId: string,
  actorRoles?: Roles[] | string[],
) => {
  const team = await prisma.teams.findUnique({
    where: { id: teamId },
    select: { ownerId: true },
  });

  if (!team) {
    throw new Error("Team not found");
  }

  const isSuperAdmin = actorRoles?.includes(Roles.Admin) ?? false;

  if (team.ownerId && team.ownerId !== actorUserId && !isSuperAdmin) {
    throw new Error(
      "Only the current owner or a super admin can transfer ownership",
    );
  }

  const newOwner = await prisma.user.findFirst({
    where: {
      id: newOwnerId,
      teams: {
        some: { id: teamId },
      },
    },
    select: { id: true },
  });

  if (!newOwner) {
    throw new Error("New owner must be a member of the team");
  }

  await prisma.teams.update({
    where: { id: teamId },
    data: { ownerId: newOwner.id },
  });

  return newOwner.id;
};

const getTeamOwner = async (teamId: string) => {
  const team = await prisma.teams.findUnique({
    where: { id: teamId },
    select: {
      ownerId: true,
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!team) {
    return null;
  }

  if (!team.ownerId) {
    const ensured = await ensureTeamOwner(teamId);
    if (!ensured) {
      return null;
    }
    const owner = await prisma.user.findUnique({
      where: { id: ensured },
      select: { id: true, name: true, email: true },
    });
    return owner
      ? { id: owner.id, name: owner.name, email: owner.email }
      : null;
  }

  return team.owner ?? null;
};

export {
  createTeam,
  ensureTeamOwner,
  getTeamOwner,
  getTeamsByRoles,
  transferTeamOwnership,
};