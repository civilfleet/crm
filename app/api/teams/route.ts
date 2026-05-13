import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { normalizeLoginDomain } from "@/lib/auth-routing";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { Roles } from "@/types";
import { createTeamSchema } from "@/validations/team";

const hasAdminRole = (roles?: Roles[] | string[]) =>
  Boolean(roles?.includes(Roles.Admin));

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

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasAdminRole(session.user.roles)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const teams = await prisma.teams.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      data: teams.map((team) => sanitizeTeamResponse(team)),
    });
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to fetch teams" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasAdminRole(session.user.roles)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const normalizedBody = {
      ...body,
      loginDomain: normalizeOptionalString(body?.loginDomain),
      oidcIssuer: normalizeOptionalString(body?.oidcIssuer),
      oidcClientId: normalizeOptionalString(body?.oidcClientId),
      oidcClientSecret: normalizeOptionalString(body?.oidcClientSecret),
      defaultOidcGroupId: normalizeOptionalString(body?.defaultOidcGroupId),
    };
    const validatedData = createTeamSchema.parse(normalizedBody);
    const {
      name,
      email,
      loginMethod,
      oidcIssuer,
      oidcClientId,
      oidcClientSecret,
      autoProvisionUsersFromOidc,
      user,
      phone,
      address,
      postalCode,
      city,
      country,
      website,
    } = validatedData;
    const loginDomain = normalizeLoginDomain(validatedData.loginDomain);

    // Use transaction to handle team creation with user
    const team = await prisma.$transaction(async (tx) => {
      // Create the team
      const newTeam = await tx.teams.create({
        data: {
          name,
          email,
          loginMethod,
          loginDomain,
          oidcIssuer,
          oidcClientId,
          oidcClientSecret,
          autoProvisionUsersFromOidc: Boolean(autoProvisionUsersFromOidc),
          phone,
          address,
          postalCode,
          city,
          country,
          website,
        } as any,
        include: {
          users: true,
        },
      });

      // Create or connect user if provided
      if (user) {
        // Check if user already exists with this email
        const existingUser = await tx.user.findUnique({
          where: { email: user.email },
        });

        if (existingUser) {
          // Connect existing user to team and add Team role if not already present
          const updatedRoles = Array.from(
            new Set([...existingUser.roles, Roles.Team]),
          );
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              roles: updatedRoles,
              teams: {
                connect: { id: newTeam.id },
              },
            },
          });
        } else {
          // Create new user and connect to team
          await tx.user.create({
            data: {
              name: user.name,
              email: user.email,
              phone: user.phone,
              address: user.address,
              roles: [Roles.Team],
              teams: {
                connect: { id: newTeam.id },
              },
            },
          });
        }
      }

      return newTeam;
    });

    return NextResponse.json(
      sanitizeTeamResponse(
        team as Record<string, unknown> & {
          oidcClientSecret?: string | null;
        },
      ),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid request payload" },
        { status: 400 },
      );
    }
    logger.error({ error }, "Error creating team");
    return NextResponse.json(
      { error: "Failed to create team" },
      { status: 500 },
    );
  }
}