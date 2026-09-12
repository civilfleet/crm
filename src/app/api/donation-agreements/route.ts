import { NextResponse } from "next/server";
import {
  ApiError,
  handleApiError,
  requireGlobalAdmin,
  verifyFundingRequestAccess,
  verifyOrganizationAccess,
  verifyTeamAccess,
} from "@/lib/api-guard";
import { sendEmail } from "@/lib/nodemailer";
import { handlePrismaError } from "@/lib/utils";
import {
  createDonationAgreement,
  getDonationAgreements,
} from "@/services/donation-agreement";
import { createDonationAgreementSchema } from "@/validations/donation-agreement";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get("query") || "";

    const teamId = searchParams.get("teamId") as string;
    const orgId = searchParams.get("organizationId") as string;

    if (teamId) {
      await verifyTeamAccess(teamId, { requireModule: "FUNDING" });
    } else if (orgId) {
      await verifyOrganizationAccess(orgId, { requireModule: "FUNDING" });
    } else {
      await requireGlobalAdmin();
    }

    const data = await getDonationAgreements({ teamId, orgId }, searchQuery);

    return NextResponse.json(
      {
        data,
      },
      { status: 201 },
    );
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const handledError = handlePrismaError(e);
    return NextResponse.json({ error: handledError.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const donationAgreement = await req.json();

    const validatedData =
      createDonationAgreementSchema.parse(donationAgreement);
    const access = await verifyFundingRequestAccess(
      validatedData.fundingRequestId,
      { requireTeamMember: true, requireModule: "FUNDING" },
    );
    if (!access.teamId) {
      throw new ApiError(400, "Funding request is not assigned to a team");
    }
    const { user: _user, ...agreementData } = validatedData;
    void _user;
    const { agreement, users } = await createDonationAgreement(
      {
        ...agreementData,
        users: validatedData.users ?? [],
      },
      access.session.user.userId as string,
      access.teamId,
    );

    await Promise.all(
      (users ?? []).map((user) =>
        sendEmail(
          {
            to: user.email,
            subject: "Donation Agreement",
            template: "donation-agreement",
          },
          {
            user: user.name,
            requestName: agreement.fundingRequest.name,
            organizationName: agreement?.organization?.name,
            agreementLink: `${process.env.NEXT_PUBLIC_BASE_URL}/api/files/${agreement.file.id}`,
            supportEmail: agreement?.team?.email,
            teamName: agreement?.team?.name,
          },
        ),
      ),
    );

    return NextResponse.json(
      {
        message: "Donation agreement created successfully",
        data: agreement,
      },
      { status: 201 },
    );
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const handledError = handlePrismaError(e);
    return NextResponse.json({ error: handledError.message }, { status: 400 });
  }
}
