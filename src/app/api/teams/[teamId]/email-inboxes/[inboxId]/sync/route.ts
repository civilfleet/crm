import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { syncEmailInbox } from "@/services/inbound-email";

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

    const result = await syncEmailInbox(inboxId, {
      workerId: `manual:${teamId}`,
      teamId,
      resetCheckpoint: validated.resetCheckpoint,
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
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
