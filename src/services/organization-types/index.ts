import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

type CreateOrganizationTypeInput = {
  teamId: string;
  name: string;
  color?: string;
  schema?: Prisma.InputJsonValue;
};

type UpdateOrganizationTypeInput = {
  id: string;
  teamId: string;
  name: string;
  color?: string;
  schema?: Prisma.InputJsonValue;
};

type OrganizationTypeModel = {
  id: string;
  teamId: string;
  name: string;
  color?: string;
  schema?: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

const mapOrganizationType = (
  orgType: Prisma.OrganizationTypeGetPayload<Record<string, never>>,
): OrganizationTypeModel => ({
  id: orgType.id,
  teamId: orgType.teamId,
  name: orgType.name,
  color: orgType.color ?? undefined,
  schema: (orgType.schema as Prisma.JsonValue) ?? undefined,
  createdAt: orgType.createdAt,
  updatedAt: orgType.updatedAt,
});

export const getTeamOrganizationTypes = async (teamId: string) => {
  const types = await prisma.organizationType.findMany({
    where: { teamId },
    orderBy: { name: "asc" },
  });

  return types.map(mapOrganizationType);
};

export const getOrganizationTypeById = async (
  typeId: string,
  teamId: string,
) => {
  const type = await prisma.organizationType.findFirst({
    where: { id: typeId, teamId },
  });

  if (!type) {
    return null;
  }

  return mapOrganizationType(type);
};

export const createOrganizationType = async (
  input: CreateOrganizationTypeInput,
) => {
  const { teamId, name, color, schema } = input;

  const created = await prisma.organizationType.create({
    data: {
      teamId,
      name,
      color,
      schema,
    },
  });

  return mapOrganizationType(created);
};

export const updateOrganizationType = async (
  input: UpdateOrganizationTypeInput,
) => {
  const { id, teamId, name, color, schema } = input;

  const existing = await prisma.organizationType.findFirst({
    where: { id, teamId },
  });

  if (!existing) {
    throw new Error("Organization type not found");
  }

  const updated = await prisma.organizationType.update({
    where: { id },
    data: {
      name,
      color,
      schema,
    },
  });

  return mapOrganizationType(updated);
};

export const deleteOrganizationTypes = async (
  teamId: string,
  ids: string[],
) => {
  if (!ids.length) {
    return;
  }

  await prisma.organizationType.deleteMany({
    where: {
      id: { in: ids },
      teamId,
    },
  });
};