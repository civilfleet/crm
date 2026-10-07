import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "../../tests/helpers/load-module";

type TeamAuthConfig = {
  id: string;
  loginMethod: "EMAIL_MAGIC_LINK" | "OIDC";
  emailLoginEnabled: boolean;
  oidcLoginEnabled: boolean;
  oidcButtonLabel: string;
  loginDomain: string;
  domainVerifiedAt: Date;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
};

type AuthRoutingModule = {
  isSignInProviderAllowed: (
    email: string,
    provider: string,
  ) => Promise<boolean>;
  resolveExpectedProviderByEmail: (email: string) => Promise<string>;
  getPublicLoginOptions: () => Promise<{
    emailLoginEnabled: boolean;
    oidc: Array<{ providerId: string; label: string }>;
  }>;
};

const loadAuthRouting = (
  team: TeamAuthConfig | null,
  teams: TeamAuthConfig[] = [],
) =>
  loadModule<AuthRoutingModule>("src/lib/auth-routing.ts", {
    "@/lib/global-settings": {
      getGlobalSettings: async () => ({
        accountCreationContactUrl: "https://support.example.org/join",
      }),
    },
    "@/lib/logger": { debug() {}, info() {}, warn() {} },
    "@/lib/prisma": {
      teams: {
        findFirst: async () => team,
        findMany: async () => teams,
      },
    },
  });

const oidcTeam: TeamAuthConfig = {
  id: "team-a",
  loginMethod: "OIDC",
  emailLoginEnabled: false,
  oidcLoginEnabled: true,
  oidcButtonLabel: "Continue with Sea-Watch SSO",
  loginDomain: "example.org",
  domainVerifiedAt: new Date(),
  oidcIssuer: "https://auth.example.org",
  oidcClientId: "client-id",
  oidcClientSecret: "client-secret",
};

test("OIDC-only teams reject email login and accept their direct provider", async () => {
  const routing = loadAuthRouting(oidcTeam);

  assert.equal(
    await routing.isSignInProviderAllowed("member@example.org", "nodemailer"),
    false,
  );
  assert.equal(
    await routing.isSignInProviderAllowed("member@example.org", "oidc-team-a"),
    true,
  );
  assert.equal(
    await routing.isSignInProviderAllowed(
      "member@example.org",
      "oidc-other-team",
    ),
    false,
  );
  assert.equal(
    await routing.resolveExpectedProviderByEmail("member@example.org"),
    "oidc-team-a",
  );
});

test("teams can allow both email login and their OIDC provider", async () => {
  const routing = loadAuthRouting({
    ...oidcTeam,
    loginMethod: "EMAIL_MAGIC_LINK",
    emailLoginEnabled: true,
  });

  assert.equal(
    await routing.isSignInProviderAllowed("member@example.org", "nodemailer"),
    true,
  );
  assert.equal(
    await routing.isSignInProviderAllowed("member@example.org", "oidc-team-a"),
    true,
  );
  assert.equal(
    await routing.resolveExpectedProviderByEmail("member@example.org"),
    "nodemailer",
  );
});

test("public login options hide email when every team disables it", async () => {
  const routing = loadAuthRouting(oidcTeam, [oidcTeam]);

  assert.deepEqual(await routing.getPublicLoginOptions(), {
    accountCreationContactUrl: "https://support.example.org/join",
    emailLoginEnabled: false,
    oidc: [
      {
        providerId: "oidc-team-a",
        label: "Continue with Sea-Watch SSO",
      },
    ],
  });
});

test("public login options keep email available before a team exists", async () => {
  const routing = loadAuthRouting(null);

  assert.deepEqual(await routing.getPublicLoginOptions(), {
    accountCreationContactUrl: "https://support.example.org/join",
    emailLoginEnabled: true,
    oidc: [],
  });
});
