import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sendEmail } from "@/lib/nodemailer";
import { handlePrismaError } from "@/lib/utils";
import { uploadFundingRequestFile } from "@/services/funding-request";
import type { FileTypes } from "@/types";

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
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }
    const session = await auth();
    const data = await req.json();

    const response = await uploadFundingRequestFile(
      fundingRequestId,
      data.file,
      data?.type as FileTypes,
      session?.user?.userId as string,
    );

    await sendEmail(
      {
        to: response?.FundingRequest?.organization?.team?.email as string,
        subject: `${response.FundingRequest?.organization.name} Uploaded ${data?.type}`,
        template: "document-upload-notification",
      },
      {
        organizationName: response?.FundingRequest?.organization?.name,
        documentType: data?.type,
        requestName: response?.FundingRequest?.name,
        fundingRequestLink: `${process.env.NEXT_PUBLIC_BASE_URL}/team/funding-requests/${fundingRequestId}`,
      },
    );

    return NextResponse.json(
      {
        message: "success",
      },
      { status: 201 },
    );
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
