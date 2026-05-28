import { NextResponse } from "next/server";
import { auth } from "@/auth";
import logger from "@/lib/logger";
import { handlePrismaError } from "@/lib/utils";
import { updateTransactionReceipt } from "@/services/transactions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { transactionReciept } = await request.json();
    const { id } = await params;
    const transaction = await updateTransactionReceipt(
      id,
      transactionReciept,
      session.user.userId,
    );

    return NextResponse.json(transaction);
  } catch (error) {
    logger.error({ error }, "[TRANSACTION_RECEIPT_PATCH]");
    const errorMessage = handlePrismaError(error);
    return new NextResponse(JSON.stringify({ error: errorMessage }), {
      status: 500,
    });
  }
}