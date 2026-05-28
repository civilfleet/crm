import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

type CreateEventRoleInput = {
  teamId: string;
  name: string;
  color?: string;
};

type UpdateEventRoleInput = {
  id: string;
  teamId: string;
  name: string;
  color?: string;
};

type EventRoleType = {
  id: string;
  teamId: string;
  name: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
};

const mapEventRole = (
  role: Prisma.EventRoleGetPayload<Record<string, never>>,
): EventRoleType => ({
  id: role.id,
  teamId: role.teamId,
  name: role.name,
  color: role.color ?? undefined,
  createdAt: role.createdAt,
  updatedAt: role.updatedAt,
});

export const getTeamEventRoles = async (teamId: string) => {
  const roles = await prisma.eventRole.findMany({
    where: {
      teamId,
    },
    orderBy: {
      name: "asc",
    },
  });

  return roles.map(mapEventRole);
};

export const getEventRoleById = async (roleId: string, teamId: string) => {
  const role = await prisma.eventRole.findFirst({
    where: {
      id: roleId,
      teamId,
    },
  });

  if (!role) {
    return null;
  }

  return mapEventRole(role);
};

export const createEventRole = async (input: CreateEventRoleInput) => {
  const { teamId, name, color } = input;

  const role = await prisma.eventRole.create({
    data: {
      teamId,
      name,
      color,
    },
  });

  return mapEventRole(role);
};

export const updateEventRole = async (input: UpdateEventRoleInput) => {
  const { id, teamId, name, color } = input;

  // Verify role belongs to team
  const existingRole = await prisma.eventRole.findFirst({
    where: { id, teamId },
  });

  if (!existingRole) {
    throw new Error("Event role not found");
  }

  const role = await prisma.eventRole.update({
    where: { id },
    data: {
      name,
      color,
    },
  });

  return mapEventRole(role);
};

export const deleteEventRoles = async (teamId: string, ids: string[]) => {
  if (!ids.length) {
    return;
  }

  await prisma.eventRole.deleteMany({
    where: {
      id: { in: ids },
      teamId,
    },
  });
};
