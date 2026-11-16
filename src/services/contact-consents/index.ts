import prisma from "@/lib/prisma";

export type ContactConsentEntry = {
  id: string;
  purpose: string;
  status: "GRANTED" | "WITHDRAWN";
  wording: string | null;
  locale: string | null;
  source: "FORM" | "MANUAL" | "EXTERNAL";
  formId: string | null;
  recordedBy: string | null;
  recordedAt: Date;
};

export type ContactConsentState = {
  purpose: string;
  /** The latest entry: what holds now. */
  current: ContactConsentEntry;
  /** Every entry for this purpose, newest first. */
  history: ContactConsentEntry[];
};

/**
 * A contact's consents by purpose, the latest entry first. Callers check that
 * the user may see the contact before asking (docs/DATA_RULES.md, "Consent").
 */
export const getContactConsents = async (
  contactId: string,
  teamId: string,
): Promise<ContactConsentState[]> => {
  const entries = (await prisma.contactConsent.findMany({
    where: { contactId, teamId },
    orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      purpose: true,
      status: true,
      wording: true,
      locale: true,
      source: true,
      formId: true,
      recordedBy: true,
      recordedAt: true,
    },
  })) as ContactConsentEntry[];

  const byPurpose = new Map<string, ContactConsentEntry[]>();
  for (const entry of entries) {
    const history = byPurpose.get(entry.purpose) ?? [];
    history.push(entry);
    byPurpose.set(entry.purpose, history);
  }
  return [...byPurpose].map(([purpose, history]) => ({
    purpose,
    current: history[0],
    history,
  }));
};
