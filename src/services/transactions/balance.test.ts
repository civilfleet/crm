import assert from "node:assert/strict";
import test from "node:test";
import { calculateTransactionBalance } from "@/services/transactions/balance";

test("derives the remaining balance from persisted totals", () => {
  const result = calculateTransactionBalance({
    amount: "25.50",
    alreadyDisbursed: "40.25",
    totalAmount: "100.00",
  });

  assert.equal(result.amount.toFixed(2), "25.50");
  assert.equal(result.remainingAmount.toFixed(2), "34.25");
});

test("rejects non-positive and overdrawn transactions", () => {
  assert.throws(
    () =>
      calculateTransactionBalance({
        amount: 0,
        alreadyDisbursed: 0,
        totalAmount: 100,
      }),
    /greater than zero/,
  );
  assert.throws(
    () =>
      calculateTransactionBalance({
        amount: 61,
        alreadyDisbursed: 40,
        totalAmount: 100,
      }),
    /exceeds the remaining balance/,
  );
});
