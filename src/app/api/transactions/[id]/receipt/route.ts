import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  handleApiError,
  verifyFundingRequestAccess,
} from "@/lib/api-guard";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import { updateTransactionReceipt } from "@/services/transactions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { transactionReciept } = z
      .object({ transactionReciept: z.string().min(1) })
      .parse(await request.json());
    const { id } = await params;
    const existingTransaction = await prisma.transaction.findUnique({
      where: { id },
      select: { fundingRequestId: true },
    });
    if (!existingTransaction) throw new ApiError(404, "Transaction not found");
    const access = await verifyFundingRequestAccess(
      existingTransaction.fundingRequestId,
      { requireModule: "FUNDING" },
    );
    const transaction = await updateTransactionReceipt(
      id,
      transactionReciept,
      access.session.user.userId as string,
    );

    return NextResponse.json(transaction);
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    logger.error({ error }, "[TRANSACTION_RECEIPT_PATCH]");
    const errorMessage = handlePrismaError(error);
    return new NextResponse(JSON.stringify({ error: errorMessage }), {
      status: 500,
    });
  }
}
