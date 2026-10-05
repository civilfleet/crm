import { NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { testEmailInboxOutboundConnection } from "@/services/inbound-email";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamId: string; inboxId: string }> },
) {
  try {
    const { teamId, inboxId } = await params;
    const session = await verifyTeamAccess(teamId, { requireAdmin: true });
    if (!session.user.email) {
      throw new Error(
        "Your account has no email address for the test delivery.",
      );
    }
    const result = await testEmailInboxOutboundConnection(
      teamId,
      inboxId,
      session.user.email,
    );
    return NextResponse.json({ data: result });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    const { message } = handlePrismaError(error);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
