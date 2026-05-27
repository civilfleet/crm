import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import { type FileDownloadType, Roles } from "@/types";

const getFileById = async (id: string) => {
  try {
    const file = await prisma.file.findUnique({
      where: {
        id,
      },
    });

    return file;
  } catch (error) {
    throw handlePrismaError(error);
  }
};

const getFiles = async (
  {
    organizationId,
    teamId,
    contactId,
  }: {
    organizationId?: string;
    teamId?: string;
    contactId?: string;
  },
  searchQuery: string,
) => {
  let where: Prisma.FileWhereInput = {};

  if (teamId) {
    const organizationIds = await prisma.organization
      .findMany({
        where: { teamId },
        select: { id: true },
      })
      .then((orgs) => orgs.map((org) => org.id));

    where = {
      OR: [
        ...(organizationIds.length > 0
          ? [{ organizationId: { in: organizationIds } }]
          : []),
        { FundingRequest: { teamId } },
        { donationAgreement: { some: { teamId } } },
        { Transaction: { some: { teamId } } },
      ],
    };
  } else if (organizationId) {
    where = {
      OR: [
        { organizationId },
        { FundingRequest: { organizationId } },
        { donationAgreement: { some: { organizationId } } },
        { Transaction: { some: { organizationId } } },
      ],
    };
  } else if (contactId) {
    where = {
      contactId,
    };
  }

  if (searchQuery.trim()) {
    const queryFilter: Prisma.FileWhereInput = {
      OR: [
        { name: { contains: searchQuery, mode: "insensitive" } },
        { type: { contains: searchQuery, mode: "insensitive" } },
        { url: { contains: searchQuery, mode: "insensitive" } },
      ],
    };

    where = Object.keys(where).length
      ? {
          AND: [where, queryFilter],
        }
      : queryFilter;
  }

  const users = await prisma.file.findMany({
    where,
    include: {
      organization: {
        select: {
          name: true,
        },
      },
      FundingRequest: {
        select: {
          id: true,
          name: true,
          teamId: true,
          organizationId: true,
        },
      },
      donationAgreement: {
        select: {
          id: true,
          teamId: true,
          organizationId: true,
          fundingRequest: {
            select: {
              name: true,
            },
          },
        },
      },
      Transaction: {
        select: {
          id: true,
          teamId: true,
          organizationId: true,
          fundingRequest: {
            select: {
              name: true,
            },
          },
        },
      },
      downloadAudits: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          createdAt: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      },
      updatedBy: {
        select: {
          email: true,
        },
      },
      createdBy: {
        select: {
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return users;
};

const getFileByIdWithRelations = async (id: string) => {
  return prisma.file.findUnique({
    where: { id },
    include: {
      FundingRequest: {
        select: {
          teamId: true,
          organizationId: true,
        },
      },
      donationAgreement: {
        select: {
          teamId: true,
          organizationId: true,
        },
      },
      Transaction: {
        select: {
          teamId: true,
          organizationId: true,
        },
      },
      contact: {
        select: {
          teamId: true,
        },
      },
    },
  });
};

const getUserAccessScope = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      roles: true,
      teams: { select: { id: true } },
      organizations: { select: { id: true } },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return {
    roles: user.roles,
    teamIds: user.teams.map((team) => team.id),
    organizationIds: user.organizations.map((organization) => organization.id),
  };
};

const canUserAccessTeamOrOrgScope = async ({
  userId,
  teamId,
  organizationId,
}: {
  userId: string;
  teamId?: string;
  organizationId?: string;
}) => {
  const scope = await getUserAccessScope(userId);
  if (scope.roles.includes(Roles.Admin)) return true;
  if (teamId && scope.teamIds.includes(teamId)) return true;
  if (organizationId && scope.organizationIds.includes(organizationId))
    return true;
  return false;
};

const canUserAccessContactScope = async ({
  userId,
  contactId,
}: {
  userId: string;
  contactId: string;
}) => {
  const [scope, contact] = await Promise.all([
    getUserAccessScope(userId),
    prisma.contact.findUnique({
      where: { id: contactId },
      select: { teamId: true },
    }),
  ]);

  if (!contact) return false;
  if (scope.roles.includes(Roles.Admin)) return true;
  return scope.teamIds.includes(contact.teamId);
};

const canUserAccessFile = async ({
  userId,
  fileId,
}: {
  userId: string;
  fileId: string;
}) => {
  const [scope, file] = await Promise.all([
    getUserAccessScope(userId),
    getFileByIdWithRelations(fileId),
  ]);
  if (!file) return false;
  if (scope.roles.includes(Roles.Admin)) return true;

  if (
    file.organizationId &&
    scope.organizationIds.includes(file.organizationId)
  ) {
    return true;
  }

  if (file.contact?.teamId && scope.teamIds.includes(file.contact.teamId)) {
    return true;
  }

  if (
    file.FundingRequest?.teamId &&
    scope.teamIds.includes(file.FundingRequest.teamId)
  ) {
    return true;
  }
  if (
    file.FundingRequest?.organizationId &&
    scope.organizationIds.includes(file.FundingRequest.organizationId)
  ) {
    return true;
  }

  if (
    file.donationAgreement.some(
      (agreement) =>
        (agreement.teamId && scope.teamIds.includes(agreement.teamId)) ||
        (agreement.organizationId &&
          scope.organizationIds.includes(agreement.organizationId)),
    )
  ) {
    return true;
  }

  if (
    file.Transaction.some(
      (transaction) =>
        scope.teamIds.includes(transaction.teamId) ||
        scope.organizationIds.includes(transaction.organizationId),
    )
  ) {
    return true;
  }

  return false;
};

const recordFileDownloadAudit = async ({
  userId,
  type,
  fileId,
  teamId,
  organizationId,
  query,
  fileCount,
}: {
  userId: string;
  type: FileDownloadType;
  fileId?: string;
  teamId?: string;
  organizationId?: string;
  query?: string;
  fileCount?: number;
}) => {
  return prisma.fileDownloadAudit.create({
    data: {
      type,
      fileCount: fileCount ?? 1,
      ...(query ? { query } : {}),
      user: {
        connect: { id: userId },
      },
      ...(fileId
        ? {
            file: {
              connect: { id: fileId },
            },
          }
        : {}),
      ...(teamId
        ? {
            team: {
              connect: { id: teamId },
            },
          }
        : {}),
      ...(organizationId
        ? {
            organization: {
              connect: { id: organizationId },
            },
          }
        : {}),
    },
  });
};

const getFileDownloadAudits = async ({
  teamId,
  organizationId,
  limit = 20,
}: {
  teamId?: string;
  organizationId?: string;
  limit?: number;
}) => {
  return prisma.fileDownloadAudit.findMany({
    where: {
      ...(teamId ? { teamId } : {}),
      ...(organizationId ? { organizationId } : {}),
    },
    take: limit,
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      type: true,
      fileCount: true,
      query: true,
      createdAt: true,
      user: {
        select: {
          email: true,
        },
      },
      file: {
        select: {
          id: true,
          name: true,
          url: true,
        },
      },
    },
  });
};

export {
  canUserAccessFile,
  canUserAccessContactScope,
  canUserAccessTeamOrOrgScope,
  getFileById,
  getFileByIdWithRelations,
  getFileDownloadAudits,
  getFiles,
  recordFileDownloadAudit,
};