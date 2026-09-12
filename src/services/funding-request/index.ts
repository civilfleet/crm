import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import { type FileTypes, FundingStatus } from "@/types";

type FundingRequestData = {
  id?: string;
  name: string;
  organizationId?: string;
  description: string;
  purpose: string;
  amountRequested: number;
  amountAgreed?: number;
  refinancingConcept: string;
  sustainability: string;
  expectedCompletionDate: string;
  status?: FundingStatus; // Optional - defaults to Submitted
  submittedBy?: string;
  files?: { name: string; url: string }[];
  [key: string]: unknown; // Accept dynamic fields
};

const createFundingRequest = async (data: FundingRequestData) => {
  const session = await auth();
  const completionDate = new Date(data.expectedCompletionDate);

  // Fetch the user person's ID
  const user = await prisma.user.findFirst({
    where: {
      email: session?.user.email as string,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  if (!user) {
    throw new Error("User person not found.");
  }

  // Fetch organization details, including team email
  const organization = await prisma.organization.findUnique({
    where: {
      id: data.organizationId,
    },
    include: {
      team: {
        select: {
          id: true,
          email: true, // Include team email
        },
      },
    },
  });

  if (!organization) {
    throw new Error("Organization not found.");
  }

  // Separate static fields from dynamic fields
  const staticFields = {
    name: data.name,
    description: data.description,
    purpose: data.purpose,
    amountRequested: data.amountRequested,
    refinancingConcept: data.refinancingConcept,
    sustainability: data.sustainability,
    expectedCompletionDate: completionDate,
  };

  // Extract dynamic fields (everything not in staticFields, status, files, organizationId, submittedBy)
  const excludedKeys = new Set([
    ...Object.keys(staticFields),
    "status",
    "files",
    "organizationId",
    "submittedBy",
    "id",
  ]);

  const customFields: Record<string, unknown> = {};
  Object.entries(data).forEach(([key, value]) => {
    if (!excludedKeys.has(key)) {
      customFields[key] = value;
    }
  });

  // Create the funding request
  const fundingRequest = await prisma.fundingRequest.create({
    data: {
      ...staticFields,
      status: data.status || FundingStatus.Submitted, // Default to Submitted if not provided
      customFields:
        Object.keys(customFields).length > 0
          ? (customFields as Prisma.InputJsonValue)
          : undefined,
      organization: {
        connect: {
          id: data.organizationId,
        },
      },
      submittedBy: {
        connect: {
          id: user.id,
        },
      },
      team: {
        connect: {
          id: organization.teamId as string,
        },
      },
    },
  });

  // Save files associated with the funding request
  const files = data?.files
    ?.filter((file) => file?.name && file?.url)
    ?.map((file) => ({
      name: file.name,
      url: file.url,
      fundingRequestId: fundingRequest.id,
      organizationId: data.organizationId,
      createdById: user.id,
      updatedById: user.id,
      type: "FundingRequest",
    }));

  if (files && files.length > 0) {
    await prisma.file.createMany({
      data: files,
    });
  }

  return { fundingRequest, user, organization };
};

const updateFundingRequest = async (
  id: string,
  data: Partial<FundingRequestData>,
  teamId: string,
) => {
  const team = await prisma.teams.findFirst({
    where: {
      id: teamId,
    },
  });
  if (!team) {
    throw new Error("Team not found.");
  }

  const {
    files: _files,
    organizationId: _organizationId,
    submittedBy: _submittedBy,
    id: _id,
    ...rest
  } = data;
  void _files;
  void _organizationId;
  void _submittedBy;
  void _id;

  const updateData: Prisma.FundingRequestUpdateInput = {
    ...(rest.name !== undefined && { name: rest.name }),
    ...(rest.description !== undefined && { description: rest.description }),
    ...(rest.purpose !== undefined && { purpose: rest.purpose }),
    ...(rest.amountRequested !== undefined && {
      amountRequested: rest.amountRequested,
    }),
    ...(rest.amountAgreed !== undefined && { amountAgreed: rest.amountAgreed }),
    ...(rest.refinancingConcept !== undefined && {
      refinancingConcept: rest.refinancingConcept,
    }),
    ...(rest.sustainability !== undefined && {
      sustainability: rest.sustainability,
    }),
    ...(rest.expectedCompletionDate !== undefined && {
      expectedCompletionDate: new Date(rest.expectedCompletionDate),
    }),
    ...(rest.status !== undefined && { status: rest.status }),
    ...(rest.remainingAmount !== undefined && {
      remainingAmount: rest.remainingAmount,
    }),
    ...(rest.customFields !== undefined && {
      customFields: rest.customFields as Prisma.InputJsonValue,
    }),
  };

  const fundingRequest = await prisma.fundingRequest.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      description: true,
      purpose: true,
      amountRequested: true,
      amountAgreed: true,
      refinancingConcept: true,
      sustainability: true,
      expectedCompletionDate: true,
      remainingAmount: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      files: {
        select: {
          id: true,
          name: true,
          url: true,
          type: true,
        },
      },
      organization: {
        select: {
          name: true,
          email: true,
          team: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      },
      submittedBy: {
        select: {
          email: true,
        },
      },
    },
  });
  return fundingRequest;
};

const updateFundingRequestStatus = async (
  id: string,
  status: FundingStatus,
  donationId?: string | null,
) => {
  const selectedFields = {
    id: true,
    name: true,
    description: true,
    purpose: true,
    amountRequested: true,
    amountAgreed: true,
    refinancingConcept: true,
    sustainability: true,
    expectedCompletionDate: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    files: {
      select: {
        id: true,
        name: true,
        url: true,
        type: true,
      },
    },
    organization: {
      select: {
        name: true,
        email: true,
        team: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    },
    submittedBy: {
      select: {
        email: true,
      },
    },
  };
  try {
    if (donationId) {
      const agreement = await prisma.donationAgreement.findFirst({
        where: { id: donationId, fundingRequestId: id },
        select: { id: true },
      });
      if (!agreement) {
        throw new Error("Donation agreement does not belong to this request");
      }

      const signedAgreements = await prisma.donationAgreementSignature.findMany(
        {
          where: {
            donationAgreementId: donationId,
            signedAt: null,
          },
        },
      );

      if (!signedAgreements?.length) {
        return await prisma.fundingRequest.update({
          where: { id },
          data: {
            status,
          },
          select: selectedFields,
        });
      }
      throw new Error("Donation agreement still has unsigned signatures");
    } else {
      return await prisma.fundingRequest.update({
        where: { id },
        data: {
          status,
        },
        select: selectedFields,
      });
    }
  } catch (e) {
    throw handlePrismaError(e);
  }
};

const uploadFundingRequestFile = async (
  fundingRequestId: string,
  file: string,
  type: FileTypes,
  userId: string,
) => {
  return await prisma.file.create({
    data: {
      url: file,
      fundingRequestId,
      type: type,
      createdById: userId,
      updatedById: userId,
    },
    select: {
      FundingRequest: {
        select: {
          name: true,
          organization: {
            select: {
              name: true,
              email: true,
              team: {
                select: {
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });
};

const getFundingRequests = async (
  {
    teamId,
    orgId,
  }: {
    teamId: string;
    orgId: string;
  },
  searchQuery: string,
  status?: FundingStatus[] | null,
) => {
  const where: Prisma.FundingRequestWhereInput = {};
  if (orgId) {
    where.organizationId = orgId;
  }
  if (teamId) {
    where.teamId = teamId;
  }
  if (searchQuery) {
    where.description = {
      contains: searchQuery,
    };
    where.purpose = {
      contains: searchQuery,
    };
    where.refinancingConcept = {
      contains: searchQuery,
    };
    where.sustainability = {
      contains: searchQuery,
    };
  }
  if (status?.length) {
    where.status = {
      in: status,
    };
  }

  const fundingRequests = await prisma.fundingRequest.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
      purpose: true,
      amountRequested: true,
      amountAgreed: true,
      refinancingConcept: true,
      sustainability: true,
      expectedCompletionDate: true,
      remainingAmount: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      files: {
        select: {
          id: true,
          name: true,
          url: true,
          type: true,
        },
      },
      organization: {
        select: {
          name: true,
          email: true,
        },
      },
      submittedBy: {
        select: {
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return fundingRequests;
};

const getFundingRequestsByOrgId = async (searchQuery: string) => {
  const fundingRequests = await prisma.fundingRequest.findMany({
    where: {
      organization: {
        id: searchQuery,
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      purpose: true,
      amountRequested: true,
      amountAgreed: true,
      refinancingConcept: true,
      sustainability: true,
      expectedCompletionDate: true,
      remainingAmount: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      files: true,
      organization: {
        select: {
          name: true,
          email: true,
          Files: {
            select: {
              id: true,
              name: true,
              url: true,
              type: true,
            },
          },
        },
      },
      submittedBy: {
        select: {
          email: true,
        },
      },
    },
  });
  return fundingRequests;
};

const getFundingRequestById = async (id: string) => {
  const fundingRequest = await prisma.fundingRequest.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      name: true,
      description: true,
      purpose: true,
      amountRequested: true,
      amountAgreed: true,
      refinancingConcept: true,
      sustainability: true,
      expectedCompletionDate: true,
      remainingAmount: true,
      status: true,
      customFields: true,
      createdAt: true,
      updatedAt: true,
      files: true,
      organizationId: true,
      organization: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          postalCode: true,
          city: true,
          country: true,
          website: true,
          taxID: true,
          teamId: true,
          Files: {
            select: {
              id: true,
              name: true,
              url: true,
              type: true,
            },
          },
          bankDetails: {
            select: {
              bankName: true,
              accountHolder: true,
              iban: true,
              bic: true,
            },
          },
        },
      },
      donationAgreement: {
        select: {
          id: true,
        },
      },
      submittedBy: {
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
  return fundingRequest;
};

export {
  createFundingRequest,
  getFundingRequestById,
  getFundingRequests,
  getFundingRequestsByOrgId,
  updateFundingRequest,
  updateFundingRequestStatus,
  uploadFundingRequestFile,
};
