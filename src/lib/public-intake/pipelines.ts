import prisma from "@/lib/prisma";
import {
  REGISTRATION_CONSUMER,
  REGISTRATION_STREAM,
  type RegistrationMessage,
  registrationMessage,
} from "@/lib/public-events/registration";
import {
  FORM_CONFIRMATION_CONSUMER,
  FORM_CONFIRMATION_FAILURE_SUBJECT,
  FORM_CONFIRMATION_STREAM,
  type FormConfirmationMessage,
  formConfirmationMessage,
} from "@/lib/public-forms/confirmation";
import { createPublishedFormReader } from "@/lib/public-forms/published-form";
import {
  FORM_SUBMISSION_CONSUMER,
  FORM_SUBMISSION_FAILURE_SUBJECT,
  FORM_SUBMISSION_STREAM,
  type FormSubmissionMessage,
  formSubmissionMessage,
} from "@/lib/public-forms/submission";
import type { IntakePipeline } from "@/lib/public-intake/consumer";
import { createEventRegistration } from "@/services/events";
import { confirmFormSubmission } from "@/services/form-confirmations";
import {
  createFormSubmission,
  FormSubmissionRejectedError,
} from "@/services/form-submissions";

export const EVENT_REGISTRATION_FAILURE_SUBJECT =
  "seawatch.events.registrations.failed.v1";

export const eventRegistrationPipeline: IntakePipeline<RegistrationMessage> = {
  name: "Event registrations",
  stream: REGISTRATION_STREAM,
  consumer: REGISTRATION_CONSUMER,
  failureSubject: EVENT_REGISTRATION_FAILURE_SUBJECT,
  parse: (input) => registrationMessage.safeParse(input),
  submissionId: (data) => data.submissionId,
  exists: async (submissionId) =>
    Boolean(
      await prisma.eventRegistration.findUnique({
        where: { submissionId },
        select: { id: true },
      }),
    ),
  process: (data) =>
    createEventRegistration({
      ...data.registration,
      submissionId: data.submissionId,
    }),
  isRejection: (error) =>
    error instanceof Error &&
    error.message === "Event not found or not accepting registrations",
};

// Submissions are checked against the form the website published
// (src/lib/public-forms/verify.ts); without the website address, they are not.
const readPublishedForm = process.env.PUBLIC_WEBSITE_URL
  ? createPublishedFormReader({ websiteUrl: process.env.PUBLIC_WEBSITE_URL })
  : undefined;

export const formSubmissionPipeline: IntakePipeline<FormSubmissionMessage> = {
  name: "Form submissions",
  stream: FORM_SUBMISSION_STREAM,
  consumer: FORM_SUBMISSION_CONSUMER,
  failureSubject: FORM_SUBMISSION_FAILURE_SUBJECT,
  parse: (input) => formSubmissionMessage.safeParse(input),
  submissionId: (data) => data.submissionId,
  exists: async (submissionId) =>
    Boolean(
      await prisma.formSubmission.findUnique({
        where: { submissionId },
        select: { id: true },
      }),
    ),
  process: (data) =>
    createFormSubmission(data, { readForm: readPublishedForm }),
  isRejection: (error) => error instanceof FormSubmissionRejectedError,
};

// A confirmation for a submission that is gone (removed unconfirmed after
// FORM_CONFIRMATION_DAYS) or already confirmed needs nothing more.
export const formConfirmationPipeline: IntakePipeline<FormConfirmationMessage> =
  {
    name: "Form confirmations",
    stream: FORM_CONFIRMATION_STREAM,
    consumer: FORM_CONFIRMATION_CONSUMER,
    failureSubject: FORM_CONFIRMATION_FAILURE_SUBJECT,
    parse: (input) => formConfirmationMessage.safeParse(input),
    submissionId: (data) => data.submissionId,
    exists: async (submissionId) => {
      const submission = await prisma.formSubmission.findUnique({
        where: { submissionId },
        select: { confirmedAt: true },
      });
      return !submission || submission.confirmedAt !== null;
    },
    process: (data) => confirmFormSubmission(data),
    isRejection: () => false,
  };

export const intakePipelines = [
  eventRegistrationPipeline,
  formSubmissionPipeline,
  formConfirmationPipeline,
] as IntakePipeline<never>[];
