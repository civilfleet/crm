import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import { getAllowedContactSubmodules } from "@/services/contacts";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

    const session = await auth();
    let userId = session?.user?.userId ?? undefined;

    if (!userId && session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
      userId = user?.id;
    }

    if (!userId) {
      return NextResponse.json({ data: [] }, { status: 200 });
    }

    const allowedSubmodules = await getAllowedContactSubmodules(teamId, userId);

    return NextResponse.json({ data: allowedSubmodules }, { status: 200 });
  } catch (error) {
    const { message } = handlePrismaError(error);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}
