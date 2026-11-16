import { z } from "zod";

/*
  Public form counts: how many people sent a form, for a counter on the
  website. The CRM sits behind the VPN, so it publishes each count to NATS
  (one subject per form, only the last message kept) over the connection its
  intake consumer already has; the public bridge reads the last message and
  answers GET /v1/forms/count. See docs/PUBLIC_FORMS_INTAKE.md.
*/

export const FORM_COUNT_PATH = "/v1/forms/count";
export const FORM_COUNT_STREAM = "SEAWATCH_FORM_COUNTS";
export const FORM_COUNT_SUBJECT_PREFIX = "seawatch.forms.counts.v1";
/** How often the CRM publishes counts, and how long the bridge caches one. */
export const FORM_COUNT_INTERVAL_MS = 30_000;
export const FORM_COUNT_CACHE_SECONDS = 60;

const subjectToken = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The subject a form's count lives on, or null when the team or form id
 * cannot be a NATS subject token (a counter is then not offered).
 */
export const formCountSubject = (teamId: string, formId: string) =>
  subjectToken.test(teamId) && subjectToken.test(formId)
    ? `${FORM_COUNT_SUBJECT_PREFIX}.${teamId}.${formId}`
    : null;

/** What the CRM publishes; `public: false` takes a counter down. */
export const formCountValue = z.discriminatedUnion("public", [
  z.object({
    public: z.literal(true),
    count: z.number().int().nonnegative(),
    goal: z.number().int().positive().nullable(),
  }),
  z.object({ public: z.literal(false) }),
]);
export type FormCountValue = z.infer<typeof formCountValue>;

export type FormCountRow = {
  teamId: string;
  formId: string;
  publicCount: boolean;
  goal: number | null;
  /** Unique people who sent the form. */
  count: number;
};

type Publisher = { publish: (subject: string, data: string) => unknown };

/**
 * Publishes each form's count, or that it is not public, when it changed
 * since the last round (`published` remembers per subject).
 */
export const publishFormCounts = async (
  js: Publisher,
  rows: FormCountRow[],
  published: Map<string, string>,
) => {
  let sent = 0;
  for (const row of rows) {
    const subject = formCountSubject(row.teamId, row.formId);
    if (!subject) continue;
    const value: FormCountValue = row.publicCount
      ? { public: true, count: row.count, goal: row.goal }
      : { public: false };
    const data = JSON.stringify(value);
    if (published.get(subject) === data) continue;
    await js.publish(subject, data);
    published.set(subject, data);
    sent++;
  }
  return sent;
};
