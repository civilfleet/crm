import prisma from "@/lib/prisma";

type CreateOrganizationEngagementInput = {
  organizationId: string;
  teamId: string;
  type: string;
  note?: string;
  engagedAt: string;
};

export const getOrganizationEngagements = async (
  organizationId: string,
  teamId: string,
) => {
  return prisma.organizationEngagement.findMany({
    where: {
      organizationId,
      teamId,
      organization: { teamId },
    },
    orderBy: {
      engagedAt: "desc",
    },
  });
};

export const createOrganizationEngagement = async (
  input: CreateOrganizationEngagementInput,
) => {
  const { organizationId, teamId, type, note, engagedAt } = input;
  const engagedDate = new Date(engagedAt);
  if (Number.isNaN(engagedDate.getTime())) {
    throw new Error("Invalid engagement date");
  }

  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, teamId },
    select: { id: true },
  });
  if (!organization) {
    throw new Error("Organization does not belong to this team");
  }

  return prisma.organizationEngagement.create({
    data: {
      organizationId,
      teamId,
      type,
      note,
      engagedAt: engagedDate,
    },
  });
};
