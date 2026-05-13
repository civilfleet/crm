import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasModuleAccess } from "@/lib/permissions";
import { handlePrismaError } from "@/lib/utils";
import { retryEmailBatch } from "@/services/emails";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamId: string; batchId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { teamId, batchId } = await params;
    const canAccessCrm = await hasModuleAccess(
      {
        teamId,
        userId: session.user.userId,
        roles: session.user.roles,
      },
      "CRM",
    );

    if (!canAccessCrm) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await retryEmailBatch(teamId, batchId);

    return NextResponse.json({ data: result }, { status: 202 });
  } catch (error) {
    const { message } = handlePrismaError(error);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}