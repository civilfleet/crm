import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

type CreateEventTypeInput = {
  teamId: string;
  name: string;
  color?: string;
};

type UpdateEventTypeInput = {
  id: string;
  teamId: string;
  name: string;
  color?: string;
};

type EventTypeModel = {
  id: string;
  teamId: string;
  name: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
};

const mapEventType = (
  eventType: Prisma.EventTypeGetPayload<Record<string, never>>,
): EventTypeModel => ({
  id: eventType.id,
  teamId: eventType.teamId,
  name: eventType.name,
  color: eventType.color ?? undefined,
  createdAt: eventType.createdAt,
  updatedAt: eventType.updatedAt,
});

export const getTeamEventTypes = async (teamId: string) => {
  const types = await prisma.eventType.findMany({
    where: {
      teamId,
    },
    orderBy: {
      name: "asc",
    },
  });

  return types.map(mapEventType);
};

export const getEventTypeById = async (typeId: string, teamId: string) => {
  const type = await prisma.eventType.findFirst({
    where: {
      id: typeId,
      teamId,
    },
  });

  if (!type) {
    return null;
  }

  return mapEventType(type);
};

export const createEventType = async (input: CreateEventTypeInput) => {
  const { teamId, name, color } = input;

  const created = await prisma.eventType.create({
    data: {
      teamId,
      name,
      color,
    },
  });

  return mapEventType(created);
};

export const updateEventType = async (input: UpdateEventTypeInput) => {
  const { id, teamId, name, color } = input;

  const existing = await prisma.eventType.findFirst({
    where: { id, teamId },
  });

  if (!existing) {
    throw new Error("Event type not found");
  }

  const updated = await prisma.eventType.update({
    where: { id },
    data: {
      name,
      color,
    },
  });

  return mapEventType(updated);
};

export const deleteEventTypes = async (teamId: string, ids: string[]) => {
  if (!ids.length) {
    return;
  }

  await prisma.eventType.deleteMany({
    where: {
      id: { in: ids },
      teamId,
    },
  });
};
