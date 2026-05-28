import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasModuleAccess } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { getTeamAdminAccess } from "@/services/teams/access";
import { type AppModule, Roles } from "@/types";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Returns the session if authenticated, otherwise throws ApiError(401)
 */
export const getAuthenticatedSession = async () => {
  const session = await auth();
  if (!session?.user?.userId) {
    throw new ApiError(401, "Unauthorized - Please sign in");
  }
  return session;
};

/**
 * Verifies if the authenticated user has access to the specified team.
 * Options:
 * - requireAdmin: Requires TEAM_ADMIN or Owner role.
 * - requireSuperAdmin: Requires global Admin role.
 */
export const verifyTeamAccess = async (
  teamId: string,
  options: {
    requireAdmin?: boolean;
    requireSuperAdmin?: boolean;
    requireModule?: AppModule;
  } = {},
) => {
  const session = await getAuthenticatedSession();
  const userId = session.user.userId;

  if (!userId) {
    throw new ApiError(401, "Unauthorized - Please sign in");
  }

  // Global Admin bypass
  const isSuperAdmin = session.user.roles?.includes(Roles.Admin);
  if (isSuperAdmin) {
    return session;
  }

  if (options.requireSuperAdmin) {
    throw new ApiError(403, "Forbidden - Super Admin access required");
  }

  // Check team-level access
  const access = await getTeamAdminAccess(userId, teamId, session.user.roles);

  if (options.requireAdmin) {
    if (!access.allowed) {
      throw new ApiError(403, "Forbidden - Team Admin access required");
    }
    return session;
  }

  // Regular membership check if not already covered by getTeamAdminAccess
  // Note: getTeamAdminAccess.allowed is currently (isOwner || isAdmin)
  // We need to check if the user is a member at all.
  if (access.allowed) {
    return session;
  }

  const isMember = await prisma.user.findFirst({
    where: {
      id: userId,
      teams: {
        some: { id: teamId },
      },
    },
  });

  if (!isMember) {
    throw new ApiError(403, "Forbidden - You are not a member of this team");
  }

  if (options.requireModule) {
    const hasAccess = await hasModuleAccess(
      { teamId, userId, roles: session.user.roles },
      options.requireModule,
    );
    if (!hasAccess) {
      throw new ApiError(
        403,
        `Forbidden - ${options.requireModule} module access required`,
      );
    }
  }

  return session;
};

/**
 * Helper to catch ApiError and return consistent JSON responses
 */
export const handleApiError = (error: unknown) => {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  return null;
};
