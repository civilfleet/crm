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

type TransactionsService = {
  createTransaction: (input: {
    amount: number;
    fundingRequestId: string;
  }) => Promise<{ id: string }>;
};

const service = loadService<TransactionsService>(
  "src/services/transactions/index.ts",
  {
    "@/services/transactions/balance": await import(
      "@/services/transactions/balance"
    ),
  },
);

beforeEach(resetDatabase);
after(disconnect);

const readRequest = (id: string) =>
  db.fundingRequest.findUniqueOrThrow({
    where: { id },
    select: { status: true, remainingAmount: true },
  });

const disbursedTotal = async (fundingRequestId: string) => {
  const { _sum } = await db.transaction.aggregate({
    where: { fundingRequestId },
    _sum: { amount: true },
  });
  return decimal(_sum.amount) ?? 0;
};

test("payouts keep the remaining amount in step and complete the request", async () => {
  const { fundingRequest } = await createFundingRequest({
    amountAgreed: 1000,
    status: FundingStatus.FundsDisbursing,
  });

  await service.createTransaction({
    amount: 400,
    fundingRequestId: fundingRequest.id,
  });
  let request = await readRequest(fundingRequest.id);
  assert.equal(decimal(request.remainingAmount), 600);
  assert.equal(request.status, FundingStatus.FundsDisbursing);

  await service.createTransaction({
    amount: 600,
    fundingRequestId: fundingRequest.id,
  });
  request = await readRequest(fundingRequest.id);
  assert.equal(decimal(request.remainingAmount), 0);
  assert.equal(request.status, FundingStatus.Completed);

  const transactions = await db.transaction.findMany({
    where: { fundingRequestId: fundingRequest.id },
    orderBy: { createdAt: "asc" },
  });
  assert.deepEqual(
    transactions.map((transaction) => [
      decimal(transaction.amount),
      decimal(transaction.totalAmount),
      decimal(transaction.remainingAmount),
    ]),
    [
      [400, 1000, 600],
      [600, 1000, 0],
    ],
  );
  assert.equal(await disbursedTotal(fundingRequest.id), 1000);
});

test("a payout above the remaining amount writes nothing", async () => {
  const { fundingRequest } = await createFundingRequest({ amountAgreed: 500 });
  await service.createTransaction({
    amount: 300,
    fundingRequestId: fundingRequest.id,
  });

  await assert.rejects(
    service.createTransaction({
      amount: 300,
      fundingRequestId: fundingRequest.id,
    }),
    /exceeds the remaining balance/,
  );

  assert.equal(await disbursedTotal(fundingRequest.id), 300);
  const request = await readRequest(fundingRequest.id);
  assert.equal(decimal(request.remainingAmount), 200);
});

test("zero, negative and unready payouts are refused", async () => {
  const { fundingRequest } = await createFundingRequest({ amountAgreed: 500 });
  for (const amount of [0, -10]) {
    await assert.rejects(
      service.createTransaction({
        amount,
        fundingRequestId: fundingRequest.id,
      }),
      /greater than zero/,
    );
  }

  const { fundingRequest: unagreed } = await createFundingRequest();
  await assert.rejects(
    service.createTransaction({ amount: 10, fundingRequestId: unagreed.id }),
    /not ready for disbursement/,
  );

  assert.equal(await db.transaction.count(), 0);
});

test("concurrent payouts can never overdraw the agreed amount", async () => {
  const { fundingRequest } = await createFundingRequest({ amountAgreed: 100 });

  // Eight payouts of 20 race for 100: at most five may go through.
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      service.createTransaction({
        amount: 20,
        fundingRequestId: fundingRequest.id,
      }),
    ),
  );

  const succeeded = results.filter(
    (result) => result.status === "fulfilled",
  ).length;
  const disbursed = await disbursedTotal(fundingRequest.id);
  assert.ok(succeeded >= 1 && succeeded <= 5, `${succeeded} payouts succeeded`);
  assert.equal(disbursed, succeeded * 20);
  assert.ok(disbursed <= 100, `disbursed ${disbursed} of 100`);
  const request = await readRequest(fundingRequest.id);
  assert.equal(decimal(request.remainingAmount), 100 - disbursed);
});
