/** Whose records a funding list shows: a team's, or one organization's own. */
export type FundingListScope =
  | { kind: "team"; teamId: string }
  | { kind: "organization"; organizationId: string };

/** The list request's scope: `teamId` or `organizationId`. */
export const getFundingScopeParams = (
  scope: FundingListScope,
): Record<string, string> =>
  scope.kind === "team"
    ? { teamId: scope.teamId }
    : { organizationId: scope.organizationId };
