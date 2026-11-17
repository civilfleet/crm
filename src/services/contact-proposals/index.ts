import { ContactEmailKind, type Prisma } from "@prisma/client";
import { normalizeCountryCode } from "@/lib/countries";
import { normalizePostalCode } from "@/lib/geo";
import prisma from "@/lib/prisma";
import {
  assertIdentityEmailsAvailable,
  resolvePostalCentroid,
} from "@/services/contacts";
import { getContactVisibility } from "@/services/contacts/access";
import { ChangeAction, type Roles } from "@/types";

/*
  Reviewing changes that website forms and event registrations proposed for
  existing contacts (docs/DATA_RULES.md, "Proposed changes"). A proposal is
  pending while nothing resolves it; applying writes an UPDATED entry and
  declining a PROPOSAL_REJECTED entry, each pointing at the proposal, in the
  same transaction as the change. The database allows one resolution per
  proposal, so two people deciding at once cannot both win.
*/

type Viewer = { userId?: string; userName?: string; roles?: Roles[] };

/** The fields intake proposes; anything else is never proposed. */
const FIELDS = [
  "name",
  "phone",
  "postalCode",
  "city",
  "country",
  "email",
] as const;
type ProposalField = (typeof FIELDS)[number];
const isProposalField = (field: string | null): field is ProposalField =>
  (FIELDS as readonly string[]).includes(field ?? "");

export type ProposalDecision = "apply" | "apply-alias" | "decline";

export class ProposalError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProposalError";
  }
}

/** Values are stored as JSON text. */
const parseValue = (value: string | null): string | null => {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed === null ? null : String(parsed);
  } catch {
    return value;
  }
};

const comparable = (field: ProposalField, value: string | null) => {
  if (!value) return "";
  if (field === "postalCode") return value.replace(/\s+/g, "").toLowerCase();
  if (field === "phone") return value.replace(/\D/g, "");
  return value.trim().replace(/\s+/g, " ").toLowerCase();
};

export type PendingProposal = {
  id: string;
  contact: { id: string; name: string };
  field: ProposalField;
  /** What the contact has now. */
  currentValue: string | null;
  proposedValue: string | null;
  /** The proposed value is already what the contact has. */
  isCurrent: boolean;
  /** "Website form", "Event registration". */
  source: string | null;
  formTitle: string | null;
  submissionId: string | null;
  createdAt: Date;
};

type ContactValues = {
  id: string;
  name: string;
  phone: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  emails: Array<{ email: string; kind: ContactEmailKind }>;
};

const currentValueOf = (contact: ContactValues, field: ProposalField) =>
  field === "email"
    ? (contact.emails.find((entry) => entry.kind === ContactEmailKind.PRIMARY)
        ?.email ?? null)
    : contact[field];

const metadataOf = (metadata: Prisma.JsonValue | null) =>
  metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};

/**
 * Pending proposals the user may decide on: on contacts they can see, not in
 * the trash, and not from a submission still waiting for its e-mail
 * confirmation (anyone can type someone's address; such a proposal shows up
 * once the address is confirmed, and goes with the submission otherwise).
 */
export const getPendingProposals = async (
  teamId: string,
  viewer: Viewer,
  options: { contactId?: string; page?: number; pageSize?: number } = {},
) => {
  const visibility = await getContactVisibility({
    teamId,
    userId: viewer.userId,
    roles: viewer.roles,
  });
  const logs = await prisma.contactChangeLog.findMany({
    where: {
      action: ChangeAction.PROPOSED,
      resolutions: { none: {} },
      ...(options.contactId ? { contactId: options.contactId } : {}),
      contact: visibility.where,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      contact: {
        select: {
          id: true,
          name: true,
          phone: true,
          postalCode: true,
          city: true,
          country: true,
          emails: { select: { email: true, kind: true } },
        },
      },
    },
  });

  const submissionIds = logs
    .map((log) => metadataOf(log.metadata).submissionId)
    .filter((id): id is string => typeof id === "string");
  const unconfirmed = new Set(
    submissionIds.length
      ? (
          await prisma.formSubmission.findMany({
            where: {
              submissionId: { in: submissionIds },
              confirmationRequested: true,
              confirmedAt: null,
            },
            select: { submissionId: true },
          })
        ).map(({ submissionId }) => submissionId)
      : [],
  );

  const pending: PendingProposal[] = [];
  for (const log of logs) {
    if (!isProposalField(log.fieldName)) continue;
    const metadata = metadataOf(log.metadata);
    const submissionId =
      typeof metadata.submissionId === "string" ? metadata.submissionId : null;
    if (submissionId && unconfirmed.has(submissionId)) continue;
    const field = log.fieldName;
    const currentValue = currentValueOf(log.contact, field);
    const proposedValue = parseValue(log.newValue);
    pending.push({
      id: log.id,
      contact: { id: log.contact.id, name: log.contact.name },
      field,
      currentValue,
      proposedValue,
      isCurrent:
        field === "email"
          ? log.contact.emails.some(
              (entry) =>
                entry.email === proposedValue?.toLowerCase() &&
                entry.kind === ContactEmailKind.PRIMARY,
            )
          : comparable(field, currentValue) ===
            comparable(field, proposedValue),
      source: log.userName,
      formTitle:
        typeof metadata.formTitle === "string" ? metadata.formTitle : null,
      submissionId,
      createdAt: log.createdAt,
    });
  }

  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? pending.length;
  const start = (page - 1) * pageSize;
  return {
    data: pending.slice(start, start + pageSize),
    total: pending.length,
  };
};

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "P2002";

/**
 * Applies or declines one proposal. "apply-alias" (e-mail only) adds the
 * address next to the primary one; "apply" on an e-mail makes it the primary
 * address and keeps the old one as an alias.
 */
export const resolveProposal = async (
  input: { teamId: string; proposalId: string; decision: ProposalDecision },
  viewer: Viewer,
) => {
  const visibility = await getContactVisibility({
    teamId: input.teamId,
    userId: viewer.userId,
    roles: viewer.roles,
  });
  try {
    return await prisma.$transaction(async (tx) => {
      const proposal = await tx.contactChangeLog.findFirst({
        where: {
          id: input.proposalId,
          action: ChangeAction.PROPOSED,
          contact: visibility.where,
        },
        include: {
          resolutions: { select: { id: true } },
          contact: {
            select: {
              id: true,
              teamId: true,
              name: true,
              phone: true,
              postalCode: true,
              city: true,
              country: true,
              countryCode: true,
              emails: { select: { id: true, email: true, kind: true } },
            },
          },
        },
      });
      if (!proposal || !isProposalField(proposal.fieldName))
        throw new ProposalError(404, "Proposed change not found");
      if (proposal.resolutions.length)
        throw new ProposalError(409, "This change was already decided");

      const field = proposal.fieldName;
      const contact = proposal.contact;
      const proposedValue = parseValue(proposal.newValue);
      const currentValue = currentValueOf(contact, field);
      const by = { userId: viewer.userId, userName: viewer.userName };

      if (input.decision === "decline") {
        await tx.contactChangeLog.create({
          data: {
            contactId: contact.id,
            action: ChangeAction.PROPOSAL_REJECTED,
            fieldName: field,
            oldValue: JSON.stringify(currentValue),
            newValue: proposal.newValue,
            proposalId: proposal.id,
            ...by,
          },
        });
        return { decision: input.decision, field };
      }
      if (!proposedValue)
        throw new ProposalError(400, "The proposal has no value to apply");
      if (input.decision === "apply-alias" && field !== "email")
        throw new ProposalError(400, "Only an e-mail address can be added");

      if (field === "email") {
        const email = proposedValue.trim().toLowerCase();
        const own = contact.emails.find((entry) => entry.email === email);
        if (!own)
          await assertIdentityEmailsAvailable(
            tx,
            contact.teamId,
            [email],
            [contact.id],
          );
        if (input.decision === "apply-alias") {
          if (!own)
            await tx.contactEmail.create({
              data: {
                teamId: contact.teamId,
                contactId: contact.id,
                email,
                kind: ContactEmailKind.ALIAS,
              },
            });
        } else {
          // The old primary stays as an alias; the new one becomes primary.
          const primary = contact.emails.find(
            (entry) => entry.kind === ContactEmailKind.PRIMARY,
          );
          if (primary && primary.email !== email)
            await tx.contactEmail.update({
              where: { id: primary.id },
              data: { kind: ContactEmailKind.ALIAS },
            });
          if (own)
            await tx.contactEmail.update({
              where: { id: own.id },
              data: { kind: ContactEmailKind.PRIMARY },
            });
          else
            await tx.contactEmail.create({
              data: {
                teamId: contact.teamId,
                contactId: contact.id,
                email,
                kind: ContactEmailKind.PRIMARY,
              },
            });
        }
        await tx.contactChangeLog.create({
          data: {
            contactId: contact.id,
            action: ChangeAction.UPDATED,
            fieldName:
              input.decision === "apply-alias" ? "additionalEmails" : "email",
            oldValue: JSON.stringify(currentValue),
            newValue: JSON.stringify(email),
            proposalId: proposal.id,
            ...by,
          },
        });
        return { decision: input.decision, field };
      }

      const updates: Prisma.ContactUncheckedUpdateInput = {
        [field]:
          field === "postalCode"
            ? (normalizePostalCode(proposedValue) ?? proposedValue)
            : proposedValue.trim(),
      };
      // Coordinates follow the postal code and country, as in an edit.
      if (field === "postalCode" || field === "country") {
        const countryCode =
          field === "country"
            ? (normalizeCountryCode(proposedValue) ?? null)
            : (contact.countryCode ??
              normalizeCountryCode(contact.country ?? undefined) ??
              null);
        if (field === "country") updates.countryCode = countryCode;
        const centroid = await resolvePostalCentroid(
          tx,
          countryCode ?? undefined,
          normalizePostalCode(
            field === "postalCode"
              ? proposedValue
              : (contact.postalCode ?? undefined),
          ),
        );
        updates.latitude = centroid?.latitude ?? null;
        updates.longitude = centroid?.longitude ?? null;
      }
      await tx.contact.update({ where: { id: contact.id }, data: updates });
      await tx.contactChangeLog.create({
        data: {
          contactId: contact.id,
          action: ChangeAction.UPDATED,
          fieldName: field,
          oldValue: JSON.stringify(currentValue),
          newValue: JSON.stringify(updates[field]),
          proposalId: proposal.id,
          ...by,
        },
      });
      return { decision: input.decision, field };
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ProposalError(409, "This change was already decided");
    if (error instanceof Error && /already belongs to/.test(error.message))
      throw new ProposalError(409, error.message);
    throw error;
  }
};
