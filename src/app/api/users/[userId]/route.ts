import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  handleApiError,
  verifyOrganizationAccess,
  verifyTeamAccess,
} from "@/lib/api-guard";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import {
  deleteUser,
  getTeamUserById,
  getUserById,
  updateTeamUser,
} from "@/services/users";
import { updateTeamUserSchema } from "@/validations/users";

const getScope = (request: Request) => {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId") || undefined;
  const organizationId = searchParams.get("organizationId") || undefined;

  if (Boolean(teamId) === Boolean(organizationId)) {
    throw new ApiError(400, "Provide exactly one of teamId or organizationId");
  }

  return { teamId, organizationId };
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;
    const { teamId, organizationId } = getScope(request);

    if (teamId) {
      await verifyTeamAccess(teamId, { requireAdmin: true });
      const data = await getTeamUserById(userId, teamId);
      if (!data) {
        throw new ApiError(404, "User not found in this team");
      }
      return NextResponse.json({ data }, { status: 200 });
    }

    if (organizationId) {
      await verifyOrganizationAccess(organizationId);
      const target = await prisma.user.findFirst({
        where: {
          id: userId,
          organizations: { some: { id: organizationId } },
        },
        select: { id: true },
      });
      if (!target) {
        throw new ApiError(404, "User not found in this organization");
      }
      const data = await getUserById(userId);
      return NextResponse.json({ data }, { status: 200 });
    }

    throw new ApiError(400, "A user scope is required");
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const { message } = handlePrismaError(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;
    const validated = updateTeamUserSchema.parse(await request.json());
    await verifyTeamAccess(validated.teamId, { requireAdmin: true });
    await updateTeamUser(userId, validated);

    return NextResponse.json({ data: "success" }, { status: 200 });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 },
      );
    }
    const { message } = handlePrismaError(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;
    const { organizationId, teamId } = await request.json();
    if (
      (typeof teamId !== "string" && teamId !== undefined) ||
      (typeof organizationId !== "string" && organizationId !== undefined) ||
      Boolean(teamId) === Boolean(organizationId)
    ) {
      throw new ApiError(
        400,
        "Provide exactly one of teamId or organizationId",
      );
    }
    if (teamId) {
      await verifyTeamAccess(teamId, { requireAdmin: true });
      const team = await prisma.teams.findFirst({
        where: { id: teamId, users: { some: { id: userId } } },
        select: { ownerId: true },
      });
      if (!team) {
        throw new ApiError(404, "User not found in this team");
      }
      if (team.ownerId === userId) {
        throw new ApiError(
          409,
          "Transfer team ownership before removing this user",
        );
      }
    } else if (organizationId) {
      await verifyOrganizationAccess(organizationId);
      const target = await prisma.user.findFirst({
        where: {
          id: userId,
          organizations: { some: { id: organizationId } },
        },
        select: { id: true },
      });
      if (!target) {
        throw new ApiError(404, "User not found in this organization");
      }
    }
    await deleteUser(userId, organizationId, teamId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const apiError = handleApiError(error);
    if (apiError) return apiError;
    const { userId } = await params;
    logger.error({ error, userId }, "Error deleting user");
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 },
    );
  }
}
