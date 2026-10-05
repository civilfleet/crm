import { EmailSuppressionReason } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import {
  listEmailSuppressions,
  removeEmailSuppression,
  suppressEmail,
} from "@/services/email-suppressions";
import { recordSystemLog } from "@/services/system-logs";

const suppressionSchema = z.object({
  email: z.string().trim().email(),
  reason: z.enum([
    EmailSuppressionReason.UNSUBSCRIBED,
    EmailSuppressionReason.MANUAL,
  ]),
  detail: z.string().trim().max(1000).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });
    return NextResponse.json({ data: await listEmailSuppressions(teamId) });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    const { message } = handlePrismaError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const session = await verifyTeamAccess(teamId, { requireAdmin: true });
    if (!session.user.userId)
      throw new Error("Authenticated user ID is missing.");
    const input = suppressionSchema.parse(await request.json());
    const suppression = await suppressEmail({
      teamId,
      ...input,
      userId: session.user.userId,
      userName: session.user.name ?? session.user.email ?? undefined,
    });
    await recordSystemLog({
      teamId,
      event: "email_suppression_saved",
      source: "EMAIL_SUPPRESSION",
      message: `Email suppression saved for ${suppression.email}.`,
      entityType: "EmailSuppression",
      entityId: suppression.id,
      metadata: {
        email: suppression.email,
        reason: suppression.reason,
        userId: session.user.userId,
      },
    });
    return NextResponse.json({ data: suppression });
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
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });
    const suppressionId = new URL(request.url).searchParams.get("id");
    if (!suppressionId) throw new Error("Suppression ID is required.");
    const suppression = await removeEmailSuppression(teamId, suppressionId);
    await recordSystemLog({
      teamId,
      level: "WARN",
      event: "email_suppression_removed",
      source: "EMAIL_SUPPRESSION",
      message: `Email suppression removed for ${suppression.email}.`,
      entityType: "EmailSuppression",
      entityId: suppression.id,
      metadata: { email: suppression.email, reason: suppression.reason },
    });
    return NextResponse.json({ data: { removed: true } });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    const { message } = handlePrismaError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
