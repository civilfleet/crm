import { NextResponse } from "next/server";
import { EMAIL_TEMPLATES_TYPES } from "@/constants";
import { sendEmail } from "@/lib/nodemailer";
import { handlePrismaError } from "@/lib/utils";
import { getEmailTemplateByType } from "@/services/email-templates";
import {
  getFundingRequestById,
  updateFundingRequest,
} from "@/services/funding-request";
import { FundingStatus } from "@/types";
import { updateFundingRequestSchema } from "@/validations/funding-request";

export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const fundingRequestId = (await params).id;
    if (!fundingRequestId) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }
    const data = await getFundingRequestById(fundingRequestId);
    return NextResponse.json({ data }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const fundingRequestId = (await params).id;

    const fundingRequest = await req.json();

    const validatedData = updateFundingRequestSchema.parse({
      ...fundingRequest,
    });

    const response = await updateFundingRequest(
      fundingRequestId,
      validatedData,
      fundingRequest.teamId as string,
    );
    const status = response.status;
    let emailTemplate: Awaited<
      ReturnType<typeof getEmailTemplateByType>
    > | null = null;
    if (status === FundingStatus.Accepted) {
      emailTemplate = await getEmailTemplateByType(
        fundingRequest.teamId as string,
        EMAIL_TEMPLATES_TYPES.FUNDING_REQUEST_ACCEPTED,
      );
    } else if (status === FundingStatus.Rejected) {
      emailTemplate = await getEmailTemplateByType(
        fundingRequest.teamId as string,
        EMAIL_TEMPLATES_TYPES.FUNDING_REQUEST_REJECTED,
      );
    }

    await sendEmail(
      {
        to: response?.organization?.email as string,
        subject: emailTemplate?.subject || `Funding Request Status Updated`,
        template: "funding-status-update",
        content: emailTemplate?.content || "",
      },
      {
        organizationName: response?.organization?.name,
        requestName: response?.name,
        submittedDate: response?.createdAt,
        status: response.status,
        requestLink: `${process.env.NEXT_PUBLIC_BASE_URL}/organizations/funding-requests/${response?.id}`,
        supportEmail: response?.organization?.team?.email,
        teamName: response?.organization?.team?.name,
      },
    );
    return NextResponse.json(
      {
        message: "success",
        data: response,
      },
      { status: 201 },
    );
  } catch (e) {
    const handledError = handlePrismaError(e);
    return NextResponse.json({ error: handledError.message }, { status: 400 });
  }
}
