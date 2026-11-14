import assert from "node:assert/strict";
import test from "node:test";
import {
  assertManualStatusChange,
  FundingRuleError,
} from "@/lib/funding-status";
import { FundingStatus } from "@/types";

const { Submitted, Accepted, WaitingForSignature, Approved, FundsDisbursing } =
  FundingStatus;
const { Completed, Rejected } = FundingStatus;

const allowed = (
  from: FundingStatus,
  to: FundingStatus,
  { isGlobalAdmin = false, hasPayouts = false } = {},
) => {
  try {
    assertManualStatusChange({ from, to, isGlobalAdmin, hasPayouts });
    return true;
  } catch (error) {
    assert.ok(error instanceof FundingRuleError);
    return false;
  }
};

test("people move requests only along the funding path", () => {
  const permitted = Object.values(FundingStatus).flatMap((from) =>
    Object.values(FundingStatus)
      .filter((to) => to !== from && allowed(from, to))
      .map((to) => `${from} → ${to}`),
  );

  assert.deepEqual(permitted.sort(), [
    `${Accepted} → ${Rejected}`,
    `${Accepted} → ${Submitted}`,
    `${Approved} → ${FundsDisbursing}`,
    `${Approved} → ${Rejected}`,
    `${FundsDisbursing} → ${Rejected}`,
    `${Submitted} → ${Accepted}`,
    `${Submitted} → ${Rejected}`,
    `${WaitingForSignature} → ${Rejected}`,
  ]);
});

test("steps that belong to the system cannot be made by hand", () => {
  assert.equal(allowed(Accepted, WaitingForSignature), false);
  assert.equal(allowed(WaitingForSignature, FundsDisbursing), false);
  assert.equal(allowed(FundsDisbursing, Completed), false);
});

test("completed is final; only an administrator reopens a rejection", () => {
  for (const to of Object.values(FundingStatus)) {
    if (to !== Completed) {
      assert.equal(allowed(Completed, to, { isGlobalAdmin: true }), false);
    }
  }
  assert.equal(allowed(Rejected, Submitted), false);
  assert.equal(allowed(Rejected, Submitted, { isGlobalAdmin: true }), true);
  assert.equal(allowed(Rejected, Accepted, { isGlobalAdmin: true }), false);
});

test("a request with payouts cannot be rejected", () => {
  assert.equal(allowed(FundsDisbursing, Rejected, { hasPayouts: true }), false);
  assert.equal(allowed(FundsDisbursing, Rejected), true);
});

test("setting the current status again changes nothing and is allowed", () => {
  for (const status of Object.values(FundingStatus)) {
    assert.equal(allowed(status, status), true);
  }
});
