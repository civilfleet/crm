import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasModuleAccess } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { getTeamAdminAccess } from "@/services/teams/access";
import { type AppModule, DEFAULT_TEAM_MODULES, Roles } from "@/types";
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

export const requireGlobalAdmin = async () => {
  const session = await getAuthenticatedSession();
  if (!session.user.roles?.includes(Roles.Admin)) {
    throw new ApiError(403, "Forbidden - Super Admin access required");
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

type OrganizationAccessOptions = {
  requireTeamAdmin?: boolean;
  requireTeamMember?: boolean;
  requireModule?: AppModule;
};

export type OrganizationAccess = {
  session: Awaited<ReturnType<typeof getAuthenticatedSession>>;
  organizationId: string;
  teamId: string | null;
  isGlobalAdmin: boolean;
  isTeamMember: boolean;
  isTeamAdmin: boolean;
  isOrganizationMember: boolean;
};

/**
 * Authorizes access to an organization from the persisted membership graph.
 * Organization members may access their own organization. Team members may
 * access organizations belonging to their team. Mutations that are team-only
 * can opt into requireTeamMember or requireTeamAdmin.
 */
export const verifyOrganizationAccess = async (
  organizationId: string,
  options: OrganizationAccessOptions = {},
): Promise<OrganizationAccess> => {
  const session = await getAuthenticatedSession();
  const userId = session.user.userId;
  if (!userId) {
    throw new ApiError(401, "Unauthorized - Please sign in");
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, teamId: true },
  });
  if (!organization) {
    throw new ApiError(404, "Organization not found");
  }

  const isGlobalAdmin = Boolean(session.user.roles?.includes(Roles.Admin));
  let isTeamMember = false;
  let isTeamAdmin = false;

  if (organization.teamId && !isGlobalAdmin) {
    const [membership, adminAccess] = await Promise.all([
      prisma.user.findFirst({
        where: {
          id: userId,
          teams: { some: { id: organization.teamId } },
        },
        select: { id: true },
      }),
      getTeamAdminAccess(userId, organization.teamId, session.user.roles),
    ]);
    isTeamMember = Boolean(membership) || adminAccess.allowed;
    isTeamAdmin = adminAccess.allowed;
  }

  const organizationMembership = await prisma.user.findFirst({
    where: {
      id: userId,
      organizations: { some: { id: organizationId } },
    },
    select: { id: true },
  });
  const isOrganizationMember = Boolean(organizationMembership);

  if (options.requireTeamAdmin && !isGlobalAdmin && !isTeamAdmin) {
    throw new ApiError(403, "Forbidden - Team Admin access required");
  }
  if (options.requireTeamMember && !isGlobalAdmin && !isTeamMember) {
    throw new ApiError(403, "Forbidden - Team access required");
  }
  if (
    !options.requireTeamAdmin &&
    !options.requireTeamMember &&
    !isGlobalAdmin &&
    !isTeamMember &&
    !isOrganizationMember
  ) {
    throw new ApiError(403, "Forbidden - Organization access required");
  }

  const requiredModule = options.requireModule;
  if (requiredModule && organization.teamId && !isGlobalAdmin) {
    const hasAccess =
      isOrganizationMember && !isTeamMember
        ? await prisma.teams
            .findUnique({
              where: { id: organization.teamId },
              select: { modules: true },
            })
            .then((team) => {
              const modules =
                team?.modules && team.modules.length > 0
                  ? team.modules
                  : DEFAULT_TEAM_MODULES;
              return (
                requiredModule !== "ADMIN" && modules.includes(requiredModule)
              );
            })
        : await hasModuleAccess(
            { teamId: organization.teamId, userId, roles: session.user.roles },
            requiredModule,
          );
    if (!hasAccess) {
      throw new ApiError(
        403,
        `Forbidden - ${requiredModule} module access required`,
      );
    }
  }

  return {
    session,
    organizationId,
    teamId: organization.teamId,
    isGlobalAdmin,
    isTeamMember,
    isTeamAdmin,
    isOrganizationMember,
  };
};

export const verifyFundingRequestAccess = async (
  fundingRequestId: string,
  options: OrganizationAccessOptions = {},
) => {
  const fundingRequest = await prisma.fundingRequest.findUnique({
    where: { id: fundingRequestId },
    select: { id: true, organizationId: true, teamId: true },
  });
  if (!fundingRequest) {
    throw new ApiError(404, "Funding request not found");
  }

  const access = await verifyOrganizationAccess(
    fundingRequest.organizationId,
    options,
  );
  return { ...access, fundingRequest };
};

export const verifyDonationAgreementAccess = async (
  donationAgreementId: string,
  options: OrganizationAccessOptions = {},
) => {
  const agreement = await prisma.donationAgreement.findUnique({
    where: { id: donationAgreementId },
    select: {
      id: true,
      organizationId: true,
      fundingRequest: { select: { organizationId: true } },
    },
  });
  if (!agreement) {
    throw new ApiError(404, "Donation agreement not found");
  }

  const organizationId =
    agreement.organizationId ?? agreement.fundingRequest.organizationId;
  const access = await verifyOrganizationAccess(organizationId, options);
  return { ...access, agreement };
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
