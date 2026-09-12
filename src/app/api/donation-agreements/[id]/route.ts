import { NextResponse } from "next/server";
import { handleApiError, verifyDonationAgreementAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import {
  getDonationAgreementById,
  updateDonationAgreement,
} from "@/services/donation-agreement";
import { updateDonationAgreementSchema } from "@/validations/donation-agreement";

export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const donationAgreementId = (await params).id;
    await verifyDonationAgreementAccess(donationAgreementId, {
      requireModule: "FUNDING",
    });
    const data = await getDonationAgreementById(donationAgreementId);
    return NextResponse.json({ data }, { status: 200 });
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
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
    const donationAgreementId = (await params).id;
    const access = await verifyDonationAgreementAccess(donationAgreementId, {
      requireModule: "FUNDING",
    });
    const updatedDonationAgreement = updateDonationAgreementSchema.parse(
      await req.json(),
    );

    const response = await updateDonationAgreement(
      donationAgreementId,
      updatedDonationAgreement,
      access.session.user.userId as string,
    );
    return NextResponse.json(
      { data: response, message: "Donation agreement updated successfully" },
      { status: 200 },
    );
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const handledError = handlePrismaError(e);
    return NextResponse.json({ error: handledError.message }, { status: 400 });
  }
}
