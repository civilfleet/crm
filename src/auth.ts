import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import authConfig from "./config/auth";
import mailConfig from "./config/mail";
import {
  extractEmailDomain,
  loadTeamOidcProviders,
  normalizeLoginDomain,
  resolveExpectedProviderByEmail,
} from "./lib/auth-routing";
import logger from "./lib/logger";
import prisma from "./lib/prisma";
import { ensureDefaultGroup } from "./services/groups";
import type { Roles } from "./types";

declare module "next-auth" {
  interface Session {
    user: {
      accessToken?: string;
      provider?: string;
      roles?: Roles[];
      organizationId?: string;
      teamId?: string;
      userId?: string;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  let teamOidcProviders: Awaited<ReturnType<typeof loadTeamOidcProviders>> = [];

  try {
    teamOidcProviders = await loadTeamOidcProviders();
  } catch (error) {
    logger.error({ error }, "Failed to load team OIDC providers");
  }

  const config: NextAuthConfig = {
    ...authConfig,
    adapter: PrismaAdapter(prisma),
    providers: [
      Nodemailer({
        server: mailConfig,
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        maxAge: 24 * 60 * 60, // 24 hours
      }),
      ...teamOidcProviders,
    ],
    session: { strategy: "jwt" },
    callbacks: {
      async signIn({ user, account }) {
        if (!account || !user.email) return false;

        let userExist = await prisma.user.findFirst({
          where: { email: user.email as string },
        });

        if (!userExist) {
          const providerId = account.provider;
          if (!providerId.startsWith("oidc-")) {
            logger.warn(
              { email: user.email, provider: providerId },
              "Sign-in denied: user does not exist and provider is not OIDC",
            );
            return false;
          }

          const teamId = providerId.replace("oidc-", "");
          const team = await prisma.teams.findUnique({
            where: { id: teamId },
            select: {
              id: true,
              loginMethod: true,
              loginDomain: true,
              domainVerifiedAt: true,
              autoProvisionUsersFromOidc: true,
              defaultOidcGroupId: true,
            },
          });

          const userEmailDomain = extractEmailDomain(user.email);
          const teamLoginDomain = normalizeLoginDomain(team?.loginDomain);
          const canAutoProvision = Boolean(
            team &&
              team.loginMethod === "OIDC" &&
              team.domainVerifiedAt &&
              team.autoProvisionUsersFromOidc &&
              userEmailDomain &&
              teamLoginDomain &&
              userEmailDomain === teamLoginDomain,
          );

          if (!canAutoProvision) {
            logger.warn(
              {
                email: user.email,
                provider: providerId,
                teamId,
                hasTeam: Boolean(team),
                loginMethod: team?.loginMethod,
                domainVerified: Boolean(team?.domainVerifiedAt),
                autoProvisionUsersFromOidc: Boolean(
                  team?.autoProvisionUsersFromOidc,
                ),
                userEmailDomain,
                teamLoginDomain,
              },
              "Sign-in denied: OIDC auto-provisioning not allowed for user",
            );
            return false;
          }

          try {
            await prisma.$transaction(async (tx) => {
              const createdUser = await tx.user.create({
                data: {
                  email: user.email as string,
                  name: user.name,
                  roles: ["Team"],
                  teams: {
                    connect: {
                      id: teamId,
                    },
                  },
                },
              });

              if (team?.defaultOidcGroupId) {
                const selectedGroup = await tx.group.findFirst({
                  where: {
                    id: team.defaultOidcGroupId,
                    teamId,
                  },
                  select: {
                    id: true,
                  },
                });

                if (selectedGroup) {
                  await tx.userGroup.create({
                    data: {
                      userId: createdUser.id,
                      groupId: selectedGroup.id,
                    },
                  });
                  return;
                }

                logger.warn(
                  { teamId, defaultOidcGroupId: team.defaultOidcGroupId },
                  "Configured default OIDC group not found in team; using team default group",
                );
              }

              const defaultGroup = await ensureDefaultGroup(teamId, tx);
              await tx.userGroup.createMany({
                data: [
                  {
                    userId: createdUser.id,
                    groupId: defaultGroup.id,
                  },
                ],
                skipDuplicates: true,
              });
            });

            logger.info(
              { email: user.email, teamId },
              "Auto-provisioned user from OIDC sign-in",
            );
          } catch (error) {
            logger.error(
              { error, email: user.email, teamId },
              "Failed to auto-provision OIDC user",
            );
            return false;
          }

          userExist = await prisma.user.findFirst({
            where: { email: user.email as string },
          });
          if (!userExist) {
            return false;
          }
        }

        try {
          const expectedProvider = await resolveExpectedProviderByEmail(
            user.email,
          );
          if (expectedProvider !== account.provider) {
            logger.warn(
              {
                email: user.email,
                expectedProvider,
                actualProvider: account.provider,
              },
              "Sign-in denied due to provider mismatch",
            );
            return false;
          }
        } catch (error) {
          logger.error(
            { error, email: user.email, provider: account.provider },
            "Error resolving expected provider during sign-in",
          );
          return false;
        }

        return true;
      },

      async jwt({ token, user, account }) {
        if (account && user) {
          token.accessToken = account.access_token;
          token.provider = account.provider;
          const userExist = await prisma.user.findFirst({
            where: { email: user.email as string },
            select: {
              roles: true,
              id: true,
            },
          });

          token.roles = userExist?.roles;
          token.userId = userExist?.id;
        }

        return token;
      },

      async session({ session, token }) {
        const accessToken = token.accessToken as string | undefined;
        if (session.user) {
          session.user.accessToken = accessToken;
          session.user.userId = token.userId as string | undefined;
          session.user.roles = token.roles as Roles[] | undefined;
          session.user.organizationId = token.organizationId as
            | string
            | undefined;
          session.user.teamId = token.teamId as string | undefined;
        }

        return session;
      },
    },
  };

  return config;
});