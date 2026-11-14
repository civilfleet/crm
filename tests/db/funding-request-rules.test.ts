import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { FundingStatus } from "@/types";
import {
  createFundingRequest,
  db,
  decimal,
  disconnect,
  loadService,
  resetDatabase,
} from "./helpers";

type Options = { isGlobalAdmin?: boolean };

type FundingRequestService = {
  updateFundingRequest: (
    id: string,
    data: Record<string, unknown>,
    teamId: string,
    options?: Options,
  ) => Promise<{ status: string; remainingAmount: unknown }>;
  updateFundingRequestStatus: (
    id: string,
    status: FundingStatus,
    donationId?: string | null,
    options?: Options,
  ) => Promise<{ status: string }>;
};

type TransactionsService = {
  createTransaction: (input: {
    amount: number;
    fundingRequestId: string;
  }) => Promise<unknown>;
};

const service = loadService<FundingRequestService>(
  "src/services/funding-request/index.ts",
  {
    "@/auth": { auth: async () => null },
    "@/lib/utils": { handlePrismaError: (error: unknown) => error },
  },
);
const payouts = loadService<TransactionsService>(
  "src/services/transactions/index.ts",
);

beforeEach(resetDatabase);
after(disconnect);

const readRequest = (id: string) =>
  db.fundingRequest.findUniqueOrThrow({
    where: { id },
    select: { status: true, amountAgreed: true, remainingAmount: true },
  });

const refused = /cannot|Only an administrator/;

test("both ways of changing a status follow the same rules", async () => {
  const { fundingRequest, team } = await createFundingRequest({
    amountAgreed: 100,
    status: FundingStatus.Submitted,
  });

  // The edit form.
  await assert.rejects(
    service.updateFundingRequest(
      fundingRequest.id,
      { status: FundingStatus.Completed },
      team.id,
    ),
    refused,
  );
  // The status buttons.
  await assert.rejects(
    service.updateFundingRequestStatus(
      fundingRequest.id,
      FundingStatus.FundsDisbursing,
    ),
    refused,
  );
  assert.equal(
    (await readRequest(fundingRequest.id)).status,
    FundingStatus.Submitted,
  );

  await service.updateFundingRequest(
    fundingRequest.id,
    { status: FundingStatus.Accepted },
    team.id,
  );
  await service.updateFundingRequestStatus(
    fundingRequest.id,
    FundingStatus.Rejected,
  );
  assert.equal(
    (await readRequest(fundingRequest.id)).status,
    FundingStatus.Rejected,
  );
});

test("only an administrator reopens a rejected request", async () => {
  const { fundingRequest } = await createFundingRequest({
    status: FundingStatus.Rejected,
  });

  await assert.rejects(
    service.updateFundingRequestStatus(
      fundingRequest.id,
      FundingStatus.Submitted,
    ),
    /Only an administrator/,
  );
  const reopened = await service.updateFundingRequestStatus(
    fundingRequest.id,
    FundingStatus.Submitted,
    null,
    { isGlobalAdmin: true },
  );
  assert.equal(reopened.status, FundingStatus.Submitted);
});

test("a request with payouts can no longer be rejected", async () => {
  const { fundingRequest } = await createFundingRequest({
    amountAgreed: 100,
    status: FundingStatus.FundsDisbursing,
  });
  await payouts.createTransaction({
    amount: 30,
    fundingRequestId: fundingRequest.id,
  });

  await assert.rejects(
    service.updateFundingRequestStatus(
      fundingRequest.id,
      FundingStatus.Rejected,
      null,
      { isGlobalAdmin: true },
    ),
    /with payouts cannot be rejected/,
  );
  assert.equal(
    (await readRequest(fundingRequest.id)).status,
    FundingStatus.FundsDisbursing,
  );
});

test("the remaining amount follows the agreed amount and the payouts", async () => {
  const { fundingRequest, team } = await createFundingRequest({
    amountAgreed: 100,
    status: FundingStatus.FundsDisbursing,
  });
  await payouts.createTransaction({
    amount: 30,
    fundingRequestId: fundingRequest.id,
  });

  // A remaining amount sent with an edit is ignored; it is derived.
  await service.updateFundingRequest(
    fundingRequest.id,
    { remainingAmount: 999, name: "Renamed" },
    team.id,
  );
  let stored = await readRequest(fundingRequest.id);
  assert.equal(decimal(stored.remainingAmount), 70);

  await service.updateFundingRequest(
    fundingRequest.id,
    { amountAgreed: 150 },
    team.id,
  );
  stored = await readRequest(fundingRequest.id);
  assert.equal(decimal(stored.amountAgreed), 150);
  assert.equal(decimal(stored.remainingAmount), 120);

  await assert.rejects(
    service.updateFundingRequest(
      fundingRequest.id,
      { amountAgreed: 20 },
      team.id,
    ),
    /cannot be below the 30 already paid out/,
  );
  stored = await readRequest(fundingRequest.id);
  assert.equal(decimal(stored.amountAgreed), 150);
  assert.equal(decimal(stored.remainingAmount), 120);
});

test("agreeing an amount before any payout sets the full amount remaining", async () => {
  const { fundingRequest, team } = await createFundingRequest({
    status: FundingStatus.Submitted,
  });

  await service.updateFundingRequest(
    fundingRequest.id,
    { amountAgreed: 500, status: FundingStatus.Accepted },
    team.id,
  );

  const stored = await readRequest(fundingRequest.id);
  assert.equal(stored.status, FundingStatus.Accepted);
  assert.equal(decimal(stored.amountAgreed), 500);
  assert.equal(decimal(stored.remainingAmount), 500);
});
