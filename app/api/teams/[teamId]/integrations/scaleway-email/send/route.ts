import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { handlePrismaError } from "@/lib/utils";
import { sendMassEmailToContacts } from "@/services/integrations/scaleway-email";

const sendMassEmailSchema = z.object({
  contactIds: z
    .array(z.string().uuid("Contact ID must be a valid UUID"))
    .min(1, "Select at least one contact")
    .max(100, "You can send to at most 100 contacts at once"),
  subject: z.string().trim().min(1, "Subject is required").max(500),
  html: z.string().trim().min(1, "Email body is required"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const session = await auth();
    const payload = await request.json();
    const validated = sendMassEmailSchema.parse(payload);

    const result = await sendMassEmailToContacts({
      teamId,
      contactIds: validated.contactIds,
      subject: validated.subject,
      html: validated.html,
      userId: session?.user?.userId,
      userName: session?.user?.name ?? session?.user?.email ?? undefined,
    });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
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