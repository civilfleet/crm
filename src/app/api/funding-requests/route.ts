import { NextResponse } from "next/server";
import { z } from "zod";
import { sendEmail } from "@/lib/nodemailer";
import { handlePrismaError } from "@/lib/utils";
import {
  createFundingRequest,
  getFundingRequests,
} from "@/services/funding-request";
import type { FundingStatus } from "@/types";
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

    const data = await getFundingRequests(
      { teamId, orgId },
      searchQuery,
      status as FundingStatus[],
    );

    return NextResponse.json(
      {
        data,
      },
      { status: 201 },
    );
  } catch (e) {
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

    const { fundingRequest, user, organization } =
      await createFundingRequest(validatedData);

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
    const { message } = handlePrismaError(e);

    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}