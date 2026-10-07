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
};

const loadAuthRouting = (team: TeamAuthConfig | null) =>
  loadModule<AuthRoutingModule>("src/lib/auth-routing.ts", {
    "@/lib/logger": { debug() {}, info() {}, warn() {} },
    "@/lib/prisma": {
      teams: {
        findFirst: async () => team,
        findMany: async () => [],
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
