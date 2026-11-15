import { type ListRequest, readList } from "@/lib/list-request";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  handleApiError,
  verifyOrganizationAccess,
  verifyTeamAccess,
} from "@/lib/api-guard";
import { sendEmail } from "@/lib/nodemailer";
import { handlePrismaError } from "@/lib/utils";
import {
  createFundingRequest,
  FUNDING_REQUEST_SORT_FIELDS,
  type FundingRequestSortField,
  getFundingRequests,
} from "@/services/funding-request";
import { FundingStatus } from "@/types";
import { createFundingRequestSchema } from "@/validations/funding-request";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get("query") || "";
    const status = searchParams.getAll("status") || [];
    const orgId = searchParams.get("organizationId") as string;
    const teamId = searchParams.get("teamId") as string;

    if (!teamId && !orgId) {
      return NextResponse.json({ data: [] });
    }

    if (teamId) {
      await verifyTeamAccess(teamId, { requireModule: "FUNDING" });
    } else {
      await verifyOrganizationAccess(orgId, { requireModule: "FUNDING" });
    }

    // The Funding Requests list pages and sorts; pickers get every row.
    const list = readList(searchParams, {
      sort: FUNDING_REQUEST_SORT_FIELDS,
      fallback: { field: "createdAt", direction: "desc" },
      paging: "optional",
    });
    const statuses = status.filter((value): value is FundingStatus =>
      (Object.values(FundingStatus) as string[]).includes(value),
    );
    const { data, total } = await getFundingRequests(
      { teamId, orgId },
      searchQuery,
      statuses,
      (list as ListRequest<FundingRequestSortField> | null) ?? undefined,
    );

    return NextResponse.json(
      list
        ? { data, total, page: list.page, pageSize: list.pageSize }
        : { data },
      { status: 201 },
    );
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}

export async function POST(req: Request) {
  try {
    const fundingRequestData = await req.json();
    const validatedData = createFundingRequestSchema
      .and(
        z.object({
          organizationId: z.uuid(),
          submittedBy: z.string().email().optional().or(z.literal("")),
        }),
      )
      .parse(fundingRequestData);
    const access = await verifyOrganizationAccess(
      validatedData.organizationId,
      {
        requireModule: "FUNDING",
      },
    );
    const safeData =
      access.isGlobalAdmin || access.isTeamMember
        ? validatedData
        : { ...validatedData, status: undefined };

    const { fundingRequest, user, organization } =
      await createFundingRequest(safeData);

    await sendEmail(
      {
        to: organization.team?.email as string,
        subject: `New Funding Request from ${organization.name}`,
        template: "new-funding-request",
      },
      {
        teamEmail: organization.team?.email as string,
        organizationName: organization.name,
        user: user?.name || "Unknown",
        userEmail: user.email || "Unknown",
        fundingAmount: fundingRequest.amountRequested,
        fundingPurpose: fundingRequest.purpose,
        fundingRequestLink: `${process.env.NEXT_PUBLIC_BASE_URL}/team/funding-request/${fundingRequest.id}`,
      },
    );

    return NextResponse.json(
      {
        message: "success",
        data: fundingRequest,
      },
      { status: 201 },
    );
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const { message } = handlePrismaError(e);

    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
