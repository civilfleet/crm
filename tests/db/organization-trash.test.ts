import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  createFundingRequest,
  db,
  disconnect,
  loadService,
  resetDatabase,
} from "./helpers";

/*
  Organizations in the trash (docs/DATA_RULES.md): deleting moves one there,
  where it and its funding requests leave every list; restoring brings it
  back as it was; only an organization in the trash can be deleted for good.
*/

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const boundaries = {
  "@/lib/api-guard": { ApiError },
  "@/auth": { auth: async () => null },
  "@/lib/utils": { handlePrismaError: (error: unknown) => error },
};

// biome-ignore lint/suspicious/noExplicitAny: each service has its own shape
type Service = Record<string, any>;
const organizations = loadService<Service>(
  "src/services/organizations/index.ts",
  boundaries,
);
const fundingRequests = loadService<Service>(
  "src/services/funding-request/index.ts",
  boundaries,
);

beforeEach(resetDatabase);
after(disconnect);

const listed = async (teamId: string, deleted?: "trashed") =>
  (
    await organizations.getOrganizations("", teamId, [], undefined, deleted)
  ).data.map(({ id }: { id: string }) => id);

const requestsOf = async (teamId: string) =>
  (
    await fundingRequests.getFundingRequests({ teamId, orgId: "" }, "")
  ).data.map(({ id }: { id: string }) => id);

test("the trash hides an organization and its requests; restore brings them back", async () => {
  const { team, organization, fundingRequest } = await createFundingRequest();

  await organizations.trashOrganization(organization.id);
  assert.deepEqual(await listed(team.id), []);
  assert.deepEqual(await listed(team.id, "trashed"), [organization.id]);
  assert.deepEqual(await requestsOf(team.id), []);
  assert.equal(
    await db.fundingRequest.count({ where: { id: fundingRequest.id } }),
    1,
    "nothing is deleted",
  );

  await organizations.restoreOrganization(organization.id);
  assert.deepEqual(await listed(team.id), [organization.id]);
  assert.deepEqual(await listed(team.id, "trashed"), []);
  assert.deepEqual(await requestsOf(team.id), [fundingRequest.id]);
});

test("only an organization in the trash can be deleted for good", async () => {
  const { organization, fundingRequest } = await createFundingRequest();

  await assert.rejects(
    organizations.permanentlyDeleteOrganization(organization.id),
    /trash/,
  );
  assert.equal(
    await db.organization.count({ where: { id: organization.id } }),
    1,
  );

  await organizations.trashOrganization(organization.id);
  await organizations.permanentlyDeleteOrganization(organization.id);
  assert.equal(
    await db.organization.count({ where: { id: organization.id } }),
    0,
  );
  assert.equal(
    await db.fundingRequest.count({ where: { id: fundingRequest.id } }),
    0,
    "its funding requests go with it",
  );
});

test("a new organization cannot take the address of one in the trash", async () => {
  const { team, organization } = await createFundingRequest();
  await organizations.trashOrganization(organization.id);

  await assert.rejects(
    organizations.createOrUpdateOrganization({
      name: "Again",
      email: organization.email,
      teamId: team.id,
    }),
    /in the trash/,
  );
});
