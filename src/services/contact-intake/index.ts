import type { Prisma } from "@prisma/client";
import {
  logContactCreation,
  logFieldUpdate,
  proposeFieldChange,
} from "@/services/contact-change-logs";
import { findContactByIdentityEmail } from "@/services/contacts";
import { ContactEmailKind } from "@/types";

export type IntakeContactInput = {
  teamId: string;
  /** Trimmed, lowercased, non-empty. */
  email: string;
  /** Trimmed; may be empty when the intake has no name. */
  name: string;
  /** Used only when a new contact must be created. Defaults to `name`. */
  createName?: string;
  phone?: string;
  postalCode?: string;
  city?: string;
  country?: string;
};

/** Who proposed changes, shown in the change history (e.g. "Website form"). */
export type IntakeSource = {
  label: string;
  metadata: Prisma.JsonObject;
};

type FillableField = "name" | "phone" | "postalCode" | "city" | "country";
const FILLABLE_FIELDS: FillableField[] = [
  "name",
  "phone",
  "postalCode",
  "city",
  "country",
];

const collapse = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Comparison form: values equal here are the same data written differently,
 * so they neither fill nor propose. Phones compare by digits only, so
 * "+49 30 1234" equals "+4930-1234" (but not "030 1234").
 */
export const comparableIntakeValue = (
  field: FillableField | "email",
  value: string,
) => {
  if (field === "phone") return value.replace(/\D/g, "");
  if (field === "postalCode") return value.replace(/\s+/g, "").toLowerCase();
  return collapse(value);
};

const isBlank = (value: string | null | undefined) =>
  !value || value.trim().length === 0;

/**
 * Shared public-intake contact matching (event registrations, website forms):
 * match by identity email within the team, then by phone; otherwise create.
 * Existing contacts only get empty fields filled. Differing non-empty values
 * are never overwritten; they are recorded as PROPOSED change-log entries for
 * later review, so the submitted data is not lost.
 */
export const resolveIntakeContact = async (
  tx: Prisma.TransactionClient,
  input: IntakeContactInput,
  source: IntakeSource,
) => {
  const { teamId, email: trimmedEmail } = input;

  const identityContact = await findContactByIdentityEmail(
    teamId,
    trimmedEmail,
    tx,
  );
  let contact = identityContact
    ? await tx.contact.findUnique({
        where: { id: identityContact.id },
        include: { emails: true },
      })
    : null;

  if (!contact && input.phone) {
    contact = await tx.contact.findFirst({
      where: {
        teamId,
        phone: input.phone,
        deletedAt: null,
      },
      include: { emails: true },
    });
  }

  let proposedChanges = 0;
  const created = !contact;

  if (contact) {
    const contactUpdates: Prisma.ContactUpdateInput = {};
    const updatedFields: Array<{
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }> = [];
    const proposals: Array<{
      field: string;
      oldValue: string;
      newValue: string;
    }> = [];

    for (const field of FILLABLE_FIELDS) {
      const value = input[field];
      const current = contact[field];
      if (isBlank(value)) continue;
      if (isBlank(current)) {
        contactUpdates[field] = value;
        updatedFields.push({ field, oldValue: current, newValue: value });
      } else if (
        comparableIntakeValue(field, current as string) !==
        comparableIntakeValue(field, value as string)
      )
        proposals.push({
          field,
          oldValue: current as string,
          newValue: value as string,
        });
    }

    // Matched by phone: the submitted email is not one of the contact's
    // identity emails. A contact without a primary email simply gets it
    // (filling, not overwriting); a different primary email is proposed.
    const existingPrimaryEmail =
      contact.emails.find((entry) => entry.kind === ContactEmailKind.PRIMARY)
        ?.email ?? null;
    let addPrimaryEmail = false;
    if (!existingPrimaryEmail) {
      addPrimaryEmail = true;
      updatedFields.push({
        field: "email",
        oldValue: existingPrimaryEmail,
        newValue: trimmedEmail,
      });
    } else if (
      !identityContact &&
      comparableIntakeValue("email", existingPrimaryEmail) !==
        comparableIntakeValue("email", trimmedEmail)
    ) {
      proposals.push({
        field: "email",
        oldValue: existingPrimaryEmail,
        newValue: trimmedEmail,
      });
    }

    if (Object.keys(contactUpdates).length > 0) {
      contact = await tx.contact.update({
        where: { id: contact.id },
        data: contactUpdates,
        include: { emails: true },
      });
    }

    if (addPrimaryEmail) {
      await tx.contactEmail.upsert({
        where: {
          contactId_email: {
            contactId: contact.id,
            email: trimmedEmail,
          },
        },
        create: {
          teamId,
          contactId: contact.id,
          email: trimmedEmail,
          kind: ContactEmailKind.PRIMARY,
        },
        update: {
          kind: ContactEmailKind.PRIMARY,
        },
      });
    }

    // Same order as before the helper existed: name, email, then the rest.
    const order = ["name", "email", "phone", "postalCode", "city", "country"];
    updatedFields.sort(
      (a, b) => order.indexOf(a.field) - order.indexOf(b.field),
    );
    for (const updatedField of updatedFields) {
      await logFieldUpdate(
        contact.id,
        updatedField.field,
        updatedField.oldValue,
        updatedField.newValue,
        undefined,
        undefined,
        tx,
      );
    }

    for (const proposal of proposals) {
      if (
        await proposeFieldChange(tx, {
          contactId: contact.id,
          fieldName: proposal.field,
          oldValue: proposal.oldValue,
          newValue: proposal.newValue,
          userName: source.label,
          metadata: source.metadata,
        })
      )
        proposedChanges++;
    }
  } else {
    contact = await tx.contact.create({
      data: {
        teamId,
        name: input.createName ?? input.name,
        phone: input.phone,
        ...(input.postalCode ? { postalCode: input.postalCode } : {}),
        ...(input.city ? { city: input.city } : {}),
        ...(input.country ? { country: input.country } : {}),
        emails: {
          create: [
            {
              teamId,
              email: trimmedEmail,
              kind: ContactEmailKind.PRIMARY,
            },
          ],
        },
      },
      include: { emails: true },
    });

    await logContactCreation(
      contact.id,
      undefined,
      undefined,
      tx,
      source.metadata,
    );
  }

  if (!contact) {
    throw new Error("Contact could not be resolved for registration.");
  }
  return { contact, proposedChanges, created };
};
