import type { Prisma } from "@prisma/client";
import type { RecordSort } from "@/lib/list-request";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import { primaryContactEmailSelect } from "@/services/contact-emails";
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

type FileScope = {
  organizationId?: string;
  teamId?: string;
  contactId?: string;
  includeContactFiles?: boolean;
};

type FileListFilters = {
  /** Only files of these types (stored types: enum values or MIME types). */
  types?: string[];
};

/** Columns the Files lists can be ordered by (see lib/list-request). */
export const FILE_SORT_FIELDS = [
  "name",
  "type",
  "createdAt",
  "updatedAt",
] as const;
export type FileSortField = (typeof FILE_SORT_FIELDS)[number];

const fileListInclude = {
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
  contact: {
    select: {
      id: true,
      teamId: true,
      name: true,
      emails: primaryContactEmailSelect,
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
} satisfies Prisma.FileInclude;

/** Which files a team, an organization or a contact has. */
const getFileScopeWhere = async ({
  organizationId,
  teamId,
  contactId,
  includeContactFiles = false,
}: FileScope): Promise<Prisma.FileWhereInput> => {
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
        ...(includeContactFiles
          ? [{ contact: { teamId, deletedAt: null } }]
          : []),
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

  return where;
};

const getSearchWhere = (searchQuery: string): Prisma.FileWhereInput | null => {
  const query = searchQuery.trim();
  if (!query) return null;
  return {
    OR: [
      { name: { contains: query, mode: "insensitive" } },
      { type: { contains: query, mode: "insensitive" } },
      { url: { contains: query, mode: "insensitive" } },
    ],
  };
};

const combineWhere = (
  clauses: Array<Prisma.FileWhereInput | null>,
): Prisma.FileWhereInput => {
  const present = clauses.filter(
    (clause): clause is Prisma.FileWhereInput =>
      Boolean(clause) && Object.keys(clause ?? {}).length > 0,
  );
  if (present.length === 0) return {};
  if (present.length === 1) return present[0];
  return { AND: present };
};

/** Every file of a scope that matches, newest first (downloads, pickers). */
const getFiles = async (
  scope: FileScope,
  searchQuery: string,
  filters: FileListFilters = {},
) => {
  const where = combineWhere([
    await getFileScopeWhere(scope),
    getSearchWhere(searchQuery),
    filters.types?.length ? { type: { in: filters.types } } : null,
  ]);

  return prisma.file.findMany({
    where,
    include: fileListInclude,
    orderBy: {
      createdAt: "desc",
    },
  });
};

const getFileOrderBy = (
  sort: RecordSort<FileSortField>,
): Prisma.FileOrderByWithRelationInput[] => {
  // The id keeps rows with equal values in one order across pages.
  const tieBreaker: Prisma.FileOrderByWithRelationInput = { id: "asc" };
  if (sort.field === "name") {
    return [
      { name: { sort: sort.direction, nulls: "last" } },
      { url: sort.direction },
      tieBreaker,
    ];
  }
  return [{ [sort.field]: sort.direction }, tieBreaker];
};

/**
 * One page of a Files list, with the total and the types present in it
 * (before the type filter, so the filter can offer every type there is).
 */
const getFilesPage = async (
  scope: FileScope,
  searchQuery: string,
  {
    page,
    pageSize,
    sort,
    types,
  }: FileListFilters & {
    page: number;
    pageSize: number;
    sort: RecordSort<FileSortField>;
  },
) => {
  const baseWhere = combineWhere([
    await getFileScopeWhere(scope),
    getSearchWhere(searchQuery),
  ]);
  const where = combineWhere([
    baseWhere,
    types?.length ? { type: { in: types } } : null,
  ]);

  const [data, total, typeGroups] = await Promise.all([
    prisma.file.findMany({
      where,
      include: fileListInclude,
      orderBy: getFileOrderBy(sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.file.count({ where }),
    prisma.file.groupBy({
      by: ["type"],
      where: baseWhere,
      _count: { _all: true },
      orderBy: { type: "asc" },
    }),
  ]);

  return {
    data,
    total,
    types: typeGroups.map((group) => ({
      type: group.type,
      count: group._count._all,
    })),
  };
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

const getFileDetails = async (id: string) => {
  return prisma.file.findUnique({
    where: { id },
    include: {
      organization: {
        select: {
          id: true,
          teamId: true,
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
      contact: {
        select: {
          id: true,
          teamId: true,
          name: true,
          emails: primaryContactEmailSelect,
        },
      },
      createdBy: {
        select: {
          email: true,
        },
      },
      updatedBy: {
        select: {
          email: true,
        },
      },
      downloadAudits: {
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
    prisma.contact.findFirst({
      where: { id: contactId, deletedAt: null },
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
  getFilesPage,
  canUserAccessFile,
  canUserAccessContactScope,
  canUserAccessTeamOrOrgScope,
  getFileById,
  getFileByIdWithRelations,
  getFileDetails,
  getFileDownloadAudits,
  getFiles,
  recordFileDownloadAudit,
};
