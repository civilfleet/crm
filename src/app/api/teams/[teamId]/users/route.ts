import { NextResponse } from "next/server";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { ensureTeamOwner } from "@/services/teams";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;

    const ownerId = await ensureTeamOwner(teamId);

    const users = await prisma.user.findMany({
      where: {
        teams: {
          some: {
            id: teamId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        roles: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(
      { data: users, ownerId: ownerId ?? null },
      { status: 200 },
    );
  } catch (error) {
    logger.error({ error }, "Error fetching team users");
    return NextResponse.json(
      { error: "Failed to fetch team users" },
      { status: 500 },
    );
  }
}
