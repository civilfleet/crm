import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import authConfig from "./config/auth";
import { resolveMailConfiguration } from "./config/mail";
import {
  extractEmailDomain,
  isSignInProviderAllowed,
  loadTeamOidcProviders,
  normalizeLoginDomain,
} from "./lib/auth-routing";
import logger from "./lib/logger";
import prisma from "./lib/prisma";
import { ensureDefaultGroup } from "./services/groups";
import type { Roles } from "./types";

declare module "next-auth" {
  interface Session {
    user: {
      provider?: string;
      roles?: Roles[];
      organizationId?: string;
      teamId?: string;
      userId?: string;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const { config: mailConfig } = resolveMailConfiguration(process.env);
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
    events: {
      async signIn({ user }) {
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });
        } catch (error) {
          logger.error(
            { error, userId: user.id },
            "Failed to record user last login",
          );
        }
      },
    },
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
              oidcLoginEnabled: true,
              loginDomain: true,
              domainVerifiedAt: true,
              autoProvisionUsersFromOidc: true,
              defaultOidcGroupId: true,
            },
          });

          const userEmailDomain = extractEmailDomain(user.email);
          const teamLoginDomain = normalizeLoginDomain(team?.loginDomain);
          const canAutoProvision = Boolean(
            team?.oidcLoginEnabled &&
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
                oidcLoginEnabled: Boolean(team?.oidcLoginEnabled),
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
          const isProviderAllowed = await isSignInProviderAllowed(
            user.email,
            account.provider,
          );
          if (!isProviderAllowed) {
            logger.warn(
              {
                email: user.email,
                actualProvider: account.provider,
              },
              "Sign-in denied because the provider is disabled or mismatched",
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
        // The identity provider's access token is never needed here, and
        // anything in the session can end up in page HTML: keep it out.
        // Sessions from before this still carry one; drop it on refresh.
        delete token.accessToken;
        if (account && user) {
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
        if (session.user) {
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
