import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getTeamAdminAccess } from "@/services/teams/access";
import { type AppModule, DEFAULT_TEAM_MODULES } from "@/types";

const TEAM_MODULES: AppModule[] = ["CRM", "FUNDING"];

const normalizeModules = (modules?: AppModule[] | null) =>
  modules && modules.length > 0 ? modules : [...DEFAULT_TEAM_MODULES];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const session = await auth();

  if (!session?.user?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    select: { modules: true },
  });

  return NextResponse.json({ data: normalizeModules(team?.modules ?? null) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const session = await auth();

  if (!session?.user?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await getTeamAdminAccess(
    session.user.userId,
    teamId,
    session.user.roles,
  );
  if (!access.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    modules?: AppModule[];
  } | null;

  const requested = body?.modules ?? [];
  const filtered = requested.filter((module) => TEAM_MODULES.includes(module));

  if (!filtered.length) {
    return NextResponse.json(
      { error: "Select at least one module" },
      { status: 400 },
    );
  }

  const team = await prisma.teams.update({
    where: { id: teamId },
    data: { modules: filtered },
    select: { modules: true },
  });

  return NextResponse.json({ data: normalizeModules(team.modules) });
}