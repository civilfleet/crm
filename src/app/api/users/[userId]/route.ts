import { NextResponse } from "next/server";
import {
  ApiError,
  getAuthenticatedSession,
  handleApiError,
  verifyOrganizationAccess,
  verifyTeamAccess,
} from "@/lib/api-guard";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { handlePrismaError } from "@/lib/utils";
import { deleteUser, getUserById } from "@/services/users";
import { Roles } from "@/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;
    const session = await getAuthenticatedSession();
    if (session.user.userId !== userId) {
      const sharedScope = await prisma.user.findFirst({
        where: {
          id: userId,
          OR: [
            {
              teams: {
                some: { users: { some: { id: session.user.userId } } },
              },
            },
            {
              organizations: {
                some: { users: { some: { id: session.user.userId } } },
              },
            },
          ],
        },
        select: { id: true },
      });
      if (!sharedScope && !session.user.roles?.includes(Roles.Admin)) {
        throw new ApiError(403, "Forbidden - User access required");
      }
    }
    const data = await getUserById(userId);
    return NextResponse.json({ data }, { status: 200 });
  } catch (e) {
    const apiError = handleApiError(e);
    if (apiError) return apiError;
    const { message } = handlePrismaError(e);
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
    const session = await getAuthenticatedSession();
    if (session.user.userId !== userId) {
      if (teamId) {
        await verifyTeamAccess(teamId, { requireAdmin: true });
      } else if (organizationId) {
        await verifyOrganizationAccess(organizationId);
      } else {
        throw new ApiError(400, "teamId or organizationId is required");
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
