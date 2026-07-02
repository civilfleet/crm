import { NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { syncEmailInbox } from "@/services/inbound-email";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamId: string; inboxId: string }> },
) {
  try {
    const { teamId, inboxId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });

    const result = await syncEmailInbox(inboxId, {
      workerId: `manual:${teamId}`,
      teamId,
    });

    return NextResponse.json({ data: result }, { status: 200 });
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
