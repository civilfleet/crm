import { type Prisma, Roles } from "@prisma/client";
import { auth } from "@/auth";
import { chainOrderBy, type RecordSort } from "@/lib/list-request";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import {
  getPrimaryEmail,
  primaryContactEmailSelect,
} from "@/services/contact-emails";
import type { OrganizationFieldFilter } from "@/validations/organization-filters";

type Organization = {
  name?: string;
  email: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  phone?: string;
  website?: string;
  taxExemptionCertificate?: string;
  articlesOfAssociation?: string;
  logo?: string;
  taxID?: string;
  orgTypeId?: string;
  profileData?: Prisma.InputJsonValue;
  contactPersonId?: string;
  teamId?: string;
  isFilledByOrg: boolean;
  portalAccessEnabled?: boolean;
  bankDetails?: {
    accountHolder?: string;
    iban?: string;
    bic?: string;
    bankName?: string;
  };
  user?: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  };
};

const syncOrganizationFieldValues = async (
  tx: Prisma.TransactionClient,
  organizationId: string,
  orgTypeId: string | null | undefined,
  profileData: Record<string, unknown> | undefined,
) => {
  if (!orgTypeId) {
    await tx.organizationFieldValue.deleteMany({
      where: { organizationId },
    });
    return;
  }

  const orgType = await tx.organizationType.findFirst({
    where: { id: orgTypeId },
    select: { schema: true },
  });
  const schema =
    (orgType?.schema as Array<{
      key: string;
      type: string;
    }>) ?? [];

  const keys = new Set(schema.map((field) => field.key));

  await tx.organizationFieldValue.deleteMany({
    where: {
      organizationId,
      key: { notIn: Array.from(keys) },
    },
  });

  for (const field of schema) {
    const rawValue = profileData?.[field.key];
    const data: {
      key: string;
      type: string;
      stringValue?: string | null;
      numberValue?: number | null;
      dateValue?: Date | null;
      booleanValue?: boolean | null;
    } = {
      key: field.key,
      type: field.type,
    };

    switch (field.type) {
      case "NUMBER": {
        const parsed =
          typeof rawValue === "number"
            ? rawValue
            : typeof rawValue === "string"
              ? Number(rawValue)
              : undefined;
        data.numberValue = Number.isFinite(parsed) ? parsed : null;
        break;
      }
      case "DATE": {
        if (typeof rawValue === "string" && rawValue) {
          const parsed = new Date(rawValue);
          data.dateValue = Number.isNaN(parsed.getTime()) ? null : parsed;
        } else {
          data.dateValue = null;
        }
        break;
      }
      case "BOOLEAN": {
        data.booleanValue =
          typeof rawValue === "boolean"
            ? rawValue
            : rawValue === "true"
              ? true
              : rawValue === "false"
                ? false
                : null;
        break;
      }
      default: {
        if (Array.isArray(rawValue)) {
          data.stringValue = rawValue.join(", ");
        } else if (rawValue === undefined || rawValue === null) {
          data.stringValue = null;
        } else {
          data.stringValue = String(rawValue);
        }
        break;
      }
    }

    await tx.organizationFieldValue.upsert({
      where: {
        organizationId_key: {
          organizationId,
          key: field.key,
        },
      },
      update: data,
      create: {
        organizationId,
        ...data,
      },
    });
  }
};

const createOrUpdateOrganization = async (formData: Organization) => {
  return await prisma.$transaction(async (prisma) => {
    const session = await auth();

    const user = await prisma.user.findFirst({
      where: { email: session?.user.email as string },
    });

    // Upsert bank details if provided
    const bankDetail = formData.bankDetails?.bankName
      ? await prisma.bankDetails.upsert({
          where: { iban: formData.bankDetails.iban },
          update: {
            ...formData.bankDetails,
            accountHolder: formData.bankDetails.accountHolder as string,
            iban: formData.bankDetails.iban as string,
            bic: formData.bankDetails.bic as string,
          },
          create: {
            ...formData.bankDetails,
            accountHolder: formData.bankDetails.accountHolder as string,
            iban: formData.bankDetails.iban as string,
            bic: formData.bankDetails.bic as string,
            bankName: formData.bankDetails.bankName as string,
          },
        })
      : undefined;

    const userEmail = formData.user?.email?.trim().toLowerCase();

    let orgUser = userEmail
      ? await prisma.user.findUnique({
          where: { email: userEmail },
        })
      : null;

    if (userEmail && orgUser) {
      orgUser = await prisma.user.update({
        where: { email: userEmail },
        data: {
          ...formData.user,
          email: userEmail,
          roles: {
            set: Array.from(
              new Set([...(orgUser.roles ?? []), Roles.Organization]),
            ),
          },
        },
      });
    } else if (userEmail) {
      orgUser = await prisma.user.create({
        data: {
          ...formData.user,
          email: userEmail,
          roles: [Roles.Organization],
        },
      });
    }

    // Common organization data
    const profileData =
      formData.profileData === undefined ? undefined : formData.profileData;
    const portalAccessEnabled = Boolean(
      formData.portalAccessEnabled || orgUser,
    );
    const organizationData = {
      name: formData.name,
      address: formData.address,
      postalCode: formData.postalCode,
      city: formData.city,
      country: formData.country,
      phone: formData.phone,
      website: formData.website,
      taxID: formData.taxID,
      isFilledByOrg: formData.isFilledByOrg,
      portalAccessEnabled,
      profileData,
      ...(bankDetail && { bankDetails: { connect: { id: bankDetail.id } } }),
      ...(orgUser && {
        users: { connect: { id: orgUser.id } },
      }),
    };

    // An organization in the trash keeps its address so that it can be
    // restored; a new one cannot take it meanwhile.
    if (formData.teamId) {
      const trashed = await prisma.organization.findFirst({
        where: {
          email: formData.email.toLowerCase(),
          deletedAt: { not: null },
        },
        select: { id: true },
      });
      if (trashed) {
        throw new Error(
          `An organization in the trash already uses ${formData.email}. Restore it, or delete it permanently first.`,
        );
      }
    }

    // Organization update/create logic
    const organization = formData.teamId
      ? await prisma.organization.create({
          data: {
            ...organizationData,
            email: formData.email.toLowerCase(),
            team: { connect: { id: formData.teamId } },
            ...(formData.orgTypeId
              ? { orgType: { connect: { id: formData.orgTypeId } } }
              : {}),
            ...(formData.contactPersonId
              ? { contactPerson: { connect: { id: formData.contactPersonId } } }
              : {}),
          },
        })
      : await prisma.organization.update({
          where: { email: formData.email },
          data: {
            ...organizationData,
            orgType: formData.orgTypeId
              ? { connect: { id: formData.orgTypeId } }
              : { disconnect: true },
            contactPerson: formData.contactPersonId
              ? { connect: { id: formData.contactPersonId } }
              : { disconnect: true },
          },
        });

    await syncOrganizationFieldValues(
      prisma,
      organization.id,
      formData.orgTypeId ?? null,
      typeof profileData === "object" &&
        profileData !== null &&
        !Array.isArray(profileData)
        ? (profileData as Record<string, unknown>)
        : undefined,
    );

    // Batch file creation
    const fileOwnerId = user?.id ?? orgUser?.id;
    if (fileOwnerId) {
      const files = [
        {
          type: "TAX_EXEMPTION_CERTIFICATE",
          url: formData.taxExemptionCertificate,
        },
        {
          type: "ARTICLES_OF_ASSOCIATION",
          url: formData.articlesOfAssociation,
        },
        { type: "LOGO", url: formData.logo },
      ];

      await Promise.all(
        files.map(
          ({ type, url }) =>
            url &&
            prisma.file.upsert({
              where: { url },
              update: {
                type,
                url,
                updatedBy: { connect: { id: fileOwnerId } },
              },
              create: {
                type,
                url,
                createdBy: {
                  connect: { id: fileOwnerId },
                },
                updatedBy: { connect: { id: fileOwnerId } },
                organization: { connect: { id: organization.id } },
              },
            }),
        ),
      );
    }

    return { organization, user: orgUser, bankDetail };
  });
};
const updateOrganization = async (formData: Organization, id: string) => {
  const updatedOrganization = await prisma.organization.update({
    where: {
      id,
    },
    data: {
      name: formData.name,
      email: formData.email,
      address: formData.address,
      postalCode: formData.postalCode,
      city: formData.city,
      country: formData.country,
      phone: formData.phone,
      website: formData.website,
      taxID: formData.taxID,
      isFilledByOrg: formData.isFilledByOrg,
      portalAccessEnabled: formData.portalAccessEnabled,
      profileData: formData.profileData ?? undefined,
      orgType: formData.orgTypeId
        ? { connect: { id: formData.orgTypeId } }
        : { disconnect: true },
      contactPerson: formData.contactPersonId
        ? { connect: { id: formData.contactPersonId } }
        : { disconnect: true },
      bankDetails: {
        update: {
          accountHolder: formData.bankDetails?.accountHolder,
          iban: formData.bankDetails?.iban,
          bic: formData.bankDetails?.bic,
          bankName: formData.bankDetails?.bankName,
        },
      },
    },
  });

  await syncOrganizationFieldValues(
    prisma,
    id,
    formData.orgTypeId ?? null,
    typeof formData.profileData === "object" &&
      formData.profileData !== null &&
      !Array.isArray(formData.profileData)
      ? (formData.profileData as Record<string, unknown>)
      : undefined,
  );
  return updatedOrganization;
};

const getOrganizationById = async (id: string) => {
  const organization = await prisma.organization.findUnique({
    where: {
      id,
    },
    include: {
      bankDetails: true,
      orgType: true,
      contactPerson: true,
      engagements: {
        orderBy: {
          engagedAt: "desc",
        },
      },
      Files: {
        select: {
          id: true,
          url: true,
          type: true,
        },
      },
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          postalCode: true,
          city: true,
          country: true,
        },
      },
      contacts: {
        where: { contact: { deletedAt: null } },
        include: {
          contact: {
            select: {
              id: true,
              teamId: true,
              name: true,
              phone: true,
              emails: primaryContactEmailSelect,
            },
          },
        },
        orderBy: {
          contact: {
            name: "asc",
          },
        },
      },
    },
  });
  return {
    ...organization,
    contacts:
      organization?.contacts.map(({ contact }) => ({
        id: contact.id,
        teamId: contact.teamId,
        name: contact.name,
        email: getPrimaryEmail(contact) ?? null,
        phone: contact.phone,
      })) ?? [],
    user: organization?.users[0],
  };
};

const getOrganizationByEmail = async (email: string) => {
  const organization = await prisma.organization.findUnique({
    where: {
      email,
    },
    include: {
      bankDetails: true,
      orgType: true,
      contactPerson: true,
      engagements: {
        orderBy: {
          engagedAt: "desc",
        },
      },
      Files: {
        select: {
          id: true,
          url: true,
          type: true,
        },
      },
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          postalCode: true,
          city: true,
          country: true,
        },
      },
    },
  });
  if (organization?.users.length) {
    return {
      ...organization,
      user: organization.users[0] || {},
      taxExemptionCertificate: organization.Files.find(
        (file) => file.type === "TAX_EXEMPTION_CERTIFICATE",
      )?.id,
      articlesOfAssociation: organization.Files.find(
        (file) => file.type === "ARTICLES_OF_ASSOCIATION",
      )?.id,
      logo: organization.Files.find((file) => file.type === "LOGO")?.id,
    };
  }
};

const organizationListInclude = {
  bankDetails: true,
  orgType: true,
  contactPerson: true,
  users: true,
  contacts: {
    where: { contact: { deletedAt: null } },
    include: {
      contact: {
        select: {
          id: true,
          teamId: true,
          name: true,
          phone: true,
          emails: primaryContactEmailSelect,
        },
      },
    },
  },
  team: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.OrganizationInclude;

const mapOrganizationListItem = <
  T extends {
    contacts?: Array<{
      contact: {
        id: string;
        teamId: string;
        name: string;
        phone: string | null;
        emails: Array<{ email: string }>;
      };
    }>;
  },
>(
  organization: T,
) => ({
  ...organization,
  contacts:
    organization.contacts?.map(({ contact }) => ({
      id: contact.id,
      teamId: contact.teamId,
      name: contact.name,
      email: getPrimaryEmail(contact) ?? null,
      phone: contact.phone,
    })) ?? [],
});

/** Columns the Organizations lists can be ordered by (see lib/list-request). */
export const ORGANIZATION_SORT_FIELDS = [
  "name",
  "email",
  "city",
  "country",
  "phone",
  "website",
  "taxID",
  "isFilledByOrg",
  "team",
  "type",
  "contactPerson",
  "bankName",
  "createdAt",
] as const;
export type OrganizationSortField = (typeof ORGANIZATION_SORT_FIELDS)[number];

const organizationOrderStep = (
  sort: RecordSort<OrganizationSortField>,
): Prisma.OrganizationOrderByWithRelationInput | Prisma.OrganizationOrderByWithRelationInput[] => {
  const { field, direction } = sort;
  switch (field) {
    case "email":
    case "createdAt":
    case "isFilledByOrg":
      return { [field]: direction };
    // Linked records by their name; organizations without one come last.
    case "team":
      return { team: { name: direction } };
    case "type":
      return { orgType: { name: direction } };
    case "contactPerson":
      return { contactPerson: { name: direction } };
    case "bankName":
      return { bankDetails: { bankName: direction } };
    case "name":
      return { name: { sort: direction, nulls: "last" } };
    case "city":
      return { city: { sort: direction, nulls: "last" } };
    case "country":
      return { country: { sort: direction, nulls: "last" } };
    case "phone":
      return { phone: { sort: direction, nulls: "last" } };
    case "website":
      return { website: { sort: direction, nulls: "last" } };
    default:
      return { taxID: { sort: direction, nulls: "last" } };
  }
};

/** The order of a page: the asked-for orders, then the id as tie-breaker. */
const organizationOrderBy = (
  sorts?: readonly RecordSort<OrganizationSortField>[],
): Prisma.OrganizationOrderByWithRelationInput[] =>
  sorts?.length
    ? chainOrderBy(sorts, organizationOrderStep, { id: "asc" })
    : [{ createdAt: "desc" }, { id: "asc" }];

const getOrganizations = async (
  searchQuery: string,
  teamId: string,
  filters: OrganizationFieldFilter[] = [],
  pagination?: {
    page: number;
    pageSize: number;
    sorts?: RecordSort<OrganizationSortField>[];
  },
  /** The list itself, or the trash. */
  deleted: "active" | "trashed" = "active",
) => {
  const fieldFilters = filters.filter((filter) => filter.type === "field");
  const andClauses: Prisma.OrganizationWhereInput[] = [];

  fieldFilters.forEach((filter) => {
    const key = filter.key.trim();
    if (!key) {
      return;
    }
    const value = filter.value?.trim();

    const base: Prisma.OrganizationFieldValueWhereInput = {
      key: { equals: key },
    };

    switch (filter.operator) {
      case "contains":
        if (!value) return;
        andClauses.push({
          fieldValues: {
            some: {
              ...base,
              stringValue: { contains: value, mode: "insensitive" },
            },
          },
        });
        return;
      case "equals":
        if (!value) return;
        andClauses.push({
          fieldValues: {
            some: {
              ...base,
              OR: [
                { stringValue: { equals: value, mode: "insensitive" } },
                { numberValue: { equals: Number(value) } },
              ],
            },
          },
        });
        return;
      case "gt":
      case "lt":
        if (!value) return;
        andClauses.push({
          fieldValues: {
            some: {
              ...base,
              numberValue: {
                [filter.operator === "gt" ? "gt" : "lt"]: Number(value),
              },
            },
          },
        });
        return;
      case "before":
      case "after":
        if (!value) return;
        andClauses.push({
          fieldValues: {
            some: {
              ...base,
              dateValue: {
                [filter.operator === "before" ? "lt" : "gt"]: new Date(value),
              },
            },
          },
        });
        return;
      case "isTrue":
        andClauses.push({
          fieldValues: {
            some: { ...base, booleanValue: { equals: true } },
          },
        });
        return;
      case "isFalse":
        andClauses.push({
          fieldValues: {
            some: { ...base, booleanValue: { equals: false } },
          },
        });
        return;
      default:
        return;
    }
  });

  const where = {
    ...(teamId ? { teamId } : {}),
    deletedAt: deleted === "trashed" ? { not: null } : null,
    ...(andClauses.length ? { AND: andClauses } : {}),
    OR: [
      { name: { contains: searchQuery, mode: "insensitive" } },
      { email: { contains: searchQuery, mode: "insensitive" } },
      { address: { contains: searchQuery, mode: "insensitive" } },
      { city: { contains: searchQuery, mode: "insensitive" } },
      { country: { contains: searchQuery, mode: "insensitive" } },
      { phone: { contains: searchQuery, mode: "insensitive" } },
      { website: { contains: searchQuery, mode: "insensitive" } },
      { taxID: { contains: searchQuery, mode: "insensitive" } },
    ],
  } as Prisma.OrganizationWhereInput;

  const page = Math.max(pagination?.page ?? 1, 1);
  const pageSize = Math.max(pagination?.pageSize ?? 10, 1);
  const skip = (page - 1) * pageSize;

  if (!pagination) {
    const organizations = await prisma.organization.findMany({
      where,
      include: organizationListInclude,
      orderBy: {
        createdAt: "desc",
      },
    });
    const data = organizations.map(mapOrganizationListItem);
    return { data, total: data.length };
  }

  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      include: organizationListInclude,
      orderBy: organizationOrderBy(pagination.sorts),
      skip,
      take: pageSize,
    }),
    prisma.organization.count({ where }),
  ]);
  const data = organizations.map(mapOrganizationListItem);

  return { data, total };
};

/**
 * Moves an organization to the trash: it leaves every list and its users
 * lose access, but nothing of it is deleted (docs/DATA_RULES.md,
 * "Organizations in the trash").
 */
const trashOrganization = async (id: string) => {
  const { count } = await prisma.organization.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (!count) throw new Error("Organization not found");
  return true;
};

/** Brings an organization back from the trash, as it was. */
const restoreOrganization = async (id: string) => {
  const { count } = await prisma.organization.updateMany({
    where: { id, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  if (!count) throw new Error("Organization is not in the trash");
  return true;
};

/**
 * Deletes an organization in the trash for good, with its donation
 * agreements, files and funding requests (and what they cascade to).
 */
const permanentlyDeleteOrganization = async (id: string) => {
  try {
    await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findFirst({
        where: { id, deletedAt: { not: null } },
        select: { id: true },
      });
      if (!organization) {
        throw new Error("Only an organization in the trash can be deleted");
      }
      await tx.donationAgreement.deleteMany({ where: { organizationId: id } });
      await tx.file.deleteMany({ where: { organizationId: id } });
      // Cascades to what hangs off the requests (schema constraints).
      await tx.fundingRequest.deleteMany({ where: { organizationId: id } });
      await tx.organization.update({
        where: { id },
        data: { users: { set: [] } },
      });
      await tx.organization.delete({ where: { id } });
    });
    return true;
  } catch (error) {
    logger.error({ error, organizationId: id }, "Error deleting organization");
    throw error;
  }
};

export {
  createOrUpdateOrganization,
  getOrganizationByEmail,
  getOrganizationById,
  getOrganizations,
  permanentlyDeleteOrganization,
  restoreOrganization,
  trashOrganization,
  updateOrganization,
};
