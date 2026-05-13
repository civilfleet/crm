import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { handlePrismaError } from "@/lib/utils";
import { createZammadTicket } from "@/services/integrations/zammad";

const createTicketSchema = z.object({
  contactId: z.uuid(),
  groupId: z.number().int().positive(),
  subject: z.string().trim().min(1, "Subject is required"),
  message: z.string().trim().min(1, "Message is required"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { teamId } = await params;
    const payload = await request.json();
    const validated = createTicketSchema.parse(payload);

    const result = await createZammadTicket({
      teamId,
      contactId: validated.contactId,
      groupId: validated.groupId,
      subject: validated.subject,
      message: validated.message,
      userId: session.user.userId,
      userName: session.user.name ?? session.user.email ?? undefined,
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