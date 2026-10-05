export type InboundAuthenticationResult = {
  status: "PASS" | "FAIL" | "UNKNOWN";
  authservId?: string;
  dmarc?: string;
  spf?: string;
  dkim?: string;
  reason: string;
};

type HeaderLine = { key: string; line: string };

const getResult = (value: string, mechanism: string) =>
  new RegExp(`(?:^|[;\\s])${mechanism}=([a-zA-Z_-]+)`, "i")
    .exec(value)?.[1]
    ?.toLowerCase();

export const parseInboundAuthentication = (
  headerLines: readonly HeaderLine[] | undefined,
  trustedAuthservIds: string[],
): InboundAuthenticationResult => {
  const trusted = new Set(
    trustedAuthservIds
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (trusted.size === 0) {
    return {
      status: "UNKNOWN",
      reason: "No trusted Authentication-Results service is configured.",
    };
  }

  const authenticationHeaders = (headerLines ?? []).filter(
    ({ key }) => key.toLowerCase() === "authentication-results",
  );
  for (const { line } of authenticationHeaders) {
    const value = line.replace(/^[^:]+:\s*/i, "");
    const authservId = value.split(";", 1)[0]?.trim().toLowerCase();
    if (!authservId || !trusted.has(authservId)) continue;

    const dmarc = getResult(value, "dmarc");
    const spf = getResult(value, "spf");
    const dkim = getResult(value, "dkim");
    if (dmarc === "pass") {
      return {
        status: "PASS",
        authservId,
        dmarc,
        spf,
        dkim,
        reason: "DMARC passed at a trusted authentication service.",
      };
    }
    return {
      status: dmarc === "fail" ? "FAIL" : "UNKNOWN",
      authservId,
      dmarc,
      spf,
      dkim,
      reason: dmarc
        ? `Trusted authentication service reported DMARC ${dmarc}.`
        : "Trusted authentication service did not report a DMARC result.",
    };
  }

  return {
    status: "UNKNOWN",
    reason:
      "No Authentication-Results header from a trusted service was found.",
  };
};
