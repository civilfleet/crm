import { Prisma } from "@prisma/client";
import { normalizeCountryCode } from "@/lib/countries";
import { normalizePostalCode } from "@/lib/geo";
import prisma from "@/lib/prisma";
import { generateSlug } from "@/lib/slug";
import {
  logContactCreation,
  logFieldUpdate,
} from "@/services/contact-change-logs";

type EventContactInput = {
  contactId: string;
  roleIds?: string[];
};

type CreateEventInput = {
  teamId: string;
  title: string;
  slug?: string;
  description?: string;
  location?: string;
  eventTypeId?: string;
  isOnline?: boolean;
  expectedGuests?: number;
  hasRemuneration?: boolean;
  address?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  timeZone?: string;
  merchNeeded?: boolean;
  startDate: string;
  endDate?: string;
  isPublic?: boolean;
  contacts?: EventContactInput[];
  listIds?: string[];
};

type UpdateEventInput = {
  id: string;
  teamId: string;
  title: string;
  slug?: string;
  description?: string;
  location?: string;
  eventTypeId?: string;
  isOnline?: boolean;
  expectedGuests?: number;
  hasRemuneration?: boolean;
  address?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  timeZone?: string;
  merchNeeded?: boolean;
  startDate: string;
  endDate?: string;
  isPublic?: boolean;
  contacts?: EventContactInput[];
  listIds?: string[];
};

type EventWithContacts = Prisma.EventGetPayload<{
  include: {
    eventType: true;
    contacts: {
      include: {
        contact: true;
        roles: {
          include: {
            eventRole: true;
          };
        };
      };
    };
    lists: {
      include: {
        list: true;
      };
    };
    _count: {
      select: {
        registrations: true;
      };
    };
  };
}>;

type EventType = {
  id: string;
  teamId: string;
  eventTypeId?: string;
  eventType?: {
    id: string;
    teamId: string;
    name: string;
    color?: string;
  };
  title: string;
  slug?: string;
  description?: string;
  location?: string;
  isOnline?: boolean;
  expectedGuests?: number;
  hasRemuneration?: boolean;
  address?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  timeZone?: string;
  merchNeeded?: boolean;
  startDate: Date;
  endDate?: Date;
  isPublic: boolean;
  registrationCount: number;
  createdAt: Date;
  updatedAt: Date;
  contacts: Array<{
    id: string;
    name: string;
    email?: string;
    phone?: string;
    roles: Array<{
      id: string;
      name: string;
      color?: string;
    }>;
  }>;
  lists: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
};

const ensureSlug = (raw: string, fallback: string) => {
  const source = raw || fallback;
  const slug = generateSlug(source);

  if (!slug) {
    throw new Error("Slug cannot be empty. Provide letters or numbers.");
  }

  return slug;
};

const mapEvent = (event: EventWithContacts): EventType => ({
  id: event.id,
  teamId: event.teamId,
  eventTypeId: event.eventTypeId ?? undefined,
  eventType: event.eventType
    ? {
        id: event.eventType.id,
        teamId: event.eventType.teamId,
        name: event.eventType.name,
        color: event.eventType.color ?? undefined,
      }
    : undefined,
  title: event.title,
  slug: event.slug ?? undefined,
  description: event.description ?? undefined,
  location: event.location ?? undefined,
  isOnline: event.isOnline,
  expectedGuests: event.expectedGuests ?? undefined,
  hasRemuneration: event.hasRemuneration,
  address: event.address ?? undefined,
  city: event.city ?? undefined,
  postalCode: event.postalCode ?? undefined,
  state: event.state ?? undefined,
  timeZone: event.timeZone ?? undefined,
  merchNeeded: event.merchNeeded,
  startDate: event.startDate,
  endDate: event.endDate ?? undefined,
  isPublic: event.isPublic,
  registrationCount: event._count.registrations,
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
  contacts: event.contacts.map((ec) => ({
    id: ec.contact.id,
    name: ec.contact.name,
    email: ec.contact.email ?? undefined,
    phone: ec.contact.phone ?? undefined,
    roles: ec.roles.map((r) => ({
      id: r.eventRole.id,
      name: r.eventRole.name,
      color: r.eventRole.color ?? undefined,
    })),
  })),
  lists: event.lists.map((item) => ({
    id: item.list.id,
    name: item.list.name,
    description: item.list.description ?? undefined,
  })),
});
type EventFilters = {
  eventTypeId?: string;
  from?: string;
  to?: string;
  state?: string;
};

type PublicEventFilters = {
  query?: string;
  eventTypeId?: string;
  from?: string;
  to?: string;
  state?: string;
  isOnline?: boolean;
  postalCode?: string;
  countryCode?: string;
  radiusKm?: number;
};

type PublicEventListItem = {
  id: string;
  teamId: string;
  title: string;
  slug?: string;
  description?: string;
  location?: string;
  isOnline?: boolean;
  expectedGuests?: number;
  hasRemuneration?: boolean;
  address?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  timeZone?: string;
  merchNeeded?: boolean;
  startDate: Date;
  endDate?: Date;
  eventType?: {
    id: string;
    name: string;
    color?: string;
  };
};

export const getTeamEvents = async (
  teamId: string,
  query?: string,
  filters: EventFilters = {},
) => {
  const where: Prisma.EventWhereInput = {
    teamId,
  };
  if (filters.eventTypeId) {
    where.eventTypeId = filters.eventTypeId;
  }

  if (filters.state) {
    where.state = {
      contains: filters.state,
      mode: "insensitive",
    };
  }

  if (filters.from || filters.to) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.from && !Number.isNaN(Date.parse(filters.from))) {
      range.gte = new Date(filters.from);
    }
    if (filters.to && !Number.isNaN(Date.parse(filters.to))) {
      const parsed = new Date(filters.to);
      if (filters.to.length === 10) {
        parsed.setHours(23, 59, 59, 999);
      }
      range.lte = parsed;
    }
    if (Object.keys(range).length > 0) {
      where.startDate = range;
    }
  }

  if (query) {
    where.OR = [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { location: { contains: query, mode: "insensitive" } },
      { address: { contains: query, mode: "insensitive" } },
      { city: { contains: query, mode: "insensitive" } },
      { postalCode: { contains: query, mode: "insensitive" } },
      { state: { contains: query, mode: "insensitive" } },
      {
        contacts: {
          some: {
            contact: {
              name: { contains: query, mode: "insensitive" },
            },
          },
        },
      },
    ];
  }
  const events = await prisma.event.findMany({
    where,
    include: {
      eventType: true,
      contacts: {
        include: {
          contact: true,
          roles: {
            include: {
              eventRole: true,
            },
          },
        },
      },
      lists: {
        include: {
          list: true,
        },
      },
      _count: {
        select: {
          registrations: true,
        },
      },
    },
    orderBy: {
      startDate: "desc",
    },
  });
  return events.map(mapEvent);
};
export const getEventById = async (eventId: string, teamId: string) => {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      teamId,
    },
    include: {
      eventType: true,
      contacts: {
        include: {
          contact: true,
          roles: {
            include: {
              eventRole: true,
            },
          },
        },
      },
      lists: {
        include: {
          list: true,
        },
      },
      _count: {
        select: {
          registrations: true,
        },
      },
    },
  });
  if (!event) {
    return null;
  }
  return mapEvent(event);
};
export const createEvent = async (input: CreateEventInput) => {
  const {
    teamId,
    title,
    slug,
    description,
    location,
    eventTypeId,
    isOnline = false,
    expectedGuests,
    hasRemuneration = false,
    address,
    city,
    postalCode,
    state,
    timeZone,
    merchNeeded = false,
    startDate,
    endDate,
    isPublic = false,
    contacts = [],
    listIds = [],
  } = input;
  return prisma.$transaction(async (tx) => {
    const eventSlug = ensureSlug(slug ?? "", title);
    const existingEvent = await tx.event.findFirst({
      where: { teamId, slug: eventSlug },
    });
    if (existingEvent) {
      throw new Error(
        "Slug is already in use for this team. Choose a different slug.",
      );
    }
    const event = await tx.event.create({
      data: {
        teamId,
        title,
        slug: eventSlug,
        description,
        location,
        eventTypeId: eventTypeId ?? null,
        isOnline,
        expectedGuests:
          typeof expectedGuests === "number" ? expectedGuests : null,
        hasRemuneration,
        address: address?.trim() || null,
        city: city?.trim() || null,
        postalCode: postalCode?.trim() || null,
        state: state?.trim() || null,
        timeZone: timeZone?.trim() || null,
        merchNeeded,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        isPublic,
      },
    });
    if (contacts.length > 0) {
      const contactIds = contacts.map((c) => c.contactId);
      const validContacts = await tx.contact.findMany({
        where: {
          id: { in: contactIds },
          teamId,
        },
        select: { id: true },
      });
      const validContactIds = new Set(validContacts.map((c) => c.id));
      const validContactsWithRoles = contacts.filter((c) =>
        validContactIds.has(c.contactId),
      );
      if (validContactsWithRoles.length > 0) {
        await tx.eventContact.createMany({
          data: validContactsWithRoles.map((c) => ({
            eventId: event.id,
            contactId: c.contactId,
          })),
        });
        for (const contact of validContactsWithRoles) {
          if (contact.roleIds && contact.roleIds.length > 0) {
            const validRoles = await tx.eventRole.findMany({
              where: {
                id: { in: contact.roleIds },
                teamId,
              },
              select: { id: true },
            });
            const validRoleIds = validRoles.map((r) => r.id);
            if (validRoleIds.length > 0) {
              await tx.eventContactRole.createMany({
                data: validRoleIds.map((roleId) => ({
                  eventId: event.id,
                  contactId: contact.contactId,
                  eventRoleId: roleId,
                })),
              });
            }
          }
        }
      }
    }
    if (listIds.length > 0) {
      const validLists = await tx.contactList.findMany({
        where: {
          id: { in: listIds },
          teamId,
        },
        select: { id: true },
      });
      const validListIds = validLists.map((list) => list.id);
      if (validListIds.length > 0) {
        await tx.eventList.createMany({
          data: validListIds.map((listId) => ({
            eventId: event.id,
            listId,
          })),
        });
      }
    }
    const created = await tx.event.findUniqueOrThrow({
      where: { id: event.id },
      include: {
        eventType: true,
        contacts: {
          include: {
            contact: true,
            roles: {
              include: {
                eventRole: true,
              },
            },
          },
        },
        lists: {
          include: {
            list: true,
          },
        },
        _count: {
          select: {
            registrations: true,
          },
        },
      },
    });
    return mapEvent(created);
  });
};
export const updateEvent = async (input: UpdateEventInput) => {
  const {
    id,
    teamId,
    title,
    slug,
    description,
    location,
    eventTypeId,
    isOnline,
    expectedGuests,
    hasRemuneration,
    address,
    city,
    postalCode,
    state,
    timeZone,
    merchNeeded,
    startDate,
    endDate,
    isPublic,
    contacts = [],
    listIds = [],
  } = input;
  return prisma.$transaction(async (tx) => {
    const existingEvent = await tx.event.findFirst({
      where: { id, teamId },
    });
    if (!existingEvent) {
      throw new Error("Event not found");
    }
    let eventSlug = existingEvent.slug ?? null;
    if (slug !== undefined) {
      eventSlug = ensureSlug(slug, title);
      const conflictingEvent = await tx.event.findFirst({
        where: { teamId, slug: eventSlug, id: { not: id } },
      });
      if (conflictingEvent) {
        throw new Error(
          "Slug is already in use for this team. Choose a different slug.",
        );
      }
    } else if (!eventSlug) {
      eventSlug = ensureSlug("", title);
    }
    const expectedGuestsProvided = Object.hasOwn(input, "expectedGuests");
    const event = await tx.event.update({
      where: { id },
      data: {
        title,
        slug: eventSlug,
        description,
        location,
        eventTypeId: eventTypeId ?? null,
        isOnline: isOnline !== undefined ? isOnline : existingEvent.isOnline,
        expectedGuests: expectedGuestsProvided
          ? (expectedGuests ?? null)
          : existingEvent.expectedGuests,
        hasRemuneration:
          hasRemuneration !== undefined
            ? hasRemuneration
            : existingEvent.hasRemuneration,
        address: address === undefined ? existingEvent.address : address,
        city: city === undefined ? existingEvent.city : city,
        postalCode:
          postalCode === undefined ? existingEvent.postalCode : postalCode,
        state: state === undefined ? existingEvent.state : state,
        timeZone: timeZone === undefined ? existingEvent.timeZone : timeZone,
        merchNeeded:
          merchNeeded !== undefined ? merchNeeded : existingEvent.merchNeeded,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        isPublic: isPublic !== undefined ? isPublic : existingEvent.isPublic,
      },
    });
    await tx.eventContact.deleteMany({
      where: { eventId: id },
    });
    if (contacts.length > 0) {
      const contactIds = contacts.map((c) => c.contactId);
      const validContacts = await tx.contact.findMany({
        where: {
          id: { in: contactIds },
          teamId,
        },
        select: { id: true },
      });
      const validContactIds = new Set(validContacts.map((c) => c.id));
      const validContactsWithRoles = contacts.filter((c) =>
        validContactIds.has(c.contactId),
      );
      if (validContactsWithRoles.length > 0) {
        await tx.eventContact.createMany({
          data: validContactsWithRoles.map((c) => ({
            eventId: event.id,
            contactId: c.contactId,
          })),
        });
        for (const contact of validContactsWithRoles) {
          if (contact.roleIds && contact.roleIds.length > 0) {
            const validRoles = await tx.eventRole.findMany({
              where: {
                id: { in: contact.roleIds },
                teamId,
              },
              select: { id: true },
            });
            const validRoleIds = validRoles.map((r) => r.id);
            if (validRoleIds.length > 0) {
              await tx.eventContactRole.createMany({
                data: validRoleIds.map((roleId) => ({
                  eventId: event.id,
                  contactId: contact.contactId,
                  eventRoleId: roleId,
                })),
              });
            }
          }
        }
      }
    }
    await tx.eventList.deleteMany({
      where: { eventId: id },
    });
    if (listIds.length > 0) {
      const validLists = await tx.contactList.findMany({
        where: {
          id: { in: listIds },
          teamId,
        },
        select: { id: true },
      });
      const validListIds = validLists.map((list) => list.id);
      if (validListIds.length > 0) {
        await tx.eventList.createMany({
          data: validListIds.map((listId) => ({
            eventId: event.id,
            listId,
          })),
        });
      }
    }
    const updated = await tx.event.findUniqueOrThrow({
      where: { id: event.id },
      include: {
        eventType: true,
        contacts: {
          include: {
            contact: true,
            roles: {
              include: {
                eventRole: true,
              },
            },
          },
        },
        lists: {
          include: {
            list: true,
          },
        },
        _count: {
          select: {
            registrations: true,
          },
        },
      },
    });
    return mapEvent(updated);
  });
};
export const deleteEvents = async (teamId: string, ids: string[]) => {
  if (!ids.length) {
    return;
  }
  await prisma.event.deleteMany({
    where: {
      id: { in: ids },
      teamId,
    },
  });
};

const buildPublicEventWhere = (
  teamId: string,
  filters: PublicEventFilters,
  eventIds?: string[],
) => {
  const where: Prisma.EventWhereInput = {
    teamId,
    isPublic: true,
  };

  if (filters.eventTypeId) {
    where.eventTypeId = filters.eventTypeId;
  }

  if (typeof filters.isOnline === "boolean") {
    where.isOnline = filters.isOnline;
  }

  if (filters.state) {
    where.state = {
      contains: filters.state,
      mode: "insensitive",
    };
  }

  if (filters.from || filters.to) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.from && !Number.isNaN(Date.parse(filters.from))) {
      range.gte = new Date(filters.from);
    }
    if (filters.to && !Number.isNaN(Date.parse(filters.to))) {
      const parsed = new Date(filters.to);
      if (filters.to.length === 10) {
        parsed.setHours(23, 59, 59, 999);
      }
      range.lte = parsed;
    }
    if (Object.keys(range).length > 0) {
      where.startDate = range;
    }
  }

  if (filters.query) {
    where.OR = [
      { title: { contains: filters.query, mode: "insensitive" } },
      { description: { contains: filters.query, mode: "insensitive" } },
      { location: { contains: filters.query, mode: "insensitive" } },
      { address: { contains: filters.query, mode: "insensitive" } },
      { city: { contains: filters.query, mode: "insensitive" } },
      { postalCode: { contains: filters.query, mode: "insensitive" } },
      { state: { contains: filters.query, mode: "insensitive" } },
      { eventType: { name: { contains: filters.query, mode: "insensitive" } } },
    ];
  }

  if (eventIds) {
    where.id = { in: eventIds };
  }

  return where;
};

const getPublicEventIdsWithinRadius = async (
  teamId: string,
  postalCode?: string,
  countryCode?: string,
  radiusKm?: number,
) => {
  const normalizedPostal = normalizePostalCode(postalCode);
  const normalizedCountry = normalizeCountryCode(countryCode);
  const radius = typeof radiusKm === "number" ? radiusKm : Number(radiusKm);

  if (!normalizedPostal || !normalizedCountry || !Number.isFinite(radius)) {
    return null;
  }

  const radiusMeters = radius * 1000;

  const nearby = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`
      WITH origin AS (
        SELECT "latitude", "longitude"
        FROM "PostalCodeCentroid"
        WHERE "countryCode" = ${normalizedCountry}
          AND "postalCode" = ${normalizedPostal}
        LIMIT 1
      )
      SELECT e."id"
      FROM "Event" e
      JOIN "PostalCodeCentroid" pc
        ON pc."countryCode" = ${normalizedCountry}
       AND pc."postalCode" = e."postalCode"
      CROSS JOIN origin
      WHERE e."teamId" = ${teamId}
        AND e."isPublic" = true
        AND e."postalCode" IS NOT NULL
        AND pc."latitude" IS NOT NULL
        AND pc."longitude" IS NOT NULL
        AND ST_DWithin(
          geography(ST_MakePoint(pc."longitude", pc."latitude")),
          geography(ST_MakePoint(origin."longitude", origin."latitude")),
          ${radiusMeters}
        )
    `,
  );

  return nearby.map((row) => row.id);
};

export const getPublicEvents = async (
  teamId: string,
  filters: PublicEventFilters,
  page = 1,
  pageSize = 12,
) => {
  const safePageSize = Math.min(Math.max(pageSize, 1), 50);
  const safePage = Math.max(page, 1);

  let eventIds: string[] | undefined;
  if (filters.postalCode && filters.countryCode && filters.radiusKm) {
    const nearbyIds = await getPublicEventIdsWithinRadius(
      teamId,
      filters.postalCode,
      filters.countryCode,
      filters.radiusKm,
    );
    if (nearbyIds && nearbyIds.length === 0) {
      return {
        items: [] as PublicEventListItem[],
        total: 0,
        page: safePage,
        pageSize: safePageSize,
      };
    }
    if (nearbyIds) {
      eventIds = nearbyIds;
    }
  }

  const where = buildPublicEventWhere(teamId, filters, eventIds);

  const [total, events] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      select: {
        id: true,
        teamId: true,
        title: true,
        slug: true,
        description: true,
        location: true,
        isOnline: true,
        expectedGuests: true,
        hasRemuneration: true,
        address: true,
        city: true,
        postalCode: true,
        state: true,
        timeZone: true,
        merchNeeded: true,
        startDate: true,
        endDate: true,
        eventType: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: {
        startDate: "desc",
      },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
  ]);

  return {
    items: events.map((event) => ({
      ...event,
      eventType: event.eventType
        ? {
            id: event.eventType.id,
            name: event.eventType.name,
            color: event.eventType.color ?? undefined,
          }
        : undefined,
    })),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
};
// Get a public event by slug (for public registration pages)
export const getPublicEventBySlug = async (teamId: string, slug: string) => {
  const event = await prisma.event.findFirst({
    where: {
      teamId,
      slug,
      isPublic: true,
    },
    select: {
      id: true,
      teamId: true,
      title: true,
      slug: true,
      description: true,
      location: true,
      eventTypeId: true,
      isOnline: true,
      expectedGuests: true,
      hasRemuneration: true,
      address: true,
      city: true,
      postalCode: true,
      state: true,
      timeZone: true,
      merchNeeded: true,
      startDate: true,
      endDate: true,
      team: {
        select: {
          name: true,
          email: true,
          website: true,
        },
      },
    },
  });
  return event;
};
// Create a new event registration
type CreateEventRegistrationInput = {
  eventId: string;
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  customData?: Record<string, unknown>;
};
export const createEventRegistration = async (
  input: CreateEventRegistrationInput,
) => {
  const { eventId, name, email, phone, notes, customData } = input;

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findFirst({
      where: {
        id: eventId,
        isPublic: true,
      },
      select: {
        teamId: true,
        title: true,
      },
    });

    if (!event) {
      throw new Error("Event not found or not accepting registrations");
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      throw new Error("Email is required");
    }
    const trimmedPhone = phone?.trim() || undefined;

    let contact = await tx.contact.findFirst({
      where: {
        teamId: event.teamId,
        ...(trimmedEmail
          ? {
              email: {
                equals: trimmedEmail,
                mode: "insensitive",
              },
            }
          : {}),
      },
    });

    if (!contact && trimmedPhone) {
      contact = await tx.contact.findFirst({
        where: {
          teamId: event.teamId,
          phone: trimmedPhone,
        },
      });
    }

    if (contact) {
      const contactUpdates: Prisma.ContactUpdateInput = {};
      const updatedFields: Array<{
        field: string;
        oldValue: unknown;
        newValue: unknown;
      }> = [];

      if ((!contact.name || contact.name.trim().length === 0) && trimmedName) {
        contactUpdates.name = trimmedName;
        updatedFields.push({
          field: "name",
          oldValue: contact.name,
          newValue: trimmedName,
        });
      }

      if (!contact.email && trimmedEmail) {
        contactUpdates.email = trimmedEmail;
        updatedFields.push({
          field: "email",
          oldValue: contact.email,
          newValue: trimmedEmail,
        });
      }

      if (!contact.phone && trimmedPhone) {
        contactUpdates.phone = trimmedPhone;
        updatedFields.push({
          field: "phone",
          oldValue: contact.phone,
          newValue: trimmedPhone,
        });
      }

      if (Object.keys(contactUpdates).length > 0) {
        contact = await tx.contact.update({
          where: { id: contact.id },
          data: contactUpdates,
        });

        for (const updatedField of updatedFields) {
          await logFieldUpdate(
            contact.id,
            updatedField.field,
            updatedField.oldValue,
            updatedField.newValue,
            undefined,
            undefined,
            tx,
          );
        }
      }
    } else {
      contact = await tx.contact.create({
        data: {
          teamId: event.teamId,
          name: trimmedName,
          email: trimmedEmail,
          phone: trimmedPhone,
        },
      });

      await logContactCreation(contact.id, undefined, undefined, tx, {
        source: "event-registration",
        eventId,
        eventTitle: event.title ?? null,
      });
    }

    const registration = await tx.eventRegistration.create({
      data: {
        eventId,
        contactId: contact.id,
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        notes,
        customData: customData ? JSON.parse(JSON.stringify(customData)) : null,
      },
      include: {
        contact: true,
      },
    });

    return registration;
  });
};
// Get registrations for an event
export const getEventRegistrations = async (
  eventId: string,
  teamId: string,
) => {
  // Verify event belongs to team
  const event = await prisma.event.findFirst({
    where: { id: eventId, teamId },
  });
  if (!event) {
    throw new Error("Event not found");
  }
  const registrations = await prisma.eventRegistration.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    include: {
      contact: true,
    },
  });
  return registrations;
};