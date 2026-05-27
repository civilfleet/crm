import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import { handlePrismaError } from "@/lib/utils";
import { sendMassEmailToContacts } from "@/services/integrations/scaleway-email";

const sendMassEmailSchema = z
  .object({
    contactIds: z
      .array(z.uuid("Contact ID must be a valid UUID"))
      .max(100, "You can send to at most 100 contacts at once")
      .optional()
      .default([]),
    eventIds: z
      .array(z.uuid("Event ID must be a valid UUID"))
      .max(100, "You can send to registrants of at most 100 events at once")
      .optional()
      .default([]),
    subject: z.string().trim().min(1, "Subject is required").max(500),
    html: z.string().trim().min(1, "Email body is required"),
    senderLabelMode: z.enum(["default", "user"]).default("default"),
  })
  .refine((value) => value.contactIds.length > 0 || value.eventIds.length > 0, {
    message: "Select at least one contact or event",
    path: ["contactIds"],
  });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const session = await verifyTeamAccess(teamId);
    const payload = await request.json();
    const validated = sendMassEmailSchema.parse(payload);

    const result = await sendMassEmailToContacts({
      teamId,
      contactIds: validated.contactIds,
      eventIds: validated.eventIds,
      subject: validated.subject,
      html: validated.html,
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