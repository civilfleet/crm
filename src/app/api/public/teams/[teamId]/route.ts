import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import { DEFAULT_TEAM_MODULES } from "@/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;

  try {
    const team = await prisma.teams.findUnique({
      where: {
        id: teamId,
      },
      select: {
        name: true,
        strategicPriorities: true,
        registrationPageLogoKey: true,
        modules: true,
      },
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const teamModules =
      team.modules && team.modules.length > 0
        ? team.modules
        : [...DEFAULT_TEAM_MODULES];

    if (!teamModules.includes("FUNDING")) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json({
      name: team.name,
      strategicPriorities: team.strategicPriorities,
      registrationPageLogoKey: team.registrationPageLogoKey,
    });
  } catch (e) {
    const { message } = handlePrismaError(e);
    return NextResponse.json(
      { error: message },
      { status: 400, statusText: message },
    );
  }
}