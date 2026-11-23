import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ContactEmailKind } from "@/types";

/*
  Permanently deleting a contact remembers its addresses, as a SHA-256 hash
  only, so imports from other systems (Klaviyo) do not bring the person back.
  With Klaviyo connected, the addresses are also queued for the next sync to
  mark the person deleted and unsubscribed there; the queue keeps an address
  only until then. docs/DATA_RULES.md, "Trash, restore and permanent delete"
  and "Klaviyo".
*/

export const hashContactEmail = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

/** Call in the transaction that permanently deletes the contacts. */
export const blockContactImports = async (
  tx: Prisma.TransactionClient,
  teamId: string,
  contactIds: string[],
) => {
  if (!contactIds.length) return;
  const emails = await tx.contactEmail.findMany({
    where: {
      teamId,
      contactId: { in: contactIds },
      kind: { in: [ContactEmailKind.PRIMARY, ContactEmailKind.ALIAS] },
    },
    select: { email: true },
  });
  if (!emails.length) return;
  await tx.contactImportBlock.createMany({
    data: emails.map(({ email }) => ({
      teamId,
      emailHash: hashContactEmail(email),
    })),
    skipDuplicates: true,
  });
  const klaviyo = await tx.integrationConnection.findFirst({
    where: { teamId, provider: "KLAVIYO", isEnabled: true },
    select: { id: true },
  });
  if (klaviyo) {
    await tx.klaviyoProfileDeletion.createMany({
      data: emails.map(({ email }) => ({ teamId, email })),
    });
  }
};

export const isContactImportBlocked = async (teamId: string, email: string) =>
  Boolean(
    await prisma.contactImportBlock.findUnique({
      where: {
        teamId_emailHash: { teamId, emailHash: hashContactEmail(email) },
      },
    }),
  );
