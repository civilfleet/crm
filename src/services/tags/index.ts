import type { Prisma } from "@prisma/client";
import type { ContactSubmodule } from "@/constants/contact-submodules";
import { ApiError } from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import { normalizeTagNames, normalizeTagSearchQuery } from "@/lib/tags";
import { getContactVisibility } from "@/services/contacts/access";
import { getAllowedContactSubmodules } from "@/services/contacts/submodule-access";
import type {
  Roles,
  TaggableEntityType,
  TagResultGroup,
  TagResultItem,
  TagResultSection,
} from "@/types";

type TagAccessContext = {
  teamId: string;
  userId: string;
  roles: Roles[];
};

type ResolvedAccess = TagAccessContext & {
  contactWhere: Prisma.ContactWhereInput;
  allowedSubmodules: ContactSubmodule[];
};

const resolveAccess = async (
  context: TagAccessContext,
): Promise<ResolvedAccess> => {
  const [contactVisibility, allowedSubmodules] = await Promise.all([
    getContactVisibility({
      teamId: context.teamId,
      userId: context.userId,
      roles: context.roles,
    }),
    getAllowedContactSubmodules(context.teamId, context.userId, context.roles),
  ]);

  return {
    ...context,
    contactWhere: contactVisibility.where,
    allowedSubmodules,
  };
};

const contactEngagementWhere = (
  access: ResolvedAccess,
): Prisma.ContactEngagementWhereInput => ({
  teamId: access.teamId,
  contact: { is: access.contactWhere },
  OR: [
    { restrictedToSubmodule: null },
    ...(access.allowedSubmodules.length
      ? [
          {
            restrictedToSubmodule: {
              in: access.allowedSubmodules,
            },
          },
        ]
      : []),
  ],
});

const visibleFileWhere = (access: ResolvedAccess): Prisma.FileWhereInput => ({
  OR: [
    { organization: { is: { teamId: access.teamId } } },
    { FundingRequest: { is: { teamId: access.teamId } } },
    { donationAgreement: { some: { teamId: access.teamId } } },
    { Transaction: { some: { teamId: access.teamId } } },
    { contact: { is: access.contactWhere } },
  ],
});

const assertEntityAccess = async (
  client: Prisma.TransactionClient,
  access: ResolvedAccess,
  entityType: TaggableEntityType,
  entityId: string,
) => {
  let exists = false;

  switch (entityType) {
    case "CONTACT":
      exists = Boolean(
        await client.contact.findFirst({
          where: { id: entityId, ...access.contactWhere },
          select: { id: true },
        }),
      );
      break;
    case "ORGANIZATION":
      exists = Boolean(
        await client.organization.findFirst({
          where: { id: entityId, teamId: access.teamId },
          select: { id: true },
        }),
      );
      break;
    case "CONTACT_LIST":
      exists = Boolean(
        await client.contactList.findFirst({
          where: { id: entityId, teamId: access.teamId },
          select: { id: true },
        }),
      );
      break;
    case "CONTACT_ENGAGEMENT":
      exists = Boolean(
        await client.contactEngagement.findFirst({
          where: { id: entityId, ...contactEngagementWhere(access) },
          select: { id: true },
        }),
      );
      break;
    case "ORGANIZATION_ENGAGEMENT":
      exists = Boolean(
        await client.organizationEngagement.findFirst({
          where: {
            id: entityId,
            teamId: access.teamId,
            organization: { teamId: access.teamId },
          },
          select: { id: true },
        }),
      );
      break;
    case "EVENT":
      exists = Boolean(
        await client.event.findFirst({
          where: { id: entityId, teamId: access.teamId },
          select: { id: true },
        }),
      );
      break;
    case "FILE":
      exists = Boolean(
        await client.file.findFirst({
          where: { id: entityId, ...visibleFileWhere(access) },
          select: { id: true },
        }),
      );
      break;
  }

  if (!exists) throw new ApiError(404, "Record not found");
};

export const searchTags = async (teamId: string, query = "") => {
  const normalizedQuery = normalizeTagSearchQuery(query);
  return prisma.tag.findMany({
    where: {
      teamId,
      ...(normalizedQuery
        ? { name: { startsWith: normalizedQuery } }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 30,
  });
};

export const getTag = async (teamId: string, tagId: string) => {
  const tag = await prisma.tag.findFirst({ where: { id: tagId, teamId } });
  if (!tag) throw new ApiError(404, "Tag not found");
  return tag;
};

export const updateEntityTags = async (
  context: TagAccessContext,
  entityType: TaggableEntityType,
  entityId: string,
  rawTags: string[],
) => {
  const tags = normalizeTagNames(rawTags);
  const access = await resolveAccess(context);

  await prisma.$transaction(async (tx) => {
    await assertEntityAccess(tx, access, entityType, entityId);

    if (tags.length) {
      await tx.tag.createMany({
        data: tags.map((name) => ({ teamId: context.teamId, name })),
        skipDuplicates: true,
      });
    }

    switch (entityType) {
      case "CONTACT":
        await tx.contact.update({ where: { id: entityId }, data: { tags } });
        break;
      case "ORGANIZATION":
        await tx.organization.update({
          where: { id: entityId },
          data: { tags },
        });
        break;
      case "CONTACT_LIST":
        await tx.contactList.update({
          where: { id: entityId },
          data: { tags },
        });
        break;
      case "CONTACT_ENGAGEMENT":
        await tx.contactEngagement.update({
          where: { id: entityId },
          data: { tags },
        });
        break;
      case "ORGANIZATION_ENGAGEMENT":
        await tx.organizationEngagement.update({
          where: { id: entityId },
          data: { tags },
        });
        break;
      case "EVENT":
        await tx.event.update({ where: { id: entityId }, data: { tags } });
        break;
      case "FILE":
        await tx.file.update({ where: { id: entityId }, data: { tags } });
        break;
    }
  });

  return tags;
};

const group = (
  section: TagResultSection,
  total: number,
  items: TagResultItem[],
  offset = 0,
): TagResultGroup => ({
  section,
  total,
  items,
  hasMore: total > offset + items.length,
});

export const getTagResults = async (
  context: TagAccessContext,
  tagId: string,
  limit = 20,
  offsets: Partial<Record<TagResultSection, number>> = {},
) => {
  const access = await resolveAccess(context);
  const tag = await getTag(context.teamId, tagId);
  const tagFilter = { has: tag.name };
  const contactWhere = {
    ...access.contactWhere,
    tags: tagFilter,
  } satisfies Prisma.ContactWhereInput;
  const organizationWhere = {
    teamId: context.teamId,
    tags: tagFilter,
  } satisfies Prisma.OrganizationWhereInput;
  const listWhere = {
    teamId: context.teamId,
    tags: tagFilter,
  } satisfies Prisma.ContactListWhereInput;
  const contactInteractionWhere = {
    ...contactEngagementWhere(access),
    tags: tagFilter,
  } satisfies Prisma.ContactEngagementWhereInput;
  const organizationInteractionWhere = {
    teamId: context.teamId,
    organization: { teamId: context.teamId },
    tags: tagFilter,
  } satisfies Prisma.OrganizationEngagementWhereInput;
  const eventWhere = {
    teamId: context.teamId,
    tags: tagFilter,
  } satisfies Prisma.EventWhereInput;
  const fileWhere = {
    AND: [visibleFileWhere(access), { tags: tagFilter }],
  } satisfies Prisma.FileWhereInput;

  const [
    contactTotal,
    contacts,
    organizationTotal,
    organizations,
    listTotal,
    lists,
    contactInteractionTotal,
    contactInteractions,
    organizationInteractionTotal,
    organizationInteractions,
    eventTotal,
    events,
    fileTotal,
    files,
  ] = await Promise.all([
    prisma.contact.count({ where: contactWhere }),
    prisma.contact.findMany({
      where: contactWhere,
      orderBy: { updatedAt: "desc" },
      skip: offsets.contacts ?? 0,
      take: limit,
      select: { id: true, name: true, city: true, updatedAt: true },
    }),
    prisma.organization.count({ where: organizationWhere }),
    prisma.organization.findMany({
      where: organizationWhere,
      orderBy: { updatedAt: "desc" },
      skip: offsets.organizations ?? 0,
      take: limit,
      select: { id: true, name: true, email: true, updatedAt: true },
    }),
    prisma.contactList.count({ where: listWhere }),
    prisma.contactList.findMany({
      where: listWhere,
      orderBy: { updatedAt: "desc" },
      skip: offsets.lists ?? 0,
      take: limit,
      select: { id: true, name: true, description: true, updatedAt: true },
    }),
    prisma.contactEngagement.count({ where: contactInteractionWhere }),
    prisma.contactEngagement.findMany({
      where: contactInteractionWhere,
      orderBy: { engagedAt: "desc" },
      take: limit + (offsets.interactions ?? 0),
      select: {
        id: true,
        subject: true,
        message: true,
        source: true,
        engagedAt: true,
        contact: { select: { id: true, name: true } },
      },
    }),
    prisma.organizationEngagement.count({
      where: organizationInteractionWhere,
    }),
    prisma.organizationEngagement.findMany({
      where: organizationInteractionWhere,
      orderBy: { engagedAt: "desc" },
      take: limit + (offsets.interactions ?? 0),
      select: {
        id: true,
        type: true,
        note: true,
        engagedAt: true,
        organization: { select: { id: true, name: true } },
      },
    }),
    prisma.event.count({ where: eventWhere }),
    prisma.event.findMany({
      where: eventWhere,
      orderBy: { startDate: "desc" },
      skip: offsets.events ?? 0,
      take: limit,
      select: { id: true, title: true, location: true, startDate: true },
    }),
    prisma.file.count({ where: fileWhere }),
    prisma.file.findMany({
      where: fileWhere,
      orderBy: { updatedAt: "desc" },
      skip: offsets.files ?? 0,
      take: limit,
      select: { id: true, name: true, url: true, type: true, updatedAt: true },
    }),
  ]);

  const interactions: TagResultItem[] = [
    ...contactInteractions.map((item) => ({
      id: item.id,
      entityType: "CONTACT_ENGAGEMENT" as const,
      title: item.subject || `${item.source} with ${item.contact.name}`,
      description: item.message.slice(0, 180),
      href: `/teams/${context.teamId}/crm/contacts/${item.contact.id}?engagement=${item.id}`,
      date: item.engagedAt.toISOString(),
    })),
    ...organizationInteractions.map((item) => ({
      id: item.id,
      entityType: "ORGANIZATION_ENGAGEMENT" as const,
      title: `${item.type} with ${item.organization.name ?? "Organization"}`,
      description: item.note?.slice(0, 180),
      href: `/teams/${context.teamId}/crm/organizations/${item.organization.id}?engagement=${item.id}`,
      date: item.engagedAt.toISOString(),
    })),
  ]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(offsets.interactions ?? 0, (offsets.interactions ?? 0) + limit);

  const groups: TagResultGroup[] = [
    group(
      "contacts",
      contactTotal,
      contacts.map((item) => ({
        id: item.id,
        entityType: "CONTACT",
        title: item.name,
        description: item.city ?? undefined,
        href: `/teams/${context.teamId}/crm/contacts/${item.id}`,
        date: item.updatedAt.toISOString(),
      })),
      offsets.contacts ?? 0,
    ),
    group(
      "organizations",
      organizationTotal,
      organizations.map((item) => ({
        id: item.id,
        entityType: "ORGANIZATION",
        title: item.name ?? item.email,
        description: item.email,
        href: `/teams/${context.teamId}/crm/organizations/${item.id}`,
        date: item.updatedAt.toISOString(),
      })),
      offsets.organizations ?? 0,
    ),
    group(
      "lists",
      listTotal,
      lists.map((item) => ({
        id: item.id,
        entityType: "CONTACT_LIST",
        title: item.name,
        description: item.description ?? undefined,
        href: `/teams/${context.teamId}/crm/lists/${item.id}`,
        date: item.updatedAt.toISOString(),
      })),
      offsets.lists ?? 0,
    ),
    group(
      "interactions",
      contactInteractionTotal + organizationInteractionTotal,
      interactions,
      offsets.interactions ?? 0,
    ),
    group(
      "events",
      eventTotal,
      events.map((item) => ({
        id: item.id,
        entityType: "EVENT",
        title: item.title,
        description: item.location ?? undefined,
        href: `/teams/${context.teamId}/crm/events/${item.id}`,
        date: item.startDate.toISOString(),
      })),
      offsets.events ?? 0,
    ),
    group(
      "files",
      fileTotal,
      files.map((item) => ({
        id: item.id,
        entityType: "FILE",
        title: item.name || item.url,
        description: item.type,
        href: `/teams/${context.teamId}/crm/files/${item.id}`,
        date: item.updatedAt.toISOString(),
      })),
      offsets.files ?? 0,
    ),
  ];

  return { tag, groups };
};
