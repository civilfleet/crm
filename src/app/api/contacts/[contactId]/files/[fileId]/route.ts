import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { handlePrismaError } from "@/lib/utils";
import { deleteContactFile } from "@/services/contacts";

const deleteContactFileSchema = z.object({
  teamId: z.uuid("Team id must be a valid UUID"),
});

export async function DELETE(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ contactId: string; fileId: string }>;
  },
) {
  try {
    const session = await auth();
    const userId = session?.user?.userId;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { contactId, fileId } = await params;
    const payload = await req.json().catch(() => ({}));
    const { teamId } = deleteContactFileSchema.parse(payload);

    const file = await deleteContactFile(
      {
        teamId,
        contactId,
        fileId,
      },
      userId,
      session?.user?.name ?? undefined,
    );

    return NextResponse.json({ data: file }, { status: 200 });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
