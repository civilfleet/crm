import type { Prisma } from "@prisma/client";
import type { ContactSubmodule } from "@/constants/contact-submodules";
import prisma from "@/lib/prisma";
import { resolveActivityInboxReadState } from "@/services/activity-inbox/read-state";
import { mapEngagement } from "@/services/contact-engagements";
import { getContactVisibility } from "@/services/contacts/access";
import type {
  ContactEngagement,
  EngagementDirection,
  EngagementSource,
  Roles,
} from "@/types";

export type ActivityInboxItem = ContactEngagement & {
  contact: { id: string; name: string; email?: string };
  isRead: boolean;
};

type ActivityInboxAccess = {
  teamId: string;
  userId: string;
  roles: Roles[];
  allowedSubmodules: ContactSubmodule[];
  isAdmin: boolean;
};

type ActivityInboxFilters = {
  status: "unread-first" | "all";
  page: number;
  pageSize: number;
  source?: EngagementSource;
  direction?: EngagementDirection;
  query?: string;
};

const getInboxInclude = (userId: string) =>
  ({
    contact: {
      select: {
        id: true,
        name: true,
        emails: {
          where: { kind: "PRIMARY" as const },
          select: { email: true },
          take: 1,
        },
      },
    },
    userStates: { where: { userId } },
    emailInbox: {
      select: {
        id: true,
        name: true,
        replyFromEmail: true,
        outboundMode: true,
      },
    },
    inboundEmailMessages: {
      take: 1,
      select: {
        id: true,
        emailInboxId: true,
        mailbox: true,
        fromEmail: true,
        fromName: true,
        rawHeaders: true,
        messageId: true,
        uid: true,
        emailInbox: {
          select: {
            name: true,
            groupId: true,
            username: true,
            replyFromEmail: true,
            outboundMode: true,
          },
        },
      },
    },
  }) satisfies Prisma.ContactEngagementInclude;

const getSubmoduleWhere = (allowedSubmodules: ContactSubmodule[]) => ({
  OR: [
    { restrictedToSubmodule: null },
    ...(allowedSubmodules.length
      ? [{ restrictedToSubmodule: { in: allowedSubmodules } }]
      : []),
  ],
});

const initializeInbox = (teamId: string, userId: string) =>
  prisma.contactEngagementInboxState.upsert({
    where: { teamId_userId: { teamId, userId } },
    create: { teamId, userId },
    update: {},
  });

const buildVisibleWhere = async ({
  teamId,
  userId,
  roles,
  allowedSubmodules,
}: ActivityInboxAccess): Promise<Prisma.ContactEngagementWhereInput> => {
  const visibility = await getContactVisibility({ teamId, userId, roles });
  return {
    teamId,
    contact: visibility.where,
    ...getSubmoduleWhere(allowedSubmodules),
  };
};

const getUnreadWhere = (
  userId: string,
  readThroughAt: Date,
): Prisma.ContactEngagementWhereInput => ({
  OR: [
    { userStates: { some: { userId, isRead: false } } },
    {
      createdAt: { gt: readThroughAt },
      userStates: { none: { userId } },
      AND: [{ OR: [{ userId: null }, { userId: { not: userId } }] }],
    },
  ],
});

const getNotDismissedWhere = (
  userId: string,
): Prisma.ContactEngagementWhereInput => ({
  userStates: { none: { userId, dismissedAt: { not: null } } },
});

const getReplyInboxIds = async ({
  teamId,
  userId,
  isAdmin,
}: ActivityInboxAccess) => {
  const inboxes = await prisma.emailInbox.findMany({
    where: {
      teamId,
      outboundMode: { not: "DISABLED" },
      ...(isAdmin ? {} : { group: { users: { some: { userId } } } }),
    },
    select: { id: true },
  });
  return new Set(inboxes.map(({ id }) => id));
};

export const getActivityInbox = async (
  access: ActivityInboxAccess,
  filters: ActivityInboxFilters,
) => {
  const inboxState = await initializeInbox(access.teamId, access.userId);
  const visibleWhere = await buildVisibleWhere(access);
  const inboxWhere: Prisma.ContactEngagementWhereInput = {
    AND: [visibleWhere, getNotDismissedWhere(access.userId)],
  };
  const unreadWhere = getUnreadWhere(access.userId, inboxState.readThroughAt);
  const query = filters.query?.trim();
  const filteredWhere: Prisma.ContactEngagementWhereInput = {
    AND: [
      inboxWhere,
      ...(filters.source ? [{ source: filters.source }] : []),
      ...(filters.direction ? [{ direction: filters.direction }] : []),
      ...(query
        ? [
            {
              OR: [
                { contact: { name: { contains: query, mode: "insensitive" } } },
                { subject: { contains: query, mode: "insensitive" } },
                { message: { contains: query, mode: "insensitive" } },
              ],
            } satisfies Prisma.ContactEngagementWhereInput,
          ]
        : []),
    ],
  };
  const skip = (filters.page - 1) * filters.pageSize;
  const orderBy: Prisma.ContactEngagementOrderByWithRelationInput[] = [
    { createdAt: "desc" },
    { id: "desc" },
  ];
  const [total, unreadCount, filteredUnreadCount, replyInboxIds] =
    await Promise.all([
      prisma.contactEngagement.count({ where: filteredWhere }),
      prisma.contactEngagement.count({
        where: { AND: [inboxWhere, unreadWhere] },
      }),
      filters.status === "unread-first"
        ? prisma.contactEngagement.count({
            where: { AND: [filteredWhere, unreadWhere] },
          })
        : Promise.resolve(0),
      getReplyInboxIds(access),
    ]);

  const engagements = await (async () => {
    if (filters.status === "all") {
      return prisma.contactEngagement.findMany({
        where: filteredWhere,
        include: getInboxInclude(access.userId),
        orderBy,
        skip,
        take: filters.pageSize,
      });
    }

    if (skip >= filteredUnreadCount) {
      return prisma.contactEngagement.findMany({
        where: { AND: [filteredWhere, { NOT: unreadWhere }] },
        include: getInboxInclude(access.userId),
        orderBy,
        skip: skip - filteredUnreadCount,
        take: filters.pageSize,
      });
    }

    const unreadItems = await prisma.contactEngagement.findMany({
      where: { AND: [filteredWhere, unreadWhere] },
      include: getInboxInclude(access.userId),
      orderBy,
      skip,
      take: filters.pageSize,
    });
    const remaining = filters.pageSize - unreadItems.length;
    if (remaining === 0) return unreadItems;

    const readItems = await prisma.contactEngagement.findMany({
      where: { AND: [filteredWhere, { NOT: unreadWhere }] },
      include: getInboxInclude(access.userId),
      orderBy,
      take: remaining,
    });
    return [...unreadItems, ...readItems];
  })();

  const items: ActivityInboxItem[] = engagements.map((engagement) => {
    const explicitState = engagement.userStates.find(
      ({ userId }) => userId === access.userId,
    );
    return {
      ...mapEngagement(engagement, replyInboxIds),
      contact: {
        id: engagement.contact.id,
        name: engagement.contact.name,
        email: engagement.contact.emails[0]?.email,
      },
      isRead: resolveActivityInboxReadState({
        explicitIsRead: explicitState?.isRead,
        engagementCreatedAt: engagement.createdAt,
        readThroughAt: inboxState.readThroughAt,
        engagementUserId: engagement.userId,
        currentUserId: access.userId,
      }),
    };
  });

  return {
    items,
    total,
    unreadCount,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
};

export const getActivityInboxUnreadCount = async (
  access: ActivityInboxAccess,
) => {
  const inboxState = await initializeInbox(access.teamId, access.userId);
  const visibleWhere = await buildVisibleWhere(access);
  const inboxWhere: Prisma.ContactEngagementWhereInput = {
    AND: [visibleWhere, getNotDismissedWhere(access.userId)],
  };
  return prisma.contactEngagement.count({
    where: {
      AND: [
        inboxWhere,
        getUnreadWhere(access.userId, inboxState.readThroughAt),
      ],
    },
  });
};

export const setActivityInboxReadState = async ({
  access,
  engagementId,
  isRead,
}: {
  access: ActivityInboxAccess;
  engagementId: string;
  isRead: boolean;
}) => {
  await initializeInbox(access.teamId, access.userId);
  const visibleWhere = await buildVisibleWhere(access);
  const engagement = await prisma.contactEngagement.findFirst({
    where: { id: engagementId, AND: [visibleWhere] },
    select: { id: true },
  });
  if (!engagement) throw new Error("Engagement not found.");

  await prisma.contactEngagementUserState.upsert({
    where: {
      engagementId_userId: { engagementId, userId: access.userId },
    },
    create: {
      teamId: access.teamId,
      userId: access.userId,
      engagementId,
      isRead,
    },
    update: { isRead },
  });
};

export const markAllActivityInboxRead = async (access: ActivityInboxAccess) => {
  const now = new Date();
  await prisma.$transaction([
    prisma.contactEngagementInboxState.upsert({
      where: {
        teamId_userId: { teamId: access.teamId, userId: access.userId },
      },
      create: {
        teamId: access.teamId,
        userId: access.userId,
        initializedAt: now,
        readThroughAt: now,
      },
      update: { readThroughAt: now },
    }),
    prisma.contactEngagementUserState.deleteMany({
      where: {
        teamId: access.teamId,
        userId: access.userId,
        dismissedAt: null,
      },
    }),
  ]);
};

export const applyActivityInboxBatchAction = async ({
  access,
  engagementIds,
  action,
}: {
  access: ActivityInboxAccess;
  engagementIds: string[];
  action: "mark-unread" | "dismiss";
}) => {
  await initializeInbox(access.teamId, access.userId);
  const ids = Array.from(new Set(engagementIds));
  if (ids.length === 0 || ids.length > 100) {
    throw new Error("Select between 1 and 100 engagements.");
  }

  const visibleWhere = await buildVisibleWhere(access);
  const visibleEngagements = await prisma.contactEngagement.findMany({
    where: { id: { in: ids }, AND: [visibleWhere] },
    select: { id: true },
  });
  if (visibleEngagements.length !== ids.length) {
    throw new Error("One or more engagements are no longer available.");
  }

  const dismissedAt = action === "dismiss" ? new Date() : null;
  await prisma.$transaction(
    ids.map((engagementId) =>
      prisma.contactEngagementUserState.upsert({
        where: {
          engagementId_userId: { engagementId, userId: access.userId },
        },
        create: {
          teamId: access.teamId,
          userId: access.userId,
          engagementId,
          isRead: action === "dismiss",
          dismissedAt,
        },
        update: {
          isRead: action === "dismiss",
          dismissedAt,
        },
      }),
    ),
  );
};
