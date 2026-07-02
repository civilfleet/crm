import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import {
  deleteEmailInbox,
  updateEmailInbox,
} from "@/services/inbound-email";

const updateInboxSchema = z.object({
  groupId: z.uuid().optional(),
  name: z.string().trim().min(1).max(255).optional(),
  host: z.string().trim().min(1).max(255).optional(),
  port: z.number().int().positive().max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().trim().min(1).max(255).optional(),
  password: z.string().min(1).optional(),
  mailbox: z.string().trim().min(1).max(255).optional(),
  autoApproveExistingVisible: z.boolean().optional(),
  requireReviewForHiddenMatches: z.boolean().optional(),
  allowCreateContacts: z.boolean().optional(),
  allowedDomains: z.array(z.string().trim().max(255)).optional(),
  isEnabled: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ teamId: string; inboxId: string }> },
) {
  try {
    const { teamId, inboxId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });

    const payload = await request.json();
    const validated = updateInboxSchema.parse(payload);
    const inbox = await updateEmailInbox({
      id: inboxId,
      teamId,
      ...validated,
    });

    return NextResponse.json({ data: inbox }, { status: 200 });
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ teamId: string; inboxId: string }> },
) {
  try {
    const { teamId, inboxId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });

    await deleteEmailInbox(teamId, inboxId);

    return NextResponse.json({ data: "success" }, { status: 200 });
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
