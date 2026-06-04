import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { sendMassEmailToContacts } from "@/services/integrations/scaleway-email";
import { sendMassEmailSchema } from "@/validations/scaleway-email";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const session = await verifyTeamAccess(teamId, { requireModule: "CRM" });
    const payload = await request.json();
    const validated = sendMassEmailSchema.parse(payload);

    const result = await sendMassEmailToContacts({
      teamId,
      contactIds: validated.contactIds,
      eventIds: validated.eventIds,
      subject: validated.subject,
      html: validated.html,
      bccEmails: validated.bccEmails,
      internalCopyMode: validated.internalCopyMode,
      userId: session.user.userId,
      userName: session.user.name ?? session.user.email ?? undefined,
      senderLabelMode: validated.senderLabelMode,
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
