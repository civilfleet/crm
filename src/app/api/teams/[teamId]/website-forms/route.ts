import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { recordSystemLog } from "@/services/system-logs";
import { getTeamAdminAccess } from "@/services/teams/access";

/*
  Whether the team accepts submissions from website forms
  (Teams.publicFormsEnabled; docs/PUBLIC_FORMS_INTAKE.md, "Enabling a team").
  Team admins only; every change is written to the team's system log.
*/

type Context = { params: Promise<{ teamId: string }> };

const requireAdmin = async (teamId: string) => {
  const session = await auth();
  if (!session?.user?.userId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const access = await getTeamAdminAccess(
    session.user.userId,
    teamId,
    session.user.roles,
  );
  if (!access.allowed) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session };
};

export async function GET(_request: Request, { params }: Context) {
  const { teamId } = await params;
  const { error } = await requireAdmin(teamId);
  if (error) return error;

  const team = await prisma.teams.findUnique({
    where: { id: teamId },
    select: { id: true, publicFormsEnabled: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  return NextResponse.json({
    data: { teamId: team.id, enabled: team.publicFormsEnabled },
  });
}

const updateSchema = z.object({ enabled: z.boolean() }).strict();

export async function PATCH(request: Request, { params }: Context) {
  const { teamId } = await params;
  const { session, error } = await requireAdmin(teamId);
  if (error) return error;

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid setting" }, { status: 400 });
  }
  const { enabled } = parsed.data;

  const team = await prisma.teams.update({
    where: { id: teamId },
    data: { publicFormsEnabled: enabled },
    select: { id: true, publicFormsEnabled: true },
  });
  const who = session.user.name ?? session.user.email ?? session.user.userId;
  await recordSystemLog({
    teamId,
    event: enabled ? "website_forms_enabled" : "website_forms_disabled",
    source: "WEBSITE_FORMS",
    message: `Website form submissions ${enabled ? "accepted" : "no longer accepted"} (changed by ${who}).`,
    entityType: "Team",
    entityId: teamId,
    metadata: { enabled, userId: session.user.userId },
  });
  return NextResponse.json({
    data: { teamId: team.id, enabled: team.publicFormsEnabled },
  });
}
