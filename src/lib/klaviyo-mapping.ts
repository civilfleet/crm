/*
  Pure translation between Klaviyo's data and the CRM's, kept apart from the
  sync (src/services/integrations/klaviyo.ts) so it can be tested alone.
  Rules: docs/DATA_RULES.md, "Klaviyo".
*/
import type {
  KlaviyoEmailMetric,
  KlaviyoEvent,
  KlaviyoProfile,
} from "@/lib/klaviyo";

export const KLAVIYO_SOURCE_LABEL = "Klaviyo";

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const normalizeKlaviyoEmail = (email?: string | null) =>
  email?.trim().toLowerCase() ?? "";

/**
 * What a profile can tell about a contact. No name stays empty: an existing
 * contact keeps its name, a new one is named after its address.
 */
export const profileToIntake = (profile: KlaviyoProfile) => {
  const email = normalizeKlaviyoEmail(profile.attributes.email);
  if (!email) return null;
  const name = [profile.attributes.first_name, profile.attributes.last_name]
    .map(text)
    .filter(Boolean)
    .join(" ");
  return {
    email,
    name,
    createName: name || email,
    phone: text(profile.attributes.phone_number),
    city: text(profile.attributes.location?.city),
  };
};

const parseDate = (value?: string | null) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/**
 * When the person stopped wanting marketing e-mail, according to Klaviyo:
 * unsubscribed, or suppressed for unsubscribing or a spam complaint. Null
 * while they may still receive it. Bounces are not a withdrawal.
 */
export const profileMarketingWithdrawnAt = (
  profile: KlaviyoProfile,
): Date | null => {
  const marketing = profile.attributes.subscriptions?.email?.marketing;
  if (!marketing) return null;
  const times: Date[] = [];
  if (marketing.consent === "UNSUBSCRIBED") {
    const at =
      parseDate(marketing.last_updated) ??
      parseDate(marketing.consent_timestamp);
    if (at) times.push(at);
  }
  for (const entry of marketing.suppression ?? []) {
    if (entry.reason === "UNSUBSCRIBE" || entry.reason === "SPAM_COMPLAINT") {
      const at = parseDate(entry.timestamp);
      if (at) times.push(at);
    }
  }
  if (times.length === 0) return null;
  return new Date(Math.max(...times.map((time) => time.getTime())));
};

/**
 * When the person left only the team's list (Klaviyo's list-specific
 * unsubscribe), or null. Not a withdrawal by itself: it becomes a proposed
 * change for someone to decide (docs/DATA_RULES.md, "Klaviyo").
 */
export const profileListLeftAt = (
  profile: KlaviyoProfile,
  listId: string,
): Date | null => {
  const times = (
    profile.attributes.subscriptions?.email?.marketing?.list_suppressions ?? []
  )
    .filter((entry) => entry.list_id === listId)
    .map((entry) => parseDate(entry.timestamp))
    .filter((date): date is Date => Boolean(date));
  if (times.length === 0) return null;
  return new Date(Math.max(...times.map((time) => time.getTime())));
};

/** Metrics whose events mean the person withdrew marketing consent. */
export const WITHDRAWING_METRICS: ReadonlySet<KlaviyoEmailMetric> = new Set([
  "Unsubscribed from Email Marketing",
  "Marked Email as Spam",
]);

export const klaviyoEventTime = (event: KlaviyoEvent): Date | null => {
  const fromIso = parseDate(event.attributes.datetime);
  if (fromIso) return fromIso;
  const seconds = Number(event.attributes.timestamp);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : null;
};

export type KlaviyoEngagementDraft = {
  /** Unique per team; repeated opens/clicks of one e-mail share one. */
  externalId: string;
  direction: "INBOUND" | "OUTBOUND";
  subject: string;
  message: string;
  engagedAt: Date;
  /** Opens and clicks: later events of the same e-mail update nothing. */
  firstOnly: boolean;
};

/** The person's page in Klaviyo, which lists every e-mail sent to them. */
export const klaviyoProfileUrl = (profileId: string) =>
  `https://www.klaviyo.com/profile/${encodeURIComponent(profileId)}`;

/** One line of the details block: no line breaks inside a value. */
const line = (label: string, value: string | undefined) =>
  value ? `${label}: ${value.replace(/\s+/g, " ")}` : null;

/**
 * The timeline entry for one e-mail event. The newsletter's text is not
 * copied: one copy per recipient would fill the database; the subject names
 * it and the link opens the person in Klaviyo.
 *
 * The message is a sentence, a blank line, then "Label: value" lines, the
 * layout the contact page reads (Recipient → "To", Metric → the event badge,
 * Klaviyo → "Open in Klaviyo"; src/components/contact-engagement-history.tsx).
 */
export const eventToEngagement = (
  metric: KlaviyoEmailMetric,
  event: KlaviyoEvent,
  profileId: string,
  email: string,
): KlaviyoEngagementDraft | null => {
  const engagedAt = klaviyoEventTime(event);
  if (!engagedAt) return null;
  const properties = event.attributes.event_properties ?? {};
  const campaign = text(properties["Campaign Name"]);
  const subject =
    text(properties.Subject) ?? campaign ?? "E-mail sent through Klaviyo";
  const messageId = text(properties.$message);
  const quoted = `“${subject}”`;
  const url = metric === "Clicked Email" ? text(properties.URL) : undefined;
  const bounceType =
    metric === "Bounced Email" ? text(properties["Bounce Type"]) : undefined;
  const message = (sentence: string) =>
    [
      sentence,
      "",
      line("Recipient", email),
      line("Metric", metric),
      campaign !== subject ? line("Campaign", campaign) : null,
      line("Link", url),
      line("Bounce type", bounceType),
      line("Klaviyo", klaviyoProfileUrl(profileId)),
    ]
      .filter((entry) => entry !== null)
      .join("\n");
  // Per e-mail and person, so a second open of the same e-mail is the same
  // entry. Without a message id each event stands alone.
  const perMessage = (kind: string) =>
    messageId ? `${kind}:${messageId}:${profileId}` : event.id;
  const draft = (
    fields: Pick<KlaviyoEngagementDraft, "direction" | "firstOnly"> & {
      externalId?: string;
      subject?: string;
      sentence: string;
    },
  ): KlaviyoEngagementDraft => ({
    externalId: fields.externalId ?? event.id,
    direction: fields.direction,
    subject: fields.subject ?? subject,
    message: message(fields.sentence),
    engagedAt,
    firstOnly: fields.firstOnly,
  });

  switch (metric) {
    case "Received Email":
      return draft({
        direction: "OUTBOUND",
        firstOnly: false,
        sentence: `Received ${quoted} (sent through Klaviyo).`,
      });
    case "Opened Email":
      return draft({
        externalId: perMessage("opened"),
        direction: "INBOUND",
        firstOnly: true,
        sentence: `Opened ${quoted}.`,
      });
    case "Clicked Email":
      return draft({
        externalId: perMessage("clicked"),
        direction: "INBOUND",
        firstOnly: true,
        sentence: `Clicked a link in ${quoted}.`,
      });
    case "Bounced Email":
      return draft({
        direction: "OUTBOUND",
        firstOnly: false,
        sentence: `${quoted} bounced.`,
      });
    case "Marked Email as Spam":
      return draft({
        direction: "INBOUND",
        firstOnly: false,
        sentence: `Marked ${quoted} as spam.`,
      });
    case "Unsubscribed from Email Marketing":
      return draft({
        direction: "INBOUND",
        firstOnly: false,
        subject: "Unsubscribed from e-mail marketing",
        sentence: "Unsubscribed from e-mail marketing in Klaviyo.",
      });
    default:
      return null;
  }
};

export type ConsentPushCandidate = {
  id: string;
  contactId: string;
  status: "GRANTED" | "WITHDRAWN";
  source: "FORM" | "MANUAL" | "EXTERNAL";
  recordedBy: string | null;
  recordedAt: Date;
};

export type ConsentPushAction =
  | { kind: "subscribe"; email: string; consentedAt: Date }
  | { kind: "unsubscribe"; email: string }
  | { kind: "skip"; reason: string }
  /** Not now, decide again on the next sync (contact in the trash, no list). */
  | { kind: "wait"; reason: string };

/**
 * What to tell Klaviyo about one marketing consent row. Only the row that
 * holds now for its contact is sent; one that came from Klaviyo is not sent
 * back.
 */
export const planConsentPush = (
  candidate: ConsentPushCandidate,
  context: {
    latestConsentId: string | undefined;
    email: string | null;
    contactInTrash: boolean;
    listId: string | null;
  },
): ConsentPushAction => {
  if (candidate.id !== context.latestConsentId) {
    return { kind: "skip", reason: "superseded by a later consent" };
  }
  if (
    candidate.source === "EXTERNAL" &&
    candidate.recordedBy === KLAVIYO_SOURCE_LABEL
  ) {
    return { kind: "skip", reason: "came from Klaviyo" };
  }
  if (!context.email) {
    return { kind: "skip", reason: "contact has no primary e-mail address" };
  }
  if (candidate.status === "WITHDRAWN") {
    return { kind: "unsubscribe", email: context.email };
  }
  if (context.contactInTrash) {
    return { kind: "wait", reason: "contact is in the trash" };
  }
  if (!context.listId) {
    return { kind: "wait", reason: "no Klaviyo list configured" };
  }
  return {
    kind: "subscribe",
    email: context.email,
    consentedAt: candidate.recordedAt,
  };
};
