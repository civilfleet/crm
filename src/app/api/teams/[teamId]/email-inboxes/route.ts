import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import {
  createEmailInbox,
  listEmailInboxes,
} from "@/services/inbound-email";

const inboxSchema = z.object({
  groupId: z.uuid(),
  name: z.string().trim().min(1).max(255),
  host: z.string().trim().min(1).max(255),
  port: z.number().int().positive().max(65535),
  secure: z.boolean().default(true),
  username: z.string().trim().min(1).max(255),
  password: z.string().min(1),
  mailbox: z.string().trim().min(1).max(255).default("INBOX"),
  autoApproveExistingVisible: z.boolean().default(true),
  requireReviewForHiddenMatches: z.boolean().default(true),
  allowCreateContacts: z.boolean().default(false),
  allowedDomains: z.array(z.string().trim().max(255)).default([]),
  isEnabled: z.boolean().default(true),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });

    const inboxes = await listEmailInboxes(teamId);

    return NextResponse.json({ data: inboxes }, { status: 200 });
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    await verifyTeamAccess(teamId, { requireAdmin: true });

    const payload = await request.json();
    const validated = inboxSchema.parse(payload);
    const inbox = await createEmailInbox({
      teamId,
      ...validated,
    });

    return NextResponse.json({ data: inbox }, { status: 201 });
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
