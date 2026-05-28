import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  buildDomainVerificationRecordName,
  buildDomainVerificationRecordValue,
  resolveTxtRecordValues,
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
        loginDomain: true,
        domainVerificationToken: true,
      },
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (!team.loginDomain) {
      return NextResponse.json(
        { error: "Set a login domain before checking verification" },
        { status: 400 },
      );
    }

    if (!team.domainVerificationToken) {
      return NextResponse.json(
        { error: "Start domain verification before checking" },
        { status: 400 },
      );
    }

    const recordName = buildDomainVerificationRecordName(team.loginDomain);
    const expectedValue = buildDomainVerificationRecordValue(
      team.domainVerificationToken,
    );

    let txtValues: string[] = [];
    try {
      txtValues = await resolveTxtRecordValues(recordName);
    } catch (_dnsError) {
      txtValues = [];
    }

    const isVerified = txtValues.includes(expectedValue);

    const updated = await prisma.teams.update({
      where: { id: teamId },
      data: {
        domainVerifiedAt: isVerified ? new Date() : null,
        domainLastCheckedAt: new Date(),
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
        ...updated,
        verified: isVerified,
        recordName,
        recordValue: expectedValue,
        observedValues: txtValues,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "This domain is already verified by another team. Use a different domain.",
        },
        { status: 409 },
      );
    }

    logger.error({ error }, "Error checking domain verification");
    return NextResponse.json(
      { error: "Failed to check domain verification" },
      { status: 500 },
    );
  }
}
