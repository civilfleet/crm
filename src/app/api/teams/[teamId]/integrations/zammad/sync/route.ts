import { NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { getZammadIntegration } from "@/services/integrations/zammad";
import { enqueueZammadSyncJob } from "@/services/integrations/zammad-queue";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });
    const { searchParams } = new URL(request.url);
    const fullSyncParam = searchParams.get("fullSync");
    const fullSync =
      fullSyncParam === "1" ||
      fullSyncParam === "true" ||
      fullSyncParam === "yes";
    const integration = await getZammadIntegration(teamId);
    if (!integration?.hasApiKey || !integration.baseUrl) {
      throw new Error("Zammad integration is not configured for this team.");
    }
    if (!integration.isEnabled) {
      throw new Error("Zammad integration is currently disabled.");
    }

    const job = await enqueueZammadSyncJob(teamId, { fullSync });

    return NextResponse.json(
      {
        data: {
          jobId: job.id,
          status: job.status,
          type: job.type,
        },
      },
      { status: 202 },
    );
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