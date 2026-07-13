const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const collectAddresses = (value: unknown): string[] => {
  if (typeof value === "string") {
    try {
      return collectAddresses(JSON.parse(value));
    } catch {
      return (
        value.match(EMAIL_PATTERN)?.map((email) => email.toLowerCase()) ?? []
      );
    }
  }
  if (Array.isArray(value)) return value.flatMap(collectAddresses);
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  return [
    ...(typeof record.address === "string"
      ? [record.address.toLowerCase()]
      : []),
    ...collectAddresses(record.value),
  ];
};

export const resolveInboundRecipientEmail = ({
  rawHeaders,
  inboxUsername,
  replyFromEmail,
}: {
  rawHeaders: unknown;
  inboxUsername?: string | null;
  replyFromEmail?: string | null;
}) => {
  const toHeader =
    rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)
      ? (rawHeaders as Record<string, unknown>).to
      : undefined;
  const recipients = Array.from(new Set(collectAddresses(toHeader)));
  const configuredAddresses = [inboxUsername, replyFromEmail]
    .map((email) => email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email));

  return (
    recipients.find((email) => configuredAddresses.includes(email)) ??
    recipients[0] ??
    configuredAddresses[0]
  );
};
