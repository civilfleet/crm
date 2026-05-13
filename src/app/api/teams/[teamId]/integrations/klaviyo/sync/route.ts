import { NextResponse } from "next/server";
import { handlePrismaError } from "@/lib/utils";
import { syncKlaviyoIntegration } from "@/services/integrations/klaviyo";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });
    const result = await syncKlaviyoIntegration(teamId);

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