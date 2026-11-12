// Log diagnostic codes, never error messages, URLs, credentials or payloads.
export function consumerErrorCodes(error: unknown): string[] {
  const codes: string[] = [];
  let current = error;
  for (let depth = 0; depth < 4; depth++) {
    if (!current || typeof current !== "object") break;
    if ("code" in current) {
      const code = current.code;
      if (
        (typeof code === "string" || typeof code === "number") &&
        /^[A-Z0-9_]{1,64}$/.test(String(code)) &&
        !codes.includes(String(code))
      )
        codes.push(String(code));
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return codes.length ? codes : ["UNKNOWN"];
}
