import { NextResponse } from "next/server";
import { z } from "zod";
import {
  handleApiError,
  requireGlobalAdmin,
  verifyFundingRequestAccess,
  verifyOrganizationAccess,
  verifyTeamAccess,
} from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { readList } from "@/lib/list-request";
import {
  createTransaction,
  getTransactions,
  TRANSACTION_RECEIPT_FILTERS,
  TRANSACTION_SORT_FIELDS,
  type TransactionReceiptFilter,
} from "@/services/transactions";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId") || undefined;
    const teamId = searchParams.get("teamId") || undefined;
    const fundingRequestId = searchParams.get("fundingRequestId") || undefined;
    const query = searchParams.get("query") || undefined;

    if (fundingRequestId) {
      await verifyFundingRequestAccess(fundingRequestId, {
        requireModule: "FUNDING",
      });
    } else if (organizationId) {
      await verifyOrganizationAccess(organizationId, {
        requireModule: "FUNDING",
      });
    } else if (teamId) {
      await verifyTeamAccess(teamId, { requireModule: "FUNDING" });
    } else {
      await requireGlobalAdmin();
    }

    // The Transactions list pages and sorts; other callers get every row.
    const list = readList(searchParams, {
      sort: TRANSACTION_SORT_FIELDS,
      fallback: { field: "createdAt", direction: "desc" },
      paging: "optional",
    });
    const receipts = searchParams
      .getAll("receipt")
      .filter((value): value is TransactionReceiptFilter =>
        (TRANSACTION_RECEIPT_FILTERS as readonly string[]).includes(value),
      );
    const { data, total } = await getTransactions({
      organizationId,
      teamId,
      fundingRequestId,
      searchQuery: query,
      receipts,
      pagination: list ?? undefined,
    });

    return NextResponse.json(
      list
        ? { data, total, page: list.page, pageSize: list.pageSize }
        : { data },
    );
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    const errorMessage = handlePrismaError(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = z
      .object({
        amount: z.coerce.number().positive(),
        fundingRequestId: z.uuid(),
      })
      .parse(await request.json());
    await verifyFundingRequestAccess(body.fundingRequestId, {
      requireTeamMember: true,
      requireModule: "FUNDING",
    });
    const transaction = await createTransaction({
      amount: body.amount,
      fundingRequestId: body.fundingRequestId,
    });

    return NextResponse.json(transaction);
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    const errorMessage = handlePrismaError(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
