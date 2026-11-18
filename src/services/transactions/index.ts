import { Prisma } from "@prisma/client";
import { FundingRuleError } from "@/lib/funding-status";
import { chainOrderBy, type ListRequest, type RecordSort } from "@/lib/list-request";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { calculateTransactionBalance } from "@/services/transactions/balance";
import { FundingStatus } from "@/types";

type CreateTransaction = {
  amount: number;
  fundingRequestId: string;
};

export const TRANSACTION_SORT_FIELDS = [
  "fundingRequest",
  "organization",
  "amount",
  "totalAmount",
  "remainingAmount",
  "receipt",
  "createdAt",
] as const;
export type TransactionSortField = (typeof TRANSACTION_SORT_FIELDS)[number];

export const TRANSACTION_RECEIPT_FILTERS = ["uploaded", "missing"] as const;
export type TransactionReceiptFilter =
  (typeof TRANSACTION_RECEIPT_FILTERS)[number];

type GetTransactionsParams = {
  organizationId?: string;
  teamId?: string;
  fundingRequestId?: string;
  searchQuery?: string;
  receipts?: TransactionReceiptFilter[];
  /** One page in an order; without it, every row, newest first. */
  pagination?: ListRequest;
};

const transactionOrderBy = ({
  field,
  direction,
}: RecordSort<string>): Prisma.TransactionOrderByWithRelationInput => {
  if (field === "fundingRequest") {
    return { fundingRequest: { name: direction } };
  }
  if (field === "organization") {
    return { organization: { name: direction } };
  }
  // By when the receipt was uploaded; transactions without one come last.
  if (field === "receipt") {
    return { file: { createdAt: direction } };
  }
  return { [field]: direction };
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
          status: true,
        },
      });
      if (!fundingRequest?.amountAgreed || !fundingRequest.teamId) {
        throw new Error("Funding request is not ready for disbursement");
      }
      // Money goes out only once the agreement is fully signed.
      if (fundingRequest.status !== FundingStatus.FundsDisbursing) {
        throw new FundingRuleError(
          "Payouts can only be made while the request is disbursing funds.",
        );
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
  receipts = [],
  pagination,
}: GetTransactionsParams = {}) => {
  // None of an organization in the trash.
  const and: Prisma.TransactionWhereInput[] = [
    { organization: { deletedAt: null } },
  ];

  if (organizationId) {
    and.push({ organizationId });
  }
  if (teamId) {
    and.push({ teamId });
  }
  if (fundingRequestId) {
    and.push({ fundingRequestId });
  }
  const query = searchQuery?.trim();
  if (query) {
    and.push({
      OR: [
        { fundingRequest: { name: { contains: query, mode: "insensitive" } } },
        { organization: { name: { contains: query, mode: "insensitive" } } },
      ],
    });
  }
  // Both selected is the same as no filter.
  if (receipts.length === 1) {
    and.push({
      transactionReciept: receipts[0] === "uploaded" ? { not: null } : null,
    });
  }
  const where: Prisma.TransactionWhereInput = { AND: and };
  const include = {
    fundingRequest: true,
    organization: true,
    team: true,
  } satisfies Prisma.TransactionInclude;

  logger.debug({ where }, "Transactions query filters");
  if (!pagination) {
    const data = await prisma.transaction.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
    });
    return { data, total: data.length };
  }

  const [data, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include,
      // The id keeps rows with equal values in one order across pages.
      orderBy: chainOrderBy(
        pagination.sorts?.length
          ? pagination.sorts
          : [{ field: "createdAt", direction: "desc" } as const],
        transactionOrderBy,
        { id: "asc" },
      ),
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);
  return { data, total };
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
