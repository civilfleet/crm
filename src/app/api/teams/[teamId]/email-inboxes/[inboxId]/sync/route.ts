import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { syncEmailInbox } from "@/services/inbound-email";
import { recordSystemLog } from "@/services/system-logs";

const syncSchema = z.object({
  resetCheckpoint: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string; inboxId: string }> },
) {
  try {
    const { teamId, inboxId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });
    const payload = await request.json().catch(() => ({}));
    const validated = syncSchema.parse(payload);
    const workerId = `manual:${teamId}`;

    const result = await syncEmailInbox(inboxId, {
      workerId,
      teamId,
      resetCheckpoint: validated.resetCheckpoint,
    });

    await recordSystemLog({
      teamId,
      source: "INBOUND_EMAIL",
      event: validated.resetCheckpoint
        ? "inbound_email_manual_resync_finished"
        : "inbound_email_manual_sync_finished",
      message: `Manual inbound email ${
        validated.resetCheckpoint ? "resync" : "sync"
      } fetched ${result.stats?.fetched ?? result.imported} messages and imported ${
        result.imported
      } from inbox ${inboxId}.`,
      workerId,
      entityType: "EmailInbox",
      entityId: inboxId,
      metadata: {
        teamId,
        inboxId,
        ...result,
      },
    });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 },
      );
    }

    const { message } = handlePrismaError(error);
    const { teamId, inboxId } = await params;
    await recordSystemLog({
      teamId,
      level: "ERROR",
      source: "INBOUND_EMAIL",
      event: "inbound_email_manual_sync_failed",
      message: `Manual inbound email sync failed for inbox ${inboxId}.`,
      workerId: `manual:${teamId}`,
      entityType: "EmailInbox",
      entityId: inboxId,
      metadata: { error },
    });

    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
