import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { EmailDeliveryUncertainError } from "@/services/email-delivery-errors";
import { replyToInboundEmail } from "@/services/inbound-email";
import { getTeamAdminAccess } from "@/services/teams/access";
import type { Roles } from "@/types";

const replySchema = z.object({
  inboundEmailMessageId: z.uuid(),
  subject: z.string().trim().max(500).optional(),
  message: z.string().trim().min(1, "Message is required").max(100_000),
  idempotencyKey: z.uuid(),
  attachments: z
    .array(z.object({ pendingUploadId: z.uuid() }))
    .max(10)
    .default([]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string; inboxId: string }> },
) {
  try {
    const { teamId, inboxId } = await params;
    const session = await verifyTeamAccess(teamId);
    const userId = session.user.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const validated = replySchema.parse(await request.json());
    const roles = (session.user.roles ?? []) as Roles[];
    const adminAccess = await getTeamAdminAccess(userId, teamId, roles);
    const engagement = await replyToInboundEmail({
      teamId,
      inboxId,
      inboundEmailMessageId: validated.inboundEmailMessageId,
      subject: validated.subject,
      message: validated.message,
      idempotencyKey: validated.idempotencyKey,
      userId,
      userName: session.user.name ?? session.user.email ?? undefined,
      roles,
      isTeamAdmin: adminAccess.allowed,
      attachments: validated.attachments,
    });
    return NextResponse.json({ data: engagement });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    if (error instanceof EmailDeliveryUncertainError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 },
      );
    }
    const { message } = handlePrismaError(error);
    const forbidden = message.startsWith("You do not have access");
    return NextResponse.json(
      { error: message },
      { status: forbidden ? 403 : 400, statusText: message },
    );
  }
}
