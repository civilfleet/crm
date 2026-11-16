import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { FundingStatus } from "@/types";
import {
  createFundingRequest,
  createUser,
  db,
  disconnect,
  loadService,
  resetDatabase,
} from "./helpers";

/*
  The records lists page, sort and filter on the server. These check that
  every page is still scoped to its team or organization, that sorting is
  stable across pages, and that each filter does what its chip says.
*/

type Page = { page: number; pageSize: number; sorts?: Sort[] };
type Sort = { field: string; direction: "asc" | "desc" };
type Result<T> = { data: T[]; total: number };

type TransactionsService = {
  getTransactions: (input: {
    teamId?: string;
    organizationId?: string;
    searchQuery?: string;
    receipts?: string[];
    pagination?: Page;
  }) => Promise<Result<{ id: string; amount: unknown }>>;
};
type FundingRequestService = {
  getFundingRequests: (
    scope: { teamId: string; orgId: string },
    searchQuery: string,
    status?: string[] | null,
    pagination?: Page,
  ) => Promise<Result<{ id: string; name: string }>>;
};
type DonationAgreementService = {
  getDonationAgreements: (
    scope: { teamId: string; orgId: string },
    searchQuery: string,
    options?: { signatures?: string[]; pagination?: Page },
  ) => Promise<Result<{ id: string }>>;
};
type TeamsService = {
  getTeamsPage: (input: {
    query: string;
    modules: string[];
    page: number;
    pageSize: number;
    sorts: Sort[];
  }) => Promise<Result<{ id: string; name: string; city: string | null }>>;
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const transactions = loadService<TransactionsService>(
  "src/services/transactions/index.ts",
);
const fundingRequests = loadService<FundingRequestService>(
  "src/services/funding-request/index.ts",
  {
    "@/auth": { auth: async () => null },
    "@/lib/utils": { handlePrismaError: (error: unknown) => error },
  },
);
const donationAgreements = loadService<DonationAgreementService>(
  "src/services/donation-agreement/index.ts",
  {
    "@/lib/api-guard": { ApiError },
    "@/services/file/pending-uploads": {
      assertPendingUploadsAvailable: async () => undefined,
      consumePendingUploads: async () => undefined,
    },
    "@/services/file/s3-service": {
      assertStoredFileExists: async () => undefined,
    },
  },
);
const teams = loadService<TeamsService>("src/services/teams/index.ts");

beforeEach(resetDatabase);
after(disconnect);

const ids = (rows: Array<{ id: string }>) => rows.map(({ id }) => id);

/** Pages through a whole list, as the table does. */
const allPages = async <T extends { id: string }>(
  read: (page: number) => Promise<Result<T>>,
) => {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const result = await read(page);
    rows.push(...result.data);
    if (result.data.length === 0 || rows.length >= result.total) {
      return { rows, total: result.total };
    }
  }
};

const addTransactions = async (
  setup: Awaited<ReturnType<typeof createFundingRequest>>,
  amounts: number[],
) => {
  for (const amount of amounts) {
    await db.transaction.create({
      data: {
        amount,
        totalAmount: 1000,
        remainingAmount: 1000 - amount,
        fundingRequestId: setup.fundingRequest.id,
        organizationId: setup.organization.id,
        teamId: setup.team.id,
      },
    });
  }
};

test("transactions: pages hold only the team's rows, each exactly once", async () => {
  const mine = await createFundingRequest({ amountAgreed: 1000 });
  const other = await createFundingRequest({ amountAgreed: 1000 });
  // Equal amounts: only the id keeps their order stable across pages.
  await addTransactions(mine, [10, 10, 10, 10, 10, 20, 30]);
  await addTransactions(other, [10, 10]);

  const { rows, total } = await allPages((page) =>
    transactions.getTransactions({
      teamId: mine.team.id,
      pagination: {
        page,
        pageSize: 2,
        sorts: [{ field: "amount", direction: "asc" }],
      },
    }),
  );

  assert.equal(total, 7);
  assert.equal(new Set(ids(rows)).size, 7, "no row twice, none skipped");
  assert.deepEqual(
    rows.map(({ amount }) => Number(amount)),
    [10, 10, 10, 10, 10, 20, 30],
  );
  const theirs = await db.transaction.findMany({
    where: { teamId: other.team.id },
  });
  assert.ok(ids(theirs).every((id) => !ids(rows).includes(id)));
});

test("transactions: the receipt filter and the search", async () => {
  const setup = await createFundingRequest({ amountAgreed: 1000 });
  await addTransactions(setup, [10, 20]);
  const user = await createUser("Uploader");
  const receipt = await db.file.create({
    data: {
      url: "receipts/one.pdf",
      type: "TRANSACTION_RECEIPT",
      createdById: user.id,
      updatedById: user.id,
    },
  });
  const [first] = await db.transaction.findMany({ orderBy: { amount: "asc" } });
  await db.transaction.update({
    where: { id: first.id },
    data: { transactionReciept: receipt.id },
  });
  const page = { page: 1, pageSize: 50 };

  const read = (input: Parameters<TransactionsService["getTransactions"]>[0]) =>
    transactions.getTransactions({
      teamId: setup.team.id,
      pagination: page,
      ...input,
    });
  assert.equal((await read({ receipts: ["uploaded"] })).total, 1);
  assert.equal((await read({ receipts: ["missing"] })).total, 1);
  assert.equal((await read({ receipts: ["uploaded", "missing"] })).total, 2);
  assert.equal((await read({ searchQuery: "rescue BOAT" })).total, 2);
  assert.equal(
    (await read({ searchQuery: setup.organization.name ?? "" })).total,
    2,
  );
  assert.equal((await read({ searchQuery: "nothing like it" })).total, 0);
});

test("transactions: without paging, every row as before", async () => {
  const setup = await createFundingRequest({ amountAgreed: 1000 });
  await addTransactions(setup, [10, 20, 30]);

  const result = await transactions.getTransactions({ teamId: setup.team.id });
  assert.equal(result.data.length, 3);
  assert.equal(result.total, 3);
});

test("funding requests: search any field people know them by, any case", async () => {
  const setup = await createFundingRequest({ amountAgreed: 100 });
  await createFundingRequest({ amountAgreed: 100 });
  const scope = { teamId: setup.team.id, orgId: "" };
  const page = { page: 1, pageSize: 50 };

  for (const query of ["RESCUE boat", "safety", "new engine"]) {
    const result = await fundingRequests.getFundingRequests(
      scope,
      query,
      [],
      page,
    );
    assert.deepEqual(ids(result.data), [setup.fundingRequest.id], query);
  }
});

test("funding requests: status filter, organization scope and sort", async () => {
  const first = await createFundingRequest({ amountAgreed: 300 });
  const team = first.team;
  // A second request of the same team, under another organization.
  const organization = await db.organization.create({
    data: { name: "Aaa harbour", email: "aaa@example.org", teamId: team.id },
  });
  const second = await db.fundingRequest.create({
    data: {
      name: "Life jackets",
      description: "Jackets",
      purpose: "Safety",
      refinancingConcept: "Donations",
      sustainability: "Years",
      amountRequested: 50,
      expectedCompletionDate: new Date("2027-01-01T00:00:00Z"),
      status: FundingStatus.Submitted,
      organizationId: organization.id,
      teamId: team.id,
      submittedById: first.submitter.id,
    },
  });
  const page = { page: 1, pageSize: 50 };

  const submitted = await fundingRequests.getFundingRequests(
    { teamId: team.id, orgId: "" },
    "",
    [FundingStatus.Submitted],
    page,
  );
  assert.deepEqual(ids(submitted.data), [second.id]);

  const ofOrganization = await fundingRequests.getFundingRequests(
    { teamId: "", orgId: organization.id },
    "",
    [],
    page,
  );
  assert.deepEqual(ids(ofOrganization.data), [second.id]);

  // No agreed amount sorts last, whichever the direction.
  for (const direction of ["asc", "desc"] as const) {
    const sorted = await fundingRequests.getFundingRequests(
      { teamId: team.id, orgId: "" },
      "",
      [],
      { ...page, sorts: [{ field: "amountAgreed", direction }] },
    );
    assert.deepEqual(ids(sorted.data), [first.fundingRequest.id, second.id]);
  }

  const byOrganization = await fundingRequests.getFundingRequests(
    { teamId: team.id, orgId: "" },
    "",
    [],
    { ...page, sorts: [{ field: "organization", direction: "asc" }] },
  );
  assert.deepEqual(ids(byOrganization.data), [
    second.id,
    first.fundingRequest.id,
  ]);
});

test("donation agreements: signed and waiting, within the team", async () => {
  const signedSetup = await createFundingRequest({ amountAgreed: 100 });
  const user = await createUser("Signer");
  const agreement = async (
    setup: Awaited<ReturnType<typeof createFundingRequest>>,
    signedAt: Date | null,
  ) => {
    const file = await db.file.create({
      data: {
        url: `agreements/${setup.fundingRequest.id}.pdf`,
        type: "DONATION_AGREEMENT",
        createdById: user.id,
        updatedById: user.id,
      },
    });
    return db.donationAgreement.create({
      data: {
        agreement: "Terms",
        fileId: file.id,
        fundingRequestId: setup.fundingRequest.id,
        createdById: user.id,
        teamId: setup.team.id,
        organizationId: setup.organization.id,
        userSignatures: { create: { userId: user.id, signedAt } },
      },
    });
  };
  const signed = await agreement(signedSetup, new Date());
  // A waiting agreement of the same team.
  const waitingRequest = await db.fundingRequest.create({
    data: {
      name: "Second request",
      description: "Another engine",
      purpose: "Safety",
      refinancingConcept: "Donations",
      sustainability: "Years",
      amountRequested: 100,
      amountAgreed: 100,
      expectedCompletionDate: new Date("2027-01-01T00:00:00Z"),
      organizationId: signedSetup.organization.id,
      teamId: signedSetup.team.id,
      submittedById: signedSetup.submitter.id,
    },
  });
  const waiting = await agreement(
    { ...signedSetup, fundingRequest: waitingRequest },
    null,
  );
  const otherTeam = await createFundingRequest({ amountAgreed: 100 });
  await agreement(otherTeam, null);
  const scope = { teamId: signedSetup.team.id, orgId: "" };
  const pagination = { page: 1, pageSize: 50 };

  const read = (signatures: string[]) =>
    donationAgreements.getDonationAgreements(scope, "", {
      signatures,
      pagination,
    });
  assert.deepEqual(ids((await read(["signed"])).data), [signed.id]);
  assert.deepEqual(ids((await read(["pending"])).data), [waiting.id]);
  assert.equal((await read([])).total, 2);
});

test("teams: search, module filter and city sort with empty cities last", async () => {
  await db.teams.createMany({
    data: [
      {
        name: "Alpha",
        email: "alpha@example.org",
        city: "Berlin",
        modules: ["CRM"],
      },
      {
        name: "Beta",
        email: "beta@example.org",
        city: null,
        modules: ["FUNDING"],
      },
      {
        name: "Gamma",
        email: "gamma@example.org",
        city: "Aachen",
        modules: ["CRM", "FUNDING"],
      },
    ],
  });
  const read = (input: Partial<Parameters<TeamsService["getTeamsPage"]>[0]>) =>
    teams.getTeamsPage({
      query: "",
      modules: [],
      page: 1,
      pageSize: 50,
      sorts: [{ field: "createdAt", direction: "desc" }],
      ...input,
    });

  assert.deepEqual(
    (await read({ sorts: [{ field: "city", direction: "asc" }] })).data.map(
      ({ name }) => name,
    ),
    ["Gamma", "Alpha", "Beta"],
  );
  assert.deepEqual(
    (
      await read({
        modules: ["FUNDING"],
        sorts: [{ field: "name", direction: "asc" }],
      })
    ).data.map(({ name }) => name),
    ["Beta", "Gamma"],
  );
  assert.deepEqual(
    (await read({ query: "BERLIN" })).data.map(({ name }) => name),
    ["Alpha"],
  );
});
