import prisma from "@/lib/prisma";
import {
  FORM_ENGAGEMENT_EXTERNAL_SOURCE,
  type FormSubmissionMessage,
  formatFormAnswers,
} from "@/lib/public-forms/submission";
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
export const createFormSubmission = async (input: FormSubmissionMessage) => {
  const { submissionId, submission } = input;
  const receivedAt = new Date(input.receivedAt);

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

    const { contact, proposedChanges } = await resolveIntakeContact(
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

    const created = await tx.formSubmission.create({
      data: {
        submissionId,
        teamId: team.id,
        contactId: contact.id,
        formId: form.id,
        formTitle: form.title,
        formRevision: form.revision,
        locale: form.locale,
        page: submission.page,
        answers: JSON.parse(JSON.stringify(submission.answers)),
        submittedAt: new Date(submission.submittedAt),
        receivedAt,
      },
    });

    // A ticked consent question with a purpose is recorded as that consent;
    // an unticked one changes nothing (docs/DATA_RULES.md, "Consent").
    const consents = submission.answers.filter(
      (answer) =>
        answer.type === "consent" && answer.purpose && answer.value === true,
    );
    if (consents.length) {
      await tx.contactConsent.createMany({
        data: consents.map((answer) => ({
          teamId: team.id,
          contactId: contact.id,
          purpose: answer.purpose as string,
          status: "GRANTED",
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
          formatFormAnswers(submission.answers) ||
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

    return created;
  });
};
