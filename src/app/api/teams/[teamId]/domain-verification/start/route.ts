import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  buildDomainVerificationRecordName,
  buildDomainVerificationRecordValue,
  generateDomainVerificationToken,
} from "@/lib/domain-verification";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { getTeamAdminAccess } from "@/services/teams/access";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { teamId } = await params;
    const access = await getTeamAdminAccess(
      session.user.userId,
      teamId,
      session.user.roles,
    );
    if (!access.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const team = await prisma.teams.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        loginDomain: true,
      },
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (!team.loginDomain) {
      return NextResponse.json(
        { error: "Set a login domain before starting verification" },
        { status: 400 },
      );
    }

    const token = generateDomainVerificationToken();
    const updatedTeam = await prisma.teams.update({
      where: { id: teamId },
      data: {
        domainVerificationToken: token,
        domainVerifiedAt: null,
        domainLastCheckedAt: null,
      },
      select: {
        loginDomain: true,
        domainVerificationToken: true,
        domainVerifiedAt: true,
        domainLastCheckedAt: true,
      },
    });

    return NextResponse.json({
      data: {
        ...updatedTeam,
        recordName: buildDomainVerificationRecordName(
          updatedTeam.loginDomain || "",
        ),
        recordValue: buildDomainVerificationRecordValue(token),
      },
    });
  } catch (error) {
    logger.error({ error }, "Error starting domain verification");
    return NextResponse.json(
      { error: "Failed to start domain verification" },
      { status: 500 },
    );
  }
}