import prisma from "@/lib/prisma";
import type { PublishedFormReader } from "@/lib/public-forms/published-form";
import {
  FORM_CONTACT_FIELD_LABELS,
  FORM_CONTACT_FIELDS,
  FORM_ENGAGEMENT_EXTERNAL_SOURCE,
  type FormContactAnswer,
  type FormSubmissionMessage,
  formatFormAnswers,
} from "@/lib/public-forms/submission";
import { verifySubmission } from "@/lib/public-forms/verify";
import { resolveIntakeContact } from "@/services/contact-intake";
import { EngagementDirection, EngagementSource } from "@/types";

export const FORM_SUBMISSION_REJECTED =
  "Team not found or not accepting form submissions";

/** Permanent rejection: the consumer moves the message to the failed subject. */
export class FormSubmissionRejectedError extends Error {
  constructor(message = FORM_SUBMISSION_REJECTED) {
    super(message);
    this.name = "FormSubmissionRejectedError";
  }
}

/**
 * Persist one queued website form submission. Idempotent on submissionId:
 * a redelivered message returns the committed row without further writes.
 */
export const createFormSubmission = async (
  input: FormSubmissionMessage,
  options: {
    /** Reads the published form; without it nothing is checked. */
    readForm?: PublishedFormReader;
  } = {},
) => {
  const { submissionId, submission } = input;
  const receivedAt = new Date(input.receivedAt);

  // Checked against the published form before anything is written. An
  // unreachable website throws, so the message is retried later rather than
  // stored unchecked.
  const published = options.readForm
    ? await options.readForm(submission.form.id, submission.form.locale)
    : null;
  const checked = options.readForm
    ? verifySubmission(submission, published)
    : null;
  if (checked?.teamMismatch)
    throw new FormSubmissionRejectedError(
      "The published form belongs to another team",
    );
  const answers = checked?.answers ?? submission.answers;
  // What was submitted for the contact, kept with the submission whatever
  // happens to the contact (filled, proposed, or already the same), with the
  // labels the form showed.
  const contactAnswers: FormContactAnswer[] = FORM_CONTACT_FIELDS.flatMap(
    (field) => {
      const value = submission.contact[field]?.trim();
      if (!value) return [];
      const label =
        published?.questions.find((q) => q.contactField === field)?.label ??
        FORM_CONTACT_FIELD_LABELS[field];
      return [{ field, label, value }];
    },
  );

  return prisma.$transaction(async (tx) => {
    const existing = await tx.formSubmission.findUnique({
      where: { submissionId },
    });
    if (existing) return existing;

    const team = await tx.teams.findFirst({
      where: { id: submission.teamId, publicFormsEnabled: true },
      select: { id: true },
    });
    if (!team) throw new FormSubmissionRejectedError();

    const { contact: fields, form } = submission;
    const email = fields.email.trim().toLowerCase();
    if (!email) throw new FormSubmissionRejectedError("Email is required");
    const name = fields.name?.trim() ?? "";

    const { contact, proposedChanges, created } = await resolveIntakeContact(
      tx,
      {
        teamId: team.id,
        email,
        name,
        // Contact.name is required; fall back to the address like inbound email.
        createName: name || email,
        phone: fields.phone?.trim() || undefined,
        postalCode: fields.postalCode?.trim() || undefined,
        city: fields.city?.trim() || undefined,
        country: fields.country?.trim() || undefined,
      },
      {
        label: "Website form",
        metadata: {
          source: FORM_ENGAGEMENT_EXTERNAL_SOURCE,
          formId: form.id,
          formTitle: form.title,
          submissionId,
        },
      },
    );

    // A ticked consent question with a purpose becomes that consent. It
    // needs the e-mail confirmed first, so it asks for confirmation whatever
    // the form says (docs/DATA_RULES.md, "Consent").
    const consents = answers.filter(
      (answer) =>
        answer.type === "consent" && answer.purpose && answer.value === true,
    );
    const confirmationRequested =
      form.confirmation === "email" || consents.length > 0;

    const saved = await tx.formSubmission.create({
      data: {
        submissionId,
        teamId: team.id,
        contactId: contact.id,
        formId: form.id,
        formTitle: form.title,
        formRevision: form.revision,
        locale: form.locale,
        page: submission.page,
        answers: JSON.parse(JSON.stringify(answers)),
        submittedAt: new Date(submission.submittedAt),
        receivedAt,
        email,
        contactAnswers: JSON.parse(JSON.stringify(contactAnswers)),
        createdContact: created,
        confirmationRequested,
        ...(checked
          ? { verification: JSON.parse(JSON.stringify(checked.verification)) }
          : {}),
      },
    });

    // Pending until the address is confirmed; an unticked box changes nothing.
    if (consents.length) {
      await tx.contactConsent.createMany({
        data: consents.map((answer) => ({
          teamId: team.id,
          contactId: contact.id,
          purpose: answer.purpose as string,
          status: "PENDING",
          wording: answer.label,
          locale: form.locale,
          source: "FORM",
          submissionId,
          formId: form.id,
          recordedBy: "Website form",
          recordedAt: new Date(submission.submittedAt),
        })),
      });
    }

    await tx.contactEngagement.create({
      data: {
        contactId: contact.id,
        teamId: team.id,
        direction: EngagementDirection.INBOUND,
        source: EngagementSource.FORM,
        subject: `Form: ${form.title}`.slice(0, 500),
        message: [
          formatFormAnswers(answers) ||
            "Form submitted without additional answers.",
          proposedChanges
            ? `${proposedChanges} contact ${proposedChanges === 1 ? "change" : "changes"} pending review (see change history).`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        externalId: submissionId,
        externalSource: FORM_ENGAGEMENT_EXTERNAL_SOURCE,
        engagedAt: receivedAt,
      },
    });

    return saved;
  });
};
