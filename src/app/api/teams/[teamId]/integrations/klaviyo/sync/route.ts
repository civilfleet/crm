import { NextResponse } from "next/server";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { getKlaviyoIntegration } from "@/services/integrations/klaviyo";
import { enqueueKlaviyoSyncJob } from "@/services/integrations/klaviyo-queue";

/** Queues a sync for the background worker (or returns the queued one). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });

    const integration = await getKlaviyoIntegration(teamId);
    if (!integration?.hasApiKey) {
      return NextResponse.json(
        { error: "Klaviyo integration is not configured for this team." },
        { status: 400 },
      );
    }
    if (!integration.isEnabled) {
      return NextResponse.json(
        { error: "Klaviyo integration is currently disabled." },
        { status: 400 },
      );
    }

    const job = await enqueueKlaviyoSyncJob(teamId);
    return NextResponse.json(
      { data: { jobId: job.id, status: job.status, queuedAt: job.createdAt } },
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
