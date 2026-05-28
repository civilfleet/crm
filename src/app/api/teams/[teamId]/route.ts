import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { normalizeLoginDomain } from "@/lib/auth-routing";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { getTeamAdminAccess } from "@/services/teams/access";
import { updateTeamSchema } from "@/validations/team";

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const sanitizeTeamResponse = <T extends Record<string, unknown>>(
  team: T & { oidcClientSecret?: string | null },
) => {
  const { oidcClientSecret, ...safeTeam } = team;
  return {
    ...safeTeam,
    hasOidcClientSecret: Boolean(oidcClientSecret),
  };
};

export async function GET(
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
      where: {
        id: teamId,
      },
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json(sanitizeTeamResponse(team));
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to fetch team" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { teamId } = await params;
    const body = await request.json();
    const access = await getTeamAdminAccess(
      session.user.userId,
      teamId,
      session.user.roles,
    );
    if (!access.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const normalizedBody = {
      ...body,
      loginDomain: normalizeOptionalString(body?.loginDomain),
      oidcIssuer: normalizeOptionalString(body?.oidcIssuer),
      oidcClientId: normalizeOptionalString(body?.oidcClientId),
      oidcClientSecret: normalizeOptionalString(body?.oidcClientSecret),
      defaultOidcGroupId: normalizeOptionalString(body?.defaultOidcGroupId),
    };
    const validatedData = updateTeamSchema.parse(normalizedBody);
    const {
      name,
      email,
      loginMethod,
      oidcIssuer,
      oidcClientId,
      oidcClientSecret,
      autoProvisionUsersFromOidc,
      defaultOidcGroupId,
      registrationPageLogoKey,
      phone,
      address,
      postalCode,
      city,
      country,
      website,
      strategicPriorities,
      bankDetails,
      user,
    } = validatedData;
    const hasLoginDomain = Object.hasOwn(normalizedBody, "loginDomain");
    const hasAutoProvisionUsersFromOidc = Object.hasOwn(
      normalizedBody,
      "autoProvisionUsersFromOidc",
    );
    const hasDefaultOidcGroupId = Object.hasOwn(
      normalizedBody,
      "defaultOidcGroupId",
    );
    const loginDomain = hasLoginDomain
      ? normalizeLoginDomain(validatedData.loginDomain)
      : undefined;

    // Start a transaction to handle all updates
    const team = await prisma.$transaction(async (tx) => {
      // Update bank details if provided
      let bankDetailsId: string | undefined;
      if (hasDefaultOidcGroupId && defaultOidcGroupId) {
        const defaultGroup = await tx.group.findFirst({
          where: {
            id: defaultOidcGroupId,
            teamId,
          },
          select: {
            id: true,
          },
        });
        if (!defaultGroup) {
          throw new Error(
            "Selected default OIDC group does not belong to this team",
          );
        }
      }

      const existingTeamAuth = await tx.teams.findUnique({
        where: { id: teamId },
        select: {
          loginDomain: true,
          domainVerifiedAt: true,
          domainLastCheckedAt: true,
          domainVerificationToken: true,
          oidcClientSecret: true,
        },
      });

      const normalizedExistingLoginDomain = normalizeLoginDomain(
        existingTeamAuth?.loginDomain ?? null,
      );
      const isLoginDomainChanged =
        hasLoginDomain && loginDomain !== normalizedExistingLoginDomain;
      if (bankDetails) {
        const existingTeam = await tx.teams.findUnique({
          where: { id: teamId },
          select: { bankDetailsId: true },
        });

        if (existingTeam?.bankDetailsId) {
          // Update existing bank details
          await tx.bankDetails.update({
            where: { id: existingTeam.bankDetailsId },
            data: {
              bankName: bankDetails.bankName,
              accountHolder: bankDetails.accountHolder,
              iban: bankDetails.iban,
              bic: bankDetails.bic,
            },
          });
          bankDetailsId = existingTeam.bankDetailsId;
        } else {
          // Create new bank details
          const newBankDetails = await tx.bankDetails.create({
            data: {
              bankName: bankDetails.bankName,
              accountHolder: bankDetails.accountHolder,
              iban: bankDetails.iban,
              bic: bankDetails.bic,
            },
          });
          bankDetailsId = newBankDetails.id;
        }
      }

      const resolvedOidcClientSecret =
        oidcClientSecret ?? existingTeamAuth?.oidcClientSecret ?? undefined;

      if (loginMethod === "OIDC" && !resolvedOidcClientSecret) {
        throw new Error(
          "OIDC client secret is required when login method is OIDC",
        );
      }

      // Update team information
      const updatedTeam = await tx.teams.update({
        where: {
          id: teamId,
        },
        data: {
          name,
          email,
          loginMethod,
          oidcIssuer,
          oidcClientId,
          oidcClientSecret: resolvedOidcClientSecret,
          ...(hasAutoProvisionUsersFromOidc
            ? {
                autoProvisionUsersFromOidc: Boolean(autoProvisionUsersFromOidc),
              }
            : {}),
          ...(hasDefaultOidcGroupId
            ? { defaultOidcGroupId: defaultOidcGroupId ?? null }
            : {}),
          phone,
          address,
          postalCode,
          city,
          country,
          website,
          registrationPageLogoKey,
          strategicPriorities,
          bankDetailsId,
          ...(isLoginDomainChanged
            ? {
                domainVerifiedAt: null,
                domainLastCheckedAt: null,
                domainVerificationToken: null,
              }
            : {}),
          ...(hasLoginDomain ? { loginDomain } : {}),
        },
        include: {
          bankDetails: true,
          users: true,
        },
      });

      // Update or create user if provided
      if (user) {
        const existingUser = await tx.user.findFirst({
          where: {
            teams: {
              some: {
                id: teamId,
              },
            },
          },
        });

        if (existingUser) {
          // Update existing user
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              name: user.name,
              email: user.email,
              phone: user.phone,
              address: user.address,
            },
          });
        } else {
          // Create new user and connect to team
          const _newUser = await tx.user.create({
            data: {
              name: user.name,
              email: user.email,
              phone: user.phone,
              address: user.address,
              roles: ["Team"],
              teams: {
                connect: { id: teamId },
              },
            },
          });
        }
      }

      return updatedTeam;
    });

    return NextResponse.json(
      sanitizeTeamResponse(
        team as Record<string, unknown> & { oidcClientSecret?: string | null },
      ),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid request payload" },
        { status: 400 },
      );
    }
    if (error instanceof Error) {
      if (error.message.includes("default OIDC group")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    logger.error({ error }, "Error updating team");
    return NextResponse.json(
      { error: "Failed to update team" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    await prisma.teams.delete({
      where: {
        id: teamId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to delete team" },
      { status: 500 },
    );
  }
}
