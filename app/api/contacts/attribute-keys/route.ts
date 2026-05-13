import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import { getTeamContactAttributeKeys } from "@/services/contacts";
import type { Roles } from "@/types";

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

    const roles = (session?.user?.roles ?? []) as Roles[];

    const keys = await getTeamContactAttributeKeys(teamId, userId, roles);

    return NextResponse.json({ data: keys }, { status: 200 });
  } catch (error) {
    const { message } = handlePrismaError(error);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}