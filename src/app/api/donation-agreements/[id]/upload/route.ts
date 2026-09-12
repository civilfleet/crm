import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  handleApiError,
  verifyDonationAgreementAccess,
} from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import { createPendingUpload } from "@/services/file/pending-uploads";
import { createFileUpload } from "@/services/file/s3-service";
import { FundingStatus } from "@/types";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await verifyDonationAgreementAccess(id, {
      requireModule: "FUNDING",
    });
    const userId = access.session.user.userId;
    if (!userId || !access.teamId)
      throw new ApiError(403, "Signing is unavailable");
    const signer = await prisma.donationAgreementSignature.findFirst({
      where: {
        donationAgreementId: id,
        userId,
        signedAt: null,
        donationAgreement: {
          fundingRequest: { status: FundingStatus.WaitingForSignature },
        },
      },
      select: { userId: true },
    });
    if (!signer)
      throw new ApiError(
        403,
        "You are not an unsigned signer of this agreement",
      );
    const { fileName, fileType } = z
      .object({
        fileName: z.string().trim().min(1).max(255),
        fileType: z.string().trim().min(1).max(255),
      })
      .parse(await req.json());
    const upload = await createFileUpload({
      fileName: `${crypto.randomUUID()}-${fileName}`,
      fileType,
    });
    const pending = await createPendingUpload({
      key: upload.key,
      originalName: fileName,
      contentType: fileType,
      teamId: access.teamId,
      userId,
    });
    return NextResponse.json({
      ...upload,
      pendingUploadId: pending.id,
      expiresAt: pending.expiresAt,
    });
  } catch (error) {
    return (
      handleApiError(error) ??
      NextResponse.json(
        { error: "Unable to prepare signed upload" },
        { status: 400 },
      )
    );
  }
}
