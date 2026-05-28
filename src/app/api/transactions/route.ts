import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import { createTransaction, getTransactions } from "@/services/transactions";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId") || undefined;
    const teamId = searchParams.get("teamId") || undefined;
    const fundingRequestId = searchParams.get("fundingRequestId") || undefined;
    const query = searchParams.get("query") || undefined;

    const transactions = await getTransactions({
      organizationId,
      teamId,
      fundingRequestId,
      searchQuery: query,
    });

    return NextResponse.json({ data: transactions });
  } catch (error) {
    const errorMessage = handlePrismaError(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      amount,
      fundingRequestId,
      organizationId,
      teamId,
      totalAmount,
      remainingAmount,
    } = body;
    const transaction = await createTransaction({
      amount,
      fundingRequestId,
      organizationId,
      teamId,
      totalAmount,
      remainingAmount,
    });

    return NextResponse.json(transaction);
  } catch (error) {
    const errorMessage = handlePrismaError(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}