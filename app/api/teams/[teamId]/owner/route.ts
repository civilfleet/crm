import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import { ensureTeamOwner, transferTeamOwnership } from "@/services/teams";

const transferSchema = z.object({
  newOwnerId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const ownerId = await ensureTeamOwner(teamId);

    if (!ownerId) {
      return NextResponse.json(
        { error: "Owner not set for this team" },
        { status: 404 },
      );
    }

    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json({ data: owner }, { status: 200 });
  } catch (error) {
    const { message } = handlePrismaError(error);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}

export async function PATCH(
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
    const { newOwnerId } = transferSchema.parse(payload);

    const ownerId = await transferTeamOwnership(
      teamId,
      session.user.userId,
      newOwnerId,
      session.user.roles,
    );

    return NextResponse.json({ data: { ownerId } }, { status: 200 });
  } catch (error) {
    const { message } = handlePrismaError(error);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}