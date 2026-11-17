import { z } from "zod";

// Contract v1: website form submissions → public API bridge → JetStream → CRM.
export const FORM_SUBMISSION_PATH = "/v1/forms/submissions";
export const FORM_SUBMISSION_MAX_BYTES = 65536;
export const FORM_SUBMISSION_STREAM = "SEAWATCH_FORM_SUBMISSIONS";
export const FORM_SUBMISSION_SUBJECT = "seawatch.forms.submissions.v1";
export const FORM_SUBMISSION_CONSUMER = "crm-form-submissions-v1";
export const FORM_SUBMISSION_FAILURE_STREAM =
  "SEAWATCH_FORM_SUBMISSION_FAILURES";
export const FORM_SUBMISSION_FAILURE_SUBJECT =
  "seawatch.forms.submissions.failed.v1";
export const FORM_RATE_LIMIT_STREAM = "SEAWATCH_FORM_RATE_LIMIT";
export const FORM_RATE_LIMIT_SUBJECT_PREFIX = "seawatch.ratelimit.forms";
// The envelope adds ~150 bytes to a maximal body; leave generous headroom.
export const FORM_SUBMISSION_MAX_MSG_SIZE = 98304;
export const FORM_ENGAGEMENT_EXTERNAL_SOURCE = "website-form";

export const FORM_ANSWER_TYPES = [
  "text",
  "textarea",
  "email",
  "number",
  "date",
  "single",
  "multiple",
  "consent",
] as const;

/**
 * What a ticked consent question is for, beyond the form itself. A consent
 * answer with a purpose becomes a ContactConsent record; one without stays
 * an answer of this submission only. Add purposes here, in the website's
 * shared forms contract, and in docs/DATA_RULES.md.
 */
export const CONSENT_PURPOSES = ["marketing"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const MAX_FORM_ANSWERS = 100;
export const MAX_FORM_ANSWER_TEXT = 10000;
export const MAX_FORM_ANSWER_OPTIONS = 100;

// Empty optional contact fields are documented as omitted; tolerate "" by
// treating it as absent rather than rejecting the whole submission.
const optionalContactText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const formSubmissionContact = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(255)),
    name: z.string().trim().min(1).max(255).optional(),
    phone: optionalContactText(80),
    postalCode: optionalContactText(32),
    city: optionalContactText(255),
    country: optionalContactText(255),
  })
  .strict();

export const formSubmissionAnswer = z
  .object({
    id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/),
    label: z.string().trim().min(1).max(500),
    type: z.enum(FORM_ANSWER_TYPES),
    value: z.union([
      z.string().max(MAX_FORM_ANSWER_TEXT),
      z.number(),
      z.boolean(),
      z.array(z.string().max(80)).max(MAX_FORM_ANSWER_OPTIONS),
    ]),
    display: z
      .union([
        z.string().max(500),
        z.array(z.string().max(500)).max(MAX_FORM_ANSWER_OPTIONS),
      ])
      .optional(),
    purpose: z.enum(CONSENT_PURPOSES).optional(),
  })
  .strict()
  .refine((answer) => !answer.purpose || answer.type === "consent", {
    message: "Only consent answers have a purpose",
    path: ["purpose"],
  });

export const formSubmissionPayload = z
  .object({
    version: z.literal(1),
    teamId: z.uuid(),
    form: z
      .object({
        id: z.string().min(1).max(64),
        title: z.string().trim().min(1).max(255),
        revision: z.string().min(1).max(64),
        locale: z.string().min(2).max(10),
        // Asks the CRM to confirm the e-mail address before the submission
        // counts as confirmed. A ticked marketing consent asks for it anyway.
        confirmation: z.enum(["email"]).optional(),
      })
      .strict(),
    page: z.string().startsWith("/").max(2048).optional(),
    submittedAt: z.iso.datetime({ offset: true }),
    contact: formSubmissionContact,
    answers: z.array(formSubmissionAnswer).max(MAX_FORM_ANSWERS),
  })
  .strict();

export const formSubmissionMessage = z.object({
  version: z.literal(1),
  submissionId: z.uuid(),
  receivedAt: z.iso.datetime(),
  submission: formSubmissionPayload,
});

/** The contact fields a submission can carry, in display order. */
export const FORM_CONTACT_FIELDS = [
  "name",
  "email",
  "phone",
  "postalCode",
  "city",
  "country",
] as const;
export type FormContactField = (typeof FORM_CONTACT_FIELDS)[number];
export const FORM_CONTACT_FIELD_LABELS: Record<FormContactField, string> = {
  name: "Name",
  email: "E-mail",
  phone: "Phone",
  postalCode: "Postal code",
  city: "City",
  country: "Country",
};

/** One contact detail as submitted, with the form's own label for it. */
export type FormContactAnswer = {
  field: FormContactField;
  label: string;
  value: string;
};

export type FormSubmissionPayload = z.infer<typeof formSubmissionPayload>;
export type FormSubmissionAnswer = z.infer<typeof formSubmissionAnswer>;
export type FormSubmissionMessage = z.infer<typeof formSubmissionMessage>;

const formatScalar = (value: string | number | boolean) =>
  typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);

// Readable "label: display/value" lines for the contact engagement history.
export const formatFormAnswers = (answers: FormSubmissionAnswer[]) =>
  answers
    .map((answer) => {
      const shown = answer.display ?? answer.value;
      const text = Array.isArray(shown)
        ? shown.join(", ")
        : formatScalar(shown);
      return `${answer.label}: ${text}`;
    })
    .join("\n");
