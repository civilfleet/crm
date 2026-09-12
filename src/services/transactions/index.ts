import { Prisma } from "@prisma/client";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { calculateTransactionBalance } from "@/services/transactions/balance";
import { FundingStatus } from "@/types";

type CreateTransaction = {
  amount: number;
  fundingRequestId: string;
};

type GetTransactionsParams = {
  organizationId?: string;
  teamId?: string;
  fundingRequestId?: string;
  searchQuery?: string;
};

const createTransaction = async (transaction: CreateTransaction) => {
  return prisma.$transaction(
    async (tx) => {
      const fundingRequest = await tx.fundingRequest.findUnique({
        where: { id: transaction.fundingRequestId },
        select: {
          amountAgreed: true,
          organizationId: true,
          teamId: true,
        },
      });
      if (!fundingRequest?.amountAgreed || !fundingRequest.teamId) {
        throw new Error("Funding request is not ready for disbursement");
      }

      const aggregate = await tx.transaction.aggregate({
        where: { fundingRequestId: transaction.fundingRequestId },
        _sum: { amount: true },
      });
      const alreadyDisbursed = aggregate._sum.amount ?? new Prisma.Decimal(0);
      const { amount, remainingAmount } = calculateTransactionBalance({
        amount: transaction.amount,
        alreadyDisbursed,
        totalAmount: fundingRequest.amountAgreed,
      });
      const response = await tx.transaction.create({
        data: {
          amount,
          fundingRequestId: transaction.fundingRequestId,
          organizationId: fundingRequest.organizationId,
          teamId: fundingRequest.teamId,
          totalAmount: fundingRequest.amountAgreed,
          remainingAmount,
        },
      });

      await tx.fundingRequest.update({
        where: { id: transaction.fundingRequestId },
        data: {
          remainingAmount,
          ...(remainingAmount.isZero() && { status: FundingStatus.Completed }),
        },
      });

      return response;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
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
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { id },
      select: {
        organizationId: true,
        fundingRequestId: true,
      },
    });
    if (!transaction) {
      throw new Error("Transaction not found");
    }

    const file = await tx.file.create({
      data: {
        url: transactionReciept,
        type: "TRANSACTION_RECEIPT",
        organizationId: transaction.organizationId,
        fundingRequestId: transaction.fundingRequestId,
        createdById: userId,
        updatedById: userId,
      },
    });

    return tx.transaction.update({
      where: { id },
      data: { transactionReciept: file.id },
    });
  });
};

export {
  createTransaction,
  getTransactionById,
  getTransactions,
  updateTransactionReceipt,
};
