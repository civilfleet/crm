import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, verifyTeamAccess } from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import { getContactChangeLogs } from "@/services/contact-change-logs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get("contactId");

    if (!contactId) {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 },
      );
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { teamId: true },
    });
    if (!contact) throw new ApiError(404, "Contact not found");
    const session = await verifyTeamAccess(contact.teamId, {
      requireModule: "CRM",
    });
    const userId = session.user.userId;
    if (!userId) throw new ApiError(401, "Unauthorized");
    const logs = await getContactChangeLogs(
      contactId,
      contact.teamId,
      userId,
      session.user.roles,
    );

    return NextResponse.json({ data: logs }, { status: 200 });
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
