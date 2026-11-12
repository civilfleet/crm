import prisma from "@/lib/prisma";
import {
  REGISTRATION_CONSUMER,
  REGISTRATION_STREAM,
  type RegistrationMessage,
  registrationMessage,
} from "@/lib/public-events/registration";
import {
  FORM_SUBMISSION_CONSUMER,
  FORM_SUBMISSION_FAILURE_SUBJECT,
  FORM_SUBMISSION_STREAM,
  type FormSubmissionMessage,
  formSubmissionMessage,
} from "@/lib/public-forms/submission";
import type { IntakePipeline } from "@/lib/public-intake/consumer";
import { createEventRegistration } from "@/services/events";
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
  process: (data) => createFormSubmission(data),
  isRejection: (error) => error instanceof FormSubmissionRejectedError,
};

export const intakePipelines = [
  eventRegistrationPipeline,
  formSubmissionPipeline,
] as IntakePipeline<never>[];
