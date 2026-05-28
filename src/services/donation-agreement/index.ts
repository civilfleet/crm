import prisma from "@/lib/prisma";
import { FundingStatus } from "@/types";

type DonationAgreement = {
  agreement: string;
  file: string;
  fundingRequestId: string;
  users: string[];
};

const createDonationAgreement = async (
  donation: DonationAgreement,
  createdByUserId: string,
  teamId: string,
) => {
  const agreementData = await prisma.$transaction(async (prisma) => {
    const users = await prisma.user.findMany({
      where: {
        email: {
          in: donation?.users as string[],
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
    const organizationId = await prisma.fundingRequest.findUnique({
      where: {
        id: donation?.fundingRequestId,
      },
      select: {
        organizationId: true,
      },
    });
    const file = await prisma.file.create({
      data: {
        url: donation.file as string,
        type: "DONATION_AGREEMENT",
        ...(organizationId?.organizationId
          ? { organization: { connect: { id: organizationId.organizationId } } }
          : {}),
        ...(donation?.fundingRequestId
          ? { FundingRequest: { connect: { id: donation.fundingRequestId } } }
          : {}),
        createdBy: {
          connect: { id: createdByUserId as string },
        },
        updatedBy: { connect: { id: createdByUserId as string } },
      },
    });
    const agreement = await prisma.donationAgreement.create({
      data: {
        agreement: donation.agreement as string,
        file: { connect: { id: file.id } },
        fundingRequest: { connect: { id: donation?.fundingRequestId } },
        createdBy: { connect: { id: createdByUserId as string } },
        team: {
          connect: {
            id: teamId as string,
          },
        },
        organization: {
          connect: {
            id: organizationId?.organizationId as string,
          },
        },
      },
      select: {
        id: true,
        team: {
          select: {
            name: true,
            email: true,
          },
        },
        organization: {
          select: {
            name: true,
          },
        },
        fundingRequest: {
          select: {
            name: true,
          },
        },
        file: {
          select: {
            id: true,
          },
        },
      },
    });

    const agreementsToSignByUser = users.map((user) => ({
      donationAgreementId: agreement.id,
      userId: user.id,
    }));

    await prisma.donationAgreementSignature.createMany({
      data: agreementsToSignByUser,
    });

    await prisma.fundingRequest.update({
      where: {
        id: donation?.fundingRequestId,
      },
      data: {
        status: FundingStatus.WaitingForSignature,
      },
    });

    return { agreement, users };
  });

  return {
    agreement: agreementData.agreement,
    users: agreementData.users,
  };
};

const getDonationAgreements = async (
  { teamId, orgId }: { teamId: string; orgId: string },
  searchQuery: string,
) => {
  const where: Record<string, unknown> = {};
  if (orgId) {
    where.organizationId = orgId;
  }
  if (teamId) {
    where.teamId = teamId;
  }
  if (searchQuery) {
    where.fundingRequest = {
      name: {
        contains: searchQuery,
        mode: "insensitive",
      },
    };
  }
  const donationAgreements = await prisma.donationAgreement.findMany({
    where: {
      ...where,
    },
    include: {
      userSignatures: {
        select: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
          signedAt: true,
        },
      },
      file: {
        select: {
          url: true,
          name: true,
          type: true,
        },
      },
      createdBy: {
        select: {
          name: true,
          email: true,
        },
      },
      fundingRequest: {
        select: {
          description: true,
          purpose: true,
          name: true,
          amountAgreed: true,
          remainingAmount: true,
          status: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return donationAgreements;
};

const getDonationAgreementById = async (id: string) => {
  const donationAgreement = await prisma.donationAgreement.findUnique({
    where: {
      id,
    },
    include: {
      userSignatures: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          signedAt: true,
        },
      },
      file: {
        select: {
          id: true,
          url: true,
          name: true,
          type: true,
        },
      },
      createdBy: {
        select: {
          name: true,
          email: true,
        },
      },
      fundingRequest: {
        select: {
          description: true,
          purpose: true,
          name: true,
          amountAgreed: true,
          remainingAmount: true,
          status: true,
        },
      },
    },
  });
  return donationAgreement;
};

const updateDonationAgreement = async (
  id: string,
  updatedDonationAgreement: DonationAgreement & { userId?: string },
) => {
  const donation = await prisma.donationAgreement.findUnique({
    where: {
      id,
    },
    include: {
      fundingRequest: {
        select: {
          id: true,
          status: true,
        },
      },
      organization: {
        select: {
          id: true,
        },
      },
      file: {
        select: {
          id: true,
          url: true,
        },
      },
      userSignatures: {
        select: {
          userId: true,
          signedAt: true,
        },
      },
    },
  });

  await prisma.$transaction(async (prisma) => {
    await prisma.file.update({
      where: {
        id: donation?.file.id as string,
      },
      data: {
        url: updatedDonationAgreement.file as string,
        ...(donation?.organization?.id
          ? { organization: { connect: { id: donation.organization.id } } }
          : {}),
        ...(donation?.fundingRequest?.id
          ? { FundingRequest: { connect: { id: donation.fundingRequest.id } } }
          : {}),
        updatedBy: {
          connect: { id: updatedDonationAgreement.userId as string },
        },
      },
    });

    // Update the signature for either the current user or the selected user (for admin)
    const signatureUserId = updatedDonationAgreement.userId as string;

    await prisma.donationAgreementSignature.update({
      where: {
        donationAgreementId_userId: {
          donationAgreementId: id,
          userId: signatureUserId,
        },
      },
      data: {
        signedAt: new Date(),
      },
    });

    const remainingSignatures = await prisma.donationAgreementSignature.count({
      where: {
        donationAgreementId: id,
        signedAt: null,
      },
    });

    if (
      remainingSignatures === 0 &&
      donation?.fundingRequest?.status === FundingStatus.WaitingForSignature
    ) {
      await prisma.fundingRequest.update({
        where: {
          id: donation.fundingRequest.id,
        },
        data: {
          status: FundingStatus.FundsDisbursing,
        },
      });
    }

    return {
      data: donation,
      message: "Donation agreement updated successfully",
    };
  });
};

const getDonationAgreementPastSevenDays = async () => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0); // Start of the day

  const nextDay = new Date(sevenDaysAgo);
  nextDay.setDate(nextDay.getDate() + 1); // Next day (exclusive upper bound)

  const donationAgreements = await prisma.donationAgreement.findMany({
    where: {
      createdAt: {
        gte: sevenDaysAgo, // 7 days ago, 00:00:00
        lt: nextDay, // 6 days ago, 00:00:00 (exclusive)
      },
    },
    select: {
      id: true,
      organization: {
        select: {
          name: true,
          email: true,
        },
      },
      fundingRequest: {
        select: {
          id: true,
          name: true,
        },
      },
      team: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  return donationAgreements;
};

const getDonationAgreementPastEightWeeks = async () => {
  const eightWeeksAgo = new Date();
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
  eightWeeksAgo.setHours(0, 0, 0, 0); // Start of the day

  const nextDay = new Date(eightWeeksAgo);
  nextDay.setDate(nextDay.getDate() + 1); // Next day (exclusive upper bound)

  const donationAgreements = await prisma.donationAgreement.findMany({
    where: {
      createdAt: {
        gte: eightWeeksAgo, // 56 days ago, 00:00:00
        lt: nextDay, // 55 days ago, 00:00:00 (exclusive)
      },
    },
    select: {
      id: true,
      organization: {
        select: {
          name: true,
          email: true,
        },
      },
      fundingRequest: {
        select: {
          id: true,
          name: true,
        },
      },
      team: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  return donationAgreements;
};

export {
  createDonationAgreement,
  getDonationAgreementById,
  getDonationAgreementPastEightWeeks,
  getDonationAgreementPastSevenDays,
  getDonationAgreements,
  updateDonationAgreement,
};