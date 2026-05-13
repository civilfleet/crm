import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { handlePrismaError } from "@/lib/utils";
import { replyToZammadTicket } from "@/services/integrations/zammad";

const replySchema = z.object({
  ticketId: z.coerce.number().int().positive(),
  message: z.string().trim().min(1, "Message is required"),
  subject: z.string().trim().optional(),
  contactId: z.string().uuid().optional(),
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
    const validated = replySchema.parse(payload);

    const result = await replyToZammadTicket({
      teamId,
      ticketId: validated.ticketId,
      message: validated.message,
      subject: validated.subject,
      contactId: validated.contactId,
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