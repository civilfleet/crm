import { NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { retryEmailBatch } from "@/services/emails";
import type { Roles } from "@/types";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamId: string; batchId: string }> },
) {
  try {
    const { teamId, batchId } = await params;
    const session = await verifyTeamAccess(teamId, { requireModule: "CRM" });
    const userId = session.user.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await retryEmailBatch(teamId, batchId, {
      userId,
      roles: (session.user.roles ?? []) as Roles[],
    });

    return NextResponse.json({ data: result }, { status: 202 });
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
