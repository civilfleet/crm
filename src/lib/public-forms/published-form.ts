import { z } from "zod";
import { FORM_ANSWER_TYPES } from "@/lib/public-forms/submission";

/*
  The form as the website published it: one static JSON file per form and
  language, written by the website build from Strapi
  (sea-watch-nuxt doc/cms-forms.md). The CRM reads the confirmation e-mail
  text from it, so editors write that text in Strapi next to the form, while
  nothing the browser sends can choose what we e-mail.

  The website address is CRM configuration (PUBLIC_WEBSITE_URL), never taken
  from a submission.
*/

const formIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const localePattern = /^[a-z]{2}(?:-[A-Za-z]{2})?$/;

// An optional text the file may carry; a wrong one is ignored (the sender
// falls back to the team's), never a reason to reject the whole file.
const optionalText = (max: number) =>
  z.string().max(max).optional().catch(undefined);

export const publishedFormConfirmation = z.object({
  required: z.boolean(),
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(2000),
  button: z.string().trim().min(1).max(60),
  // Who it comes from (src/lib/public-forms/sender.ts): a name, the part
  // before the @ of the team's verified domain, and where replies go.
  senderName: optionalText(100),
  senderLocalPart: optionalText(64),
  replyTo: optionalText(255),
});

export const publishedFormQuestion = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(500),
  type: z.enum(FORM_ANSWER_TYPES),
  required: z.boolean(),
  contactField: z.string().optional(),
  purpose: z.string().optional(),
  // Shown only after certain answers; may be missing from a submission.
  conditional: z.boolean().optional(),
  options: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
});

export const publishedForm = z.object({
  version: z.literal(1),
  formId: z.string().regex(formIdPattern),
  locale: z.string().regex(localePattern),
  // Same value submissions send; an older open page may send an older one.
  revision: z.string(),
  teamId: z.string(),
  title: z.string(),
  // Null when the editor wrote no confirmation text.
  confirmation: publishedFormConfirmation.nullable(),
  questions: z.array(publishedFormQuestion),
});
export type PublishedForm = z.infer<typeof publishedForm>;

/** Where a form's file lives, or null for ids that cannot be a path. */
export const publishedFormUrl = (
  websiteUrl: string,
  formId: string,
  locale: string,
) =>
  formIdPattern.test(formId) && localePattern.test(locale)
    ? `${websiteUrl.replace(/\/+$/, "")}/forms/${formId}/${locale}.json`
    : null;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export class PublishedFormUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishedFormUnavailableError";
  }
}

/**
 * Reads published forms, cached for a few minutes. A missing file (404) is
 * an answer, cached too: the form has no published version for that
 * language. Anything else (network, 5xx, a file that does not match) throws,
 * so the caller retries later instead of acting on a guess.
 */
export const createPublishedFormReader = ({
  websiteUrl,
  fetch: request = (url, init) => fetch(url, init),
  ttlMs = 5 * 60_000,
  now = () => Date.now(),
}: {
  websiteUrl: string;
  fetch?: Fetch;
  ttlMs?: number;
  now?: () => number;
}) => {
  const cache = new Map<
    string,
    { expires: number; form: PublishedForm | null }
  >();
  return async (
    formId: string,
    locale: string,
  ): Promise<PublishedForm | null> => {
    const url = publishedFormUrl(websiteUrl, formId, locale);
    if (!url) return null;
    const cached = cache.get(url);
    if (cached && cached.expires > now()) return cached.form;

    let response: Response;
    try {
      response = await request(url, {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new PublishedFormUnavailableError(`Unreachable: ${url}`);
    }
    let form: PublishedForm | null = null;
    if (response.status !== 404) {
      if (!response.ok)
        throw new PublishedFormUnavailableError(
          `${response.status} from ${url}`,
        );
      const parsed = publishedForm.safeParse(await response.json());
      if (!parsed.success || parsed.data.formId !== formId)
        throw new PublishedFormUnavailableError(`Unexpected file at ${url}`);
      form = parsed.data;
    }
    if (cache.size >= 500) cache.clear();
    cache.set(url, { expires: now() + ttlMs, form });
    return form;
  };
};
export type PublishedFormReader = ReturnType<typeof createPublishedFormReader>;
