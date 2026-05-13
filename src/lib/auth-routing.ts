import type { OAuthConfig } from "next-auth/providers";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";

export type SignInProviderId = "nodemailer" | `oidc-${string}`;

const OIDC_LOGIN_METHOD = "OIDC";
const MAGIC_LINK_PROVIDER_ID: SignInProviderId = "nodemailer";

const buildOidcProviderId = (teamId: string) => `oidc-${teamId}` as const;

export const normalizeLoginDomain = (domain?: string | null) => {
  if (!domain) {
    return null;
  }

  const normalized = domain.trim().toLowerCase().replace(/^@+/, "");
  return normalized.length > 0 ? normalized : null;
};

export const extractEmailDomain = (email?: string | null) => {
  if (!email) {
    return null;
  }

  const [, rawDomain] = email.trim().toLowerCase().split("@");
  return normalizeLoginDomain(rawDomain);
};

type TeamAuthConfig = {
  id: string;
  loginMethod?: string;
  loginDomain?: string | null;
  domainVerifiedAt?: Date | null;
  oidcIssuer?: string | null;
  oidcClientId?: string | null;
  oidcClientSecret?: string | null;
};

const getTeamByEmailDomain = async (
  domain: string,
): Promise<TeamAuthConfig | null> => {
  const team = await prisma.teams.findFirst({
    where: {
      loginDomain: domain,
      domainVerifiedAt: {
        not: null,
      },
    },
    select: {
      id: true,
      loginMethod: true,
      loginDomain: true,
      domainVerifiedAt: true,
      oidcIssuer: true,
      oidcClientId: true,
      oidcClientSecret: true,
    },
  });

  return team;
};

const hasOidcCredentials = (team?: TeamAuthConfig | null) =>
  Boolean(team?.oidcIssuer && team?.oidcClientId && team?.oidcClientSecret);

export const resolveExpectedProviderByEmail = async (
  email?: string | null,
): Promise<SignInProviderId> => {
  const domain = extractEmailDomain(email);

  if (!domain) {
    return MAGIC_LINK_PROVIDER_ID;
  }

  const team = await getTeamByEmailDomain(domain);

  if (!team) {
    logger.debug({ domain }, "No verified team OIDC config found for domain");
    return MAGIC_LINK_PROVIDER_ID;
  }

  if (team.loginMethod !== OIDC_LOGIN_METHOD) {
    logger.debug(
      { domain, teamId: team.id, loginMethod: team.loginMethod },
      "Team login method is not OIDC for domain",
    );
    return MAGIC_LINK_PROVIDER_ID;
  }

  if (!hasOidcCredentials(team)) {
    logger.warn(
      {
        domain,
        teamId: team.id,
        hasIssuer: Boolean(team.oidcIssuer),
        hasClientId: Boolean(team.oidcClientId),
        hasClientSecret: Boolean(team.oidcClientSecret),
      },
      "Team OIDC settings are incomplete for domain",
    );
    throw new Error(
      "OIDC login is configured for this domain but team OIDC settings are incomplete.",
    );
  }

  return buildOidcProviderId(team.id);
};

export const loadTeamOidcProviders = async (): Promise<
  OAuthConfig<Record<string, unknown>>[]
> => {
  const teams = await prisma.teams.findMany({
    where: {
      loginMethod: OIDC_LOGIN_METHOD,
      domainVerifiedAt: {
        not: null,
      },
      oidcIssuer: {
        not: null,
      },
      oidcClientId: {
        not: null,
      },
      oidcClientSecret: {
        not: null,
      },
    },
    select: {
      id: true,
      domainVerifiedAt: true,
      oidcIssuer: true,
      oidcClientId: true,
      oidcClientSecret: true,
    },
  });

  logger.info(
    {
      count: teams.length,
      teamIds: teams.map((team) => team.id),
    },
    "Loaded team OIDC providers",
  );

  return teams.map((team) => ({
    id: buildOidcProviderId(team.id),
    name: `OIDC (${team.id})`,
    type: "oidc",
    allowDangerousEmailAccountLinking: true,
    issuer: team.oidcIssuer ?? undefined,
    clientId: team.oidcClientId ?? undefined,
    clientSecret: team.oidcClientSecret ?? undefined,
    checks: ["pkce", "state"],
    authorization: {
      params: {
        scope: "openid profile email",
      },
    },
    profile(profile) {
      const email =
        typeof profile.email === "string" ? profile.email : undefined;
      const sub = typeof profile.sub === "string" ? profile.sub : email;

      return {
        id: sub ?? "",
        name: typeof profile.name === "string" ? profile.name : null,
        email: email ?? null,
        image: typeof profile.picture === "string" ? profile.picture : null,
      };
    },
  }));
};