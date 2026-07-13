export const escapeEmailHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("\n", "<br>");

export const normalizeReplySubject = (subject?: string | null) => {
  const trimmed = subject?.trim() || "Email reply";
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
};

export const getStoredReferences = (
  rawHeaders: unknown,
  messageId?: string | null,
) => {
  const references: string[] = [];
  if (
    rawHeaders &&
    typeof rawHeaders === "object" &&
    !Array.isArray(rawHeaders)
  ) {
    const stored = (rawHeaders as Record<string, unknown>).references;
    if (typeof stored === "string") {
      try {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) {
          references.push(
            ...parsed.filter(
              (item): item is string => typeof item === "string",
            ),
          );
        } else if (typeof parsed === "string") {
          references.push(parsed);
        }
      } catch {
        references.push(stored);
      }
    }
  }
  if (messageId) references.push(messageId);
  return Array.from(
    new Set(references.map((value) => value.trim()).filter(Boolean)),
  );
};
