import { Prisma } from "@prisma/client";
import { stringifyCsv } from "@/lib/csv";
import prisma from "@/lib/prisma";
import { getTeamContacts } from "@/services/contacts";
import { ensureDefaultGroup } from "@/services/groups";
import {
  type ContactFilter,
  ContactListType,
  type Contact as ContactType,
  Roles,
} from "@/types";

type CreateContactListInput = {
  teamId: string;
  name: string;
  description?: string;
  contactIds?: string[];
  type?: ContactListType;
  filters?: ContactFilter[];
};

type UpdateContactListInput = {
  id: string;
  teamId: string;
  name?: string;
  description?: string;
  type?: ContactListType;
  filters?: ContactFilter[];
};

type AddContactsInput = {
  listId: string;
  teamId: string;
  contactIds: string[];
};

type RemoveContactsInput = {
  listId: string;
  teamId: string;
  contactIds: string[];
};

const parseFilters = (
  value: Prisma.JsonValue | null | undefined,
): ContactFilter[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value as ContactFilter[];
  }

  return [];
};

const buildContactVisibilityFilter = async (
  teamId: string,
  userId?: string,
  roles: Roles[] = [],
): Promise<Prisma.ContactListMemberWhereInput | undefined> => {
  if (!userId || roles.includes(Roles.Admin)) {
    return undefined;
  }

  await ensureDefaultGroup(teamId);

  const memberships = await prisma.userGroup.findMany({
    where: {
      userId,
      group: {
        teamId,
      },
    },
    select: {
      groupId: true,
      group: {
        select: {
          canAccessAllContacts: true,
        },
      },
    },
  });

  if (memberships.some((membership) => membership.group.canAccessAllContacts)) {
    return undefined;
  }

  const accessibleGroupIds = memberships
    .map((membership) => membership.groupId)
    .filter((id): id is string => Boolean(id));

  if (!accessibleGroupIds.length) {
    return {
      contact: {
        groups: {
          none: {},
        },
      },
    };
  }

  return {
    contact: {
      OR: [
        { groups: { none: {} } },
        { groups: { some: { groupId: { in: accessibleGroupIds } } } },
      ],
    },
  };
};

const getTeamContactLists = async (
  teamId: string,
  userId?: string,
  roles: Roles[] = [],
) => {
  const contactAccessWhere = await buildContactVisibilityFilter(
    teamId,
    userId,
    roles,
  );

  const lists = await prisma.contactList.findMany({
    where: {
      teamId,
    },
    include: {
      contacts: {
        ...(contactAccessWhere ? { where: contactAccessWhere } : {}),
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  const results = await Promise.all(
    lists.map(async (list) => {
      const filters = parseFilters(list.filters as Prisma.JsonValue | null);

      if (list.type === ContactListType.SMART) {
        const smartContacts = await getTeamContacts(
          teamId,
          undefined,
          userId,
          filters,
          roles,
        );

        return {
          id: list.id,
          teamId: list.teamId,
          name: list.name,
          description: list.description ?? undefined,
          type: list.type,
          filters,
          contactCount: smartContacts.length,
          contacts: smartContacts.map((contact) => ({
            id: contact.id,
            name: contact.name,
            email: contact.email ?? null,
            phone: contact.phone ?? null,
          })),
          createdAt: list.createdAt,
          updatedAt: list.updatedAt,
        };
      }

      return {
        id: list.id,
        teamId: list.teamId,
        name: list.name,
        description: list.description ?? undefined,
        type: list.type,
        filters,
        contactCount: list.contacts.length,
        contacts: list.contacts.map((c) => ({
          id: c.contact.id,
          name: c.contact.name,
          email: c.contact.email,
          phone: c.contact.phone,
        })),
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
      };
    }),
  );

  return results;
};

const getContactListById = async (
  listId: string,
  teamId: string,
  userId?: string,
  roles: Roles[] = [],
) => {
  const contactAccessWhere = await buildContactVisibilityFilter(
    teamId,
    userId,
    roles,
  );

  const list = await prisma.contactList.findFirst({
    where: {
      id: listId,
      teamId,
    },
    include: {
      contacts: {
        ...(contactAccessWhere ? { where: contactAccessWhere } : {}),
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      },
    },
  });

  if (!list) {
    return null;
  }

  const filters = parseFilters(list.filters as Prisma.JsonValue | null);

  if (list.type === ContactListType.SMART) {
    const smartContacts = await getTeamContacts(
      teamId,
      undefined,
      userId,
      filters,
      roles,
    );

    return {
      id: list.id,
      teamId: list.teamId,
      name: list.name,
      description: list.description ?? undefined,
      type: list.type,
      filters,
      contacts: smartContacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
      })),
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
    };
  }

  return {
    id: list.id,
    teamId: list.teamId,
    name: list.name,
    description: list.description ?? undefined,
    type: list.type,
    filters,
    contacts: list.contacts.map((c) => ({
      id: c.contact.id,
      name: c.contact.name,
      email: c.contact.email,
      phone: c.contact.phone,
    })),
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
};

const createContactList = async (input: CreateContactListInput) => {
  const {
    teamId,
    name,
    description,
    contactIds,
    type = ContactListType.MANUAL,
    filters,
  } = input;

  const isSmartList = type === ContactListType.SMART;
  const filtersData = isSmartList
    ? ((filters ?? []) as Prisma.InputJsonValue)
    : undefined;

  const list = await prisma.contactList.create({
    data: {
      teamId,
      name,
      description,
      type,
      filters: filtersData,
      contacts:
        !isSmartList && contactIds && contactIds.length > 0
          ? {
              create: contactIds.map((contactId) => ({
                contactId,
              })),
            }
          : undefined,
    },
    include: {
      _count: {
        select: {
          contacts: true,
        },
      },
    },
  });

  const parsedFilters = parseFilters(list.filters as Prisma.JsonValue | null);

  return {
    id: list.id,
    teamId: list.teamId,
    name: list.name,
    description: list.description ?? undefined,
    type: list.type,
    filters: parsedFilters,
    contactCount:
      list.type === ContactListType.MANUAL ? list._count.contacts : 0,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
};

const updateContactList = async (input: UpdateContactListInput) => {
  const { id, teamId, name, description, type, filters } = input;

  const existing = await prisma.contactList.findFirst({
    where: {
      id,
      teamId,
    },
    select: {
      type: true,
    },
  });

  if (!existing) {
    throw new Error("List not found");
  }

  const targetType = type ?? existing.type;

  const data: Prisma.ContactListUpdateInput = {};

  if (typeof name !== "undefined") {
    data.name = name;
  }

  if (typeof description !== "undefined") {
    data.description = description;
  }

  if (typeof type !== "undefined") {
    data.type = type;
  }

  if (targetType === ContactListType.SMART) {
    if (typeof filters !== "undefined") {
      data.filters = (filters ?? []) as Prisma.InputJsonValue;
    } else if (existing.type !== ContactListType.SMART) {
      data.filters = [] as Prisma.InputJsonValue;
    }
  } else if (
    existing.type === ContactListType.SMART ||
    typeof filters !== "undefined"
  ) {
    data.filters = Prisma.JsonNull;
  }

  const list = await prisma.contactList.update({
    where: {
      id,
      teamId,
    },
    data,
    include: {
      _count: {
        select: {
          contacts: true,
        },
      },
    },
  });

  const parsedFilters = parseFilters(list.filters as Prisma.JsonValue | null);

  return {
    id: list.id,
    teamId: list.teamId,
    name: list.name,
    description: list.description ?? undefined,
    type: list.type,
    filters: parsedFilters,
    contactCount:
      list.type === ContactListType.MANUAL ? list._count.contacts : 0,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
};

const deleteContactLists = async (teamId: string, ids: string[]) => {
  if (!ids.length) {
    return;
  }

  await prisma.contactList.deleteMany({
    where: {
      id: { in: ids },
      teamId,
    },
  });
};

const addContactsToList = async (input: AddContactsInput) => {
  const { listId, teamId, contactIds } = input;

  // Verify list belongs to team
  const list = await prisma.contactList.findFirst({
    where: {
      id: listId,
      teamId,
    },
  });

  if (!list) {
    throw new Error("List not found");
  }

  if (list.type === ContactListType.SMART) {
    throw new Error("Cannot manually modify contacts for smart lists");
  }

  // Get existing contacts in list
  const existing = await prisma.contactListMember.findMany({
    where: {
      listId,
      contactId: { in: contactIds },
    },
    select: { contactId: true },
  });

  const existingContactIds = new Set(existing.map((m) => m.contactId));
  const newContactIds = contactIds.filter((id) => !existingContactIds.has(id));

  if (newContactIds.length > 0) {
    await prisma.contactListMember.createMany({
      data: newContactIds.map((contactId) => ({
        listId,
        contactId,
      })),
    });
  }
};

const removeContactsFromList = async (input: RemoveContactsInput) => {
  const { listId, teamId, contactIds } = input;

  // Verify list belongs to team
  const list = await prisma.contactList.findFirst({
    where: {
      id: listId,
      teamId,
    },
  });

  if (!list) {
    throw new Error("List not found");
  }

  if (list.type === ContactListType.SMART) {
    throw new Error("Cannot manually modify contacts for smart lists");
  }

  await prisma.contactListMember.deleteMany({
    where: {
      listId,
      contactId: { in: contactIds },
    },
  });
};
const exportContactList = async (
  listId: string,
  teamId: string,
  userId?: string,
  roles: Roles[] = [],
  options: { fields: string[]; attributes: string[] } = {
    fields: [],
    attributes: [],
  },
) => {
  const contactAccessWhere = await buildContactVisibilityFilter(
    teamId,
    userId,
    roles,
  );

  const list = await prisma.contactList.findFirst({
    where: {
      id: listId,
      teamId,
    },
    include: {
      contacts: {
        ...(contactAccessWhere ? { where: contactAccessWhere } : {}),
        select: {
          contactId: true,
        },
      },
    },
  });

  if (!list) {
    throw new Error("List not found");
  }

  let contacts: ContactType[] = [];

  if (list.type === ContactListType.SMART) {
    const filters = parseFilters(list.filters as Prisma.JsonValue | null);
    contacts = await getTeamContacts(teamId, undefined, userId, filters, roles);
  } else {
    const contactIds = list.contacts.map((c) => c.contactId);
    if (contactIds.length > 0) {
      contacts = await getTeamContacts(
        teamId,
        undefined,
        userId,
        [{ type: "contactIds", contactIds }],
        roles,
      );
    }
  }

  const { fields, attributes } = options;
  const headers = [...fields, ...attributes];

  const rows = contacts.map((contact) => {
    return headers.map((header) => {
      if (fields.includes(header)) {
        const val = contact[header as keyof typeof contact];
        if (val instanceof Date) {
          return val.toISOString();
        }
        return val ? String(val) : "";
      } else {
        const attr = contact.profileAttributes.find((a) => a.key === header);
        if (!attr) return "";
        if (attr.type === "LOCATION") {
          return (
            attr.value.label ?? `${attr.value.latitude},${attr.value.longitude}`
          );
        }
        return String(attr.value);
      }
    });
  });

  return stringifyCsv(headers, rows);
};

export {
  addContactsToList,
  createContactList,
  deleteContactLists,
  exportContactList,
  getContactListById,
  getTeamContactLists,
  removeContactsFromList,
  updateContactList,
};
