import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

class ProviderError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type AddressRoute = {
  GET: (request: Request) => Promise<Response>;
};

const TEAM_A = "00000000-0000-4000-8000-000000000001";
const TEAM_B = "00000000-0000-4000-8000-000000000002";
const ORGANIZATION = "00000000-0000-4000-8000-000000000003";
const session = { user: { userId: "actor", roles: [] } };

const makeRoute = ({
  organizationTeamId = TEAM_A,
  search = async () => [],
}: {
  organizationTeamId?: string;
  search?: (input: Record<string, unknown>) => Promise<unknown[]>;
} = {}) =>
  loadModule<AddressRoute>("src/app/api/address-suggestions/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/api-guard": {
      ApiError,
      handleApiError: (error: unknown) =>
        error instanceof ApiError
          ? Response.json({ error: error.message }, { status: error.status })
          : null,
      verifyOrganizationAccess: async () => ({
        session,
        teamId: organizationTeamId,
      }),
      verifyTeamAccess: async () => session,
    },
    "@/lib/countries": {
      normalizeCountryCode: (value?: string) =>
        value === "Germany" ? "DE" : undefined,
    },
    "@/lib/prisma": {
      teams: {
        findUnique: async () => ({ country: "Germany", postalCode: "10115" }),
      },
      postalCodeCentroid: {
        findUnique: async () => ({ latitude: 52.532, longitude: 13.384 }),
      },
    },
    "@/lib/public-rate-limit": { enforcePublicRateLimit() {} },
    "@/services/address-suggestions": {
      AddressSuggestionProviderError: ProviderError,
      searchAddressSuggestions: search,
    },
  });

test("rejects mismatched organization and team address-search scopes", async () => {
  let searched = false;
  const route = makeRoute({
    organizationTeamId: TEAM_B,
    search: async () => {
      searched = true;
      return [];
    },
  });
  const request = new Request(
    `https://test.invalid/api/address-suggestions?query=Berlin&teamId=${TEAM_A}&organizationId=${ORGANIZATION}`,
  );

  assert.equal((await route.GET(request)).status, 403);
  assert.equal(searched, false);
});

test("uses selected country as a restriction instead of team coordinates", async () => {
  let searchInput: Record<string, unknown> | undefined;
  const route = makeRoute({
    search: async (input) => {
      searchInput = input;
      return [];
    },
  });
  const request = new Request(
    `https://test.invalid/api/address-suggestions?query=Pariser%20Platz&teamId=${TEAM_A}&country=Germany`,
    { headers: { "Accept-Language": "de-DE,de;q=0.9" } },
  );

  assert.equal((await route.GET(request)).status, 200);
  assert.deepEqual(searchInput, {
    query: "Pariser Platz",
    countryCode: "DE",
    latitude: undefined,
    longitude: undefined,
    language: "de",
  });
});

test("falls back to the team postal centroid when country is empty", async () => {
  let searchInput: Record<string, unknown> | undefined;
  const route = makeRoute({
    search: async (input) => {
      searchInput = input;
      return [];
    },
  });
  const request = new Request(
    `https://test.invalid/api/address-suggestions?query=Invalidenstrasse&teamId=${TEAM_A}`,
  );

  assert.equal((await route.GET(request)).status, 200);
  assert.equal(searchInput?.latitude, 52.532);
  assert.equal(searchInput?.longitude, 13.384);
  assert.equal(searchInput?.countryCode, undefined);
});
