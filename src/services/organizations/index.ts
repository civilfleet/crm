import { type Prisma, Roles } from "@prisma/client";
import { auth } from "@/auth";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
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
  bankDetails?: {
    accountHolder?: string;
    iban?: string;
    bic?: string;
    bankName?: string;
  };
  user?: {
    name?: string;
    email: string;
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

    const email = formData.user?.email?.toLowerCase() as string;

    let orgUser = await prisma.user.findUnique({
      where: { email },
    });

    if (orgUser) {
      orgUser = await prisma.user.update({
        where: { email },
        data: {
          ...formData.user,
          roles: {
            set: Array.from(
              new Set([...(orgUser.roles ?? []), Roles.Organization]),
            ),
          },
        },
      });
    } else {
      orgUser = await prisma.user.create({
        data: {
          ...formData.user,
          email,
          roles: [Roles.Organization],
        },
      });
    }

    // Common organization data
    const profileData =
      formData.profileData === undefined ? undefined : formData.profileData;
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
      profileData,
      ...(bankDetail && { bankDetails: { connect: { id: bankDetail.id } } }),
      ...(orgUser && {
        users: { connect: { id: orgUser.id } },
      }),
    };

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
    if (user?.id) {
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
                updatedBy: { connect: { id: user.id } },
              },
              create: {
                type,
                url,
                createdBy: {
                  connect: { id: user.id },
                },
                updatedBy: { connect: { id: user.id } },
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
    },
  });
  return { ...organization, user: organization?.users[0] };
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

const getOrganizations = async (
  searchQuery: string,
  teamId: string,
  filters: OrganizationFieldFilter[] = [],
  pagination?: {
    page: number;
    pageSize: number;
  },
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
    const data = await prisma.organization.findMany({
      where,
      include: {
        bankDetails: true,
        orgType: true,
        contactPerson: true,
        users: true,
        team: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    return { data, total: data.length };
  }

  const [data, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      include: {
        bankDetails: true,
        orgType: true,
        contactPerson: true,
        users: true,
        team: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: pageSize,
    }),
    prisma.organization.count({ where }),
  ]);

  return { data, total };
};

const deleteOrganization = async (id: string) => {
  try {
    // Get the organization to find associated users
    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        users: true,
        fundingRequests: true,
      },
    });

    if (!organization) {
      throw new Error("Organization not found");
    }

    // Delete all donation agreements associated with this organization
    await prisma.donationAgreement.deleteMany({
      where: { organizationId: id },
    });

    // Delete all files associated with this organization
    await prisma.file.deleteMany({
      where: { organizationId: id },
    });

    // Delete all funding requests associated with this organization
    // This will cascade delete related records due to the schema constraints
    await prisma.fundingRequest.deleteMany({
      where: { organizationId: id },
    });

    // Disconnect all users from the organization
    await prisma.organization.update({
      where: { id },
      data: {
        users: {
          set: [], // Disconnect all users
        },
      },
    });

    // Finally, delete the organization
    await prisma.organization.delete({
      where: { id },
    });

    return true;
  } catch (error) {
    logger.error({ error, organizationId: id }, "Error deleting organization");
    throw error;
  }
};

export {
  createOrUpdateOrganization,
  deleteOrganization,
  getOrganizationByEmail,
  getOrganizationById,
  getOrganizations,
  updateOrganization,
};
