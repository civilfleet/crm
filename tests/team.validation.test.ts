import assert from "node:assert/strict";
import test from "node:test";
import { createTeamSchema, updateTeamSchema } from "../validations/team";

const validBasePayload = {
  name: "Makerspace",
  email: "hello@example.org",
  loginMethod: "EMAIL_MAGIC_LINK" as const,
  phone: "+49 30 123456",
  address: "Street 1",
  postalCode: "10115",
  city: "Berlin",
  country: "Germany",
  website: "https://example.org",
  user: {
    name: "Owner",
    email: "owner@example.org",
    phone: "+49 30 123456",
    address: "Street 1",
  },
};

test("createTeamSchema accepts email magic link teams without OIDC settings", () => {
  const parsed = createTeamSchema.parse(validBasePayload);

  assert.equal(parsed.loginMethod, "EMAIL_MAGIC_LINK");
  assert.equal(parsed.loginDomain, undefined);
  assert.equal(parsed.oidcIssuer, undefined);
});

test("createTeamSchema requires OIDC settings when OIDC login is enabled", () => {
  assert.throws(
    () =>
      createTeamSchema.parse({
        ...validBasePayload,
        loginMethod: "OIDC",
      }),
    (error: unknown) => {
      assert.equal(typeof error, "object");
      const issues = (error as { issues?: Array<{ path: string[]; message: string }> })
        .issues;
      assert.ok(issues);
      assert.deepEqual(
        issues?.map((issue) => issue.path.join(".")),
        ["loginDomain", "oidcIssuer", "oidcClientId", "oidcClientSecret"],
      );
      return true;
    },
  );
});

test("createTeamSchema rejects invalid OIDC issuer URLs", () => {
  assert.throws(
    () =>
      createTeamSchema.parse({
        ...validBasePayload,
        loginMethod: "OIDC",
        loginDomain: "example.org",
        oidcIssuer: "not-a-url",
        oidcClientId: "client-id",
        oidcClientSecret: "client-secret",
      }),
    /OIDC issuer must be a valid URL/,
  );
});

test("updateTeamSchema only validates the OIDC fields that are provided", () => {
  const parsed = updateTeamSchema.parse({
    loginMethod: "OIDC",
    loginDomain: "example.org",
    oidcIssuer: "https://auth.example.org/realms/main",
    oidcClientId: "client-id",
  });

  assert.equal(parsed.loginMethod, "OIDC");
  assert.equal(parsed.oidcClientSecret, undefined);
});
