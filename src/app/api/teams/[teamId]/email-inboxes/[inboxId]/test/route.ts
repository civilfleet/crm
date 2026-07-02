import { NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { testEmailInboxConnection } from "@/services/inbound-email";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamId: string; inboxId: string }> },
) {
  try {
    const { teamId, inboxId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });

    await testEmailInboxConnection(teamId, inboxId);

    return NextResponse.json({ data: "success" }, { status: 200 });
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
