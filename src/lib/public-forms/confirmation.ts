import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/*
  E-mail confirmation of website form submissions (double opt-in).

  The CRM e-mails a link to the website's confirmation page with a token in
  the URL fragment. The page posts the token to the public bridge, which
  checks its signature (the bridge and the CRM share FORM_CONFIRMATION_KEY)
  and queues the confirmation on NATS; the CRM consumer marks the submission
  confirmed. The CRM never takes the request itself.
*/

export const FORM_CONFIRMATION_PATH = "/v1/forms/confirmations";
export const FORM_CONFIRMATION_STREAM = "SEAWATCH_FORM_CONFIRMATIONS";
export const FORM_CONFIRMATION_SUBJECT = "seawatch.forms.confirmations.v1";
export const FORM_CONFIRMATION_CONSUMER = "crm-form-confirmations-v1";
export const FORM_CONFIRMATION_FAILURE_SUBJECT =
  "seawatch.forms.confirmations.failed.v1";
/** Unconfirmed submissions are removed after this long. */
export const FORM_CONFIRMATION_DAYS = 7;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sign = (submissionId: string, key: string) =>
  createHmac("sha256", key)
    .update(`form-confirmation:v1:${submissionId.toLowerCase()}`)
    .digest("base64url");

/** `<submissionId>.<signature>`: what the confirmation link carries. */
export const createConfirmationToken = (submissionId: string, key: string) => {
  if (!key) throw new Error("FORM_CONFIRMATION_KEY is not set");
  return `${submissionId}.${sign(submissionId, key)}`;
};

/** The submission a token confirms, or null when it is not ours. */
export const verifyConfirmationToken = (token: string, key: string) => {
  if (!key || token.length > 200) return null;
  const [submissionId, signature, extra] = token.split(".");
  if (extra !== undefined || !submissionId || !signature) return null;
  if (!uuid.test(submissionId)) return null;
  const expected = Buffer.from(sign(submissionId, key));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given)
    ? submissionId.toLowerCase()
    : null;
};

export const formConfirmationRequest = z
  .object({ token: z.string().min(1).max(200) })
  .strict();

export const formConfirmationMessage = z.object({
  version: z.literal(1),
  submissionId: z.uuid(),
  confirmedAt: z.iso.datetime(),
});
export type FormConfirmationMessage = z.infer<typeof formConfirmationMessage>;

/** The website page the e-mail links to; the token stays in the fragment. */
export const confirmationLink = (
  websiteUrl: string,
  locale: string,
  token: string,
) =>
  `${websiteUrl.replace(/\/+$/, "")}/${encodeURIComponent(locale)}/form-confirmation#${token}`;
