import { NextResponse } from "next/server";
import { EMAIL_TEMPLATES_TYPES } from "@/constants";
import { sendEmail } from "@/lib/nodemailer";
import { handlePrismaError } from "@/lib/utils";
import { getEmailTemplateByType } from "@/services/email-templates";
import { updateFundingRequestStatus } from "@/services/funding-request";
import { FundingStatus } from "@/types";

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

    if (!fundingRequestId) {
      throw new Error("ID is required");
    }

    const fundingRequestData = await req.json();
    const teamId = fundingRequestData?.teamId;

    if (teamId) {
      const fundingRequest = await updateFundingRequestStatus(
        fundingRequestId,
        fundingRequestData.status,
        fundingRequestData?.donationId,
      );

      const status = fundingRequest?.status;
      let emailTemplate: Awaited<
        ReturnType<typeof getEmailTemplateByType>
      > | null = null;
      if (status === FundingStatus.Accepted) {
        emailTemplate = await getEmailTemplateByType(
          teamId as string,
          EMAIL_TEMPLATES_TYPES.FUNDING_REQUEST_ACCEPTED,
        );
      } else if (status === FundingStatus.Rejected) {
        emailTemplate = await getEmailTemplateByType(
          teamId as string,
          EMAIL_TEMPLATES_TYPES.FUNDING_REQUEST_REJECTED,
        );
      }

      await sendEmail(
        {
          to: fundingRequest?.organization?.email as string,
          subject: emailTemplate?.subject || `Funding Request Status Updated`,
          template: "funding-status-update",
          content: emailTemplate?.content || "",
        },
        {
          organizationName: fundingRequest?.organization?.name,

          requestName: fundingRequest?.name,
          submittedDate: fundingRequest?.createdAt,
          status: fundingRequestData.status,

          requestLink: `${process.env.NEXT_PUBLIC_BASE_URL}/organization/funding-requests/${fundingRequest?.id}`,
          supportEmail: "support@partnerapp.com",
          teamName: fundingRequest?.organization?.team?.name,
        },
      );

      return NextResponse.json(
        {
          message: "success",
          data: fundingRequest,
        },
        { status: 201 },
      );
    }
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}