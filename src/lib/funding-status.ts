import { FundingStatus } from "@/types";

/*
  How a funding request moves (docs/DATA_RULES.md):

    Submitted → Accepted → WaitingForSignature → FundsDisbursing → Completed
                                    (Approved → FundsDisbursing: older path)
    Rejected from any stage before money goes out.

  Some steps belong to the system, never to a person:
    Accepted → WaitingForSignature   creating the donation agreement
    WaitingForSignature → FundsDisbursing   the last signature
    FundsDisbursing → Completed   the last payout
*/

/** The status changes a team member may make by hand. */
const MANUAL_TRANSITIONS: Record<FundingStatus, readonly FundingStatus[]> = {
  [FundingStatus.Submitted]: [FundingStatus.Accepted, FundingStatus.Rejected],
  [FundingStatus.Accepted]: [FundingStatus.Submitted, FundingStatus.Rejected],
  [FundingStatus.WaitingForSignature]: [FundingStatus.Rejected],
  [FundingStatus.Approved]: [
    FundingStatus.FundsDisbursing,
    FundingStatus.Rejected,
  ],
  [FundingStatus.FundsDisbursing]: [FundingStatus.Rejected],
  [FundingStatus.Completed]: [],
  [FundingStatus.Rejected]: [],
};

export class FundingRuleError extends Error {
  readonly status = 409;
}

/**
 * Throws unless a person may move a request from `from` to `to`. Setting
 * the current status again is allowed (and changes nothing).
 */
export const assertManualStatusChange = ({
  from,
  to,
  isGlobalAdmin,
  hasPayouts,
}: {
  from: FundingStatus;
  to: FundingStatus;
  isGlobalAdmin: boolean;
  hasPayouts: boolean;
}) => {
  if (from === to) return;

  // Reopening a rejected request is an administrator's correction.
  if (from === FundingStatus.Rejected && to === FundingStatus.Submitted) {
    if (isGlobalAdmin) return;
    throw new FundingRuleError(
      "Only an administrator can reopen a rejected request.",
    );
  }

  if (to === FundingStatus.Rejected && hasPayouts) {
    throw new FundingRuleError("A request with payouts cannot be rejected.");
  }

  if (!(MANUAL_TRANSITIONS[from] ?? []).includes(to)) {
    throw new FundingRuleError(
      `A request cannot be moved from ${from} to ${to} by hand.`,
    );
  }
};
