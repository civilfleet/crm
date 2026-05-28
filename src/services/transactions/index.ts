import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { FundingStatus } from "@/types";

type CreateTransaction = {
  amount: number;
  fundingRequestId: string;
  organizationId: string;
  teamId: string;
  totalAmount: number;
  remainingAmount: number;
};

type GetTransactionsParams = {
  organizationId?: string;
  teamId?: string;
  fundingRequestId?: string;
  searchQuery?: string;
};

const createTransaction = async (transaction: CreateTransaction) => {
  const response = await prisma.transaction.create({
    data: {
      amount: transaction.amount,
      fundingRequest: {
        connect: {
          id: transaction.fundingRequestId,
        },
      },
      organization: {
        connect: {
          id: transaction.organizationId,
        },
      },
      team: {
        connect: {
          id: transaction.teamId,
        },
      },
      totalAmount: transaction.totalAmount,
      remainingAmount: transaction.remainingAmount,
    },
  });

  await prisma.fundingRequest.update({
    where: {
      id: transaction.fundingRequestId,
    },
    data: {
      remainingAmount: transaction.remainingAmount,
      ...(transaction.remainingAmount === 0 && {
        status: FundingStatus.Completed,
      }),
    },
  });

  return response;
};

const getTransactions = async ({
  organizationId,
  teamId,
  fundingRequestId,
  searchQuery,
}: GetTransactionsParams = {}) => {
  const where: Record<string, unknown> = {};

  if (organizationId) {
    where.organizationId = organizationId;
  }
  if (teamId) {
    where.teamId = teamId;
  }
  if (fundingRequestId) {
    where.fundingRequestId = fundingRequestId;
  }
  if (searchQuery) {
    where.fundingRequest = {
      name: {
        contains: searchQuery,
        mode: "insensitive",
      },
    };
  }

  logger.debug({ where }, "Transactions query filters");
  const response = await prisma.transaction.findMany({
    where,
    include: {
      fundingRequest: true,
      organization: true,
      team: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return response;
};

const getTransactionById = async (id: string) => {
  const response = await prisma.transaction.findUnique({
    where: {
      id,
    },
    include: {
      fundingRequest: true,
      organization: true,
      team: true,
    },
  });
  return response;
};

const updateTransactionReceipt = async (
  id: string,
  transactionReciept: string,
  userId: string,
) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    select: {
      organizationId: true,
      fundingRequestId: true,
    },
  });
  if (!transaction) {
    throw new Error("Transaction not found");
  }

  const file = await prisma.file.create({
    data: {
      url: transactionReciept,
      type: "TRANSACTION_RECEIPT",
      organization: {
        connect: { id: transaction.organizationId },
      },
      FundingRequest: {
        connect: { id: transaction.fundingRequestId },
      },
      createdBy: {
        connect: {
          id: userId,
        },
      },
      updatedBy: {
        connect: { id: userId },
      },
    },
  });

  const response = await prisma.transaction.update({
    where: { id },
    data: {
      file: {
        connect: {
          id: file.id,
        },
      },
    },
  });
  return response;
};

export {
  createTransaction,
  getTransactionById,
  getTransactions,
  updateTransactionReceipt,
};
