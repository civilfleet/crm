import { createEmailProviderAbortSignal } from "@/lib/email-timeouts";

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
// Supported until 2028-07 (each revision lives two years). Before moving past
// 2026-10-15 check the changelog: that revision reshaped the campaign
// endpoints (unused here).
export const KLAVIYO_API_REVISION = "2026-07-15";

const MAX_RATE_LIMIT_RETRIES = 5;
const DEFAULT_RETRY_AFTER_SECONDS = 5;
const MAX_RETRY_AFTER_SECONDS = 60;

/** Klaviyo's built-in e-mail metrics the CRM imports, by name. */
export const KLAVIYO_EMAIL_METRICS = [
  "Received Email",
  "Opened Email",
  "Clicked Email",
  "Bounced Email",
  "Marked Email as Spam",
  "Unsubscribed from Email Marketing",
] as const;
export type KlaviyoEmailMetric = (typeof KLAVIYO_EMAIL_METRICS)[number];

export type KlaviyoEmailMarketing = {
  can_receive_email_marketing?: boolean;
  consent?: string;
  consent_timestamp?: string | null;
  last_updated?: string | null;
  suppression?: Array<{ reason?: string; timestamp?: string }>;
  /** Unsubscribed from one list only (list-specific unsubscribes). */
  list_suppressions?: Array<{
    list_id?: string;
    reason?: string;
    timestamp?: string;
  }>;
};

export type KlaviyoProfile = {
  id: string;
  type?: string;
  attributes: {
    email?: string | null;
    phone_number?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    location?: {
      city?: string | null;
      region?: string | null;
      country?: string | null;
      zip?: string | null;
    } | null;
    subscriptions?: {
      email?: { marketing?: KlaviyoEmailMarketing | null } | null;
    } | null;
  };
};

export type KlaviyoEvent = {
  id: string;
  type?: string;
  attributes: {
    datetime?: string;
    timestamp?: number | string;
    event_properties?: Record<string, unknown> | null;
  };
  relationships?: {
    profile?: { data?: { id?: string; type?: string } | null };
    metric?: { data?: { id?: string; type?: string } | null };
  };
};

export type KlaviyoMetric = {
  id: string;
  type?: string;
  attributes?: {
    name?: string;
    integration?: { name?: string; category?: string } | null;
  };
};

type KlaviyoIncludedProfile = {
  id: string;
  type?: string;
  attributes?: { email?: string | null };
};

type KlaviyoResponse<TData, TIncluded = never> = {
  data: TData;
  included?: TIncluded[];
  links?: { next?: string | null };
};

type RequestSearchParams = Record<string, string | undefined>;

export class KlaviyoRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "KlaviyoRequestError";
  }
}

const buildUrl = (path: string, searchParams: RequestSearchParams = {}) => {
  const url = new URL(`${KLAVIYO_API_BASE}${path}`);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) url.searchParams.set(key, value);
  }
  return url;
};

const parseNextCursor = (nextLink?: string | null) => {
  if (!nextLink) return undefined;
  try {
    return new URL(nextLink).searchParams.get("page[cursor]") ?? undefined;
  } catch {
    return undefined;
  }
};

/** ISO 8601 to the second, as Klaviyo's filters take it. */
const klaviyoDate = (date: Date) =>
  date.toISOString().replace(/\.\d{3}Z$/, "Z");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Seconds to wait after a 429, from Retry-After, capped. */
export const parseRetryAfter = (value: string | null) => {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds, MAX_RETRY_AFTER_SECONDS);
  }
  return DEFAULT_RETRY_AFTER_SECONDS;
};

const readErrorMessage = async (response: Response) => {
  try {
    const body = (await response.json()) as {
      errors?: Array<{ detail?: string; title?: string }>;
      message?: string;
    };
    return (
      body?.errors?.[0]?.detail ??
      body?.errors?.[0]?.title ??
      body?.message ??
      response.statusText
    );
  } catch {
    return response.statusText;
  }
};

/**
 * One Klaviyo API call. Waits and retries on 429 (rate limit) as Klaviyo
 * asks, up to five times; any other failure throws a KlaviyoRequestError.
 * Returns null for an empty (202/204) response.
 */
export const requestKlaviyo = async <TData, TIncluded = never>(
  apiKey: string,
  path: string,
  options: {
    searchParams?: RequestSearchParams;
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
  } = {},
): Promise<KlaviyoResponse<TData, TIncluded> | null> => {
  const url = buildUrl(path, options.searchParams).toString();
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        Accept: "application/vnd.api+json",
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/vnd.api+json" }),
        revision: KLAVIYO_API_REVISION,
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
      signal: createEmailProviderAbortSignal(),
    });

    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      await sleep(parseRetryAfter(response.headers.get("Retry-After")) * 1000);
      continue;
    }
    if (!response.ok) {
      throw new KlaviyoRequestError(
        response.status,
        `Klaviyo request failed (${response.status}): ${await readErrorMessage(response)}`,
      );
    }
    if (response.status === 202 || response.status === 204) return null;
    const text = await response.text();
    return text
      ? (JSON.parse(text) as KlaviyoResponse<TData, TIncluded>)
      : null;
  }
};

/**
 * One page of profiles, with their e-mail subscription. `updatedAfter` limits
 * it to profiles changed since then (an incremental sync).
 */
export const fetchKlaviyoProfiles = async (
  apiKey: string,
  { cursor, updatedAfter }: { cursor?: string; updatedAfter?: Date } = {},
) => {
  const response = await requestKlaviyo<KlaviyoProfile[]>(apiKey, "/profiles", {
    searchParams: {
      "page[size]": "100",
      "page[cursor]": cursor,
      "additional-fields[profile]": "subscriptions",
      filter: updatedAfter
        ? `greater-than(updated,${klaviyoDate(updatedAfter)})`
        : undefined,
      sort: "updated",
    },
  });
  return {
    profiles: response?.data ?? [],
    nextCursor: parseNextCursor(response?.links?.next),
  };
};

/** The account's metrics (every page). */
export const fetchKlaviyoMetrics = async (apiKey: string) => {
  const metrics: KlaviyoMetric[] = [];
  let cursor: string | undefined;
  do {
    const response = await requestKlaviyo<KlaviyoMetric[]>(apiKey, "/metrics", {
      searchParams: {
        "fields[metric]": "name,integration",
        "page[cursor]": cursor,
      },
    });
    metrics.push(...(response?.data ?? []));
    cursor = parseNextCursor(response?.links?.next);
  } while (cursor);
  return metrics;
};

/**
 * One page of a metric's events after `since`, oldest first, with each
 * event's profile e-mail address (`profileEmails`, by profile id).
 */
export const fetchKlaviyoMetricEvents = async (
  apiKey: string,
  {
    metricId,
    since,
    cursor,
  }: { metricId: string; since: Date; cursor?: string },
) => {
  const response = await requestKlaviyo<KlaviyoEvent[], KlaviyoIncludedProfile>(
    apiKey,
    "/events",
    {
      searchParams: {
        "page[size]": "200",
        "page[cursor]": cursor,
        filter: `and(equals(metric_id,"${metricId}"),greater-than(datetime,${klaviyoDate(since)}))`,
        sort: "datetime",
        "fields[event]": "datetime,timestamp,event_properties",
        include: "profile",
        "fields[profile]": "email",
      },
    },
  );
  const profileEmails = new Map<string, string>();
  for (const item of response?.included ?? []) {
    if (item.type === "profile" && item.attributes?.email) {
      profileEmails.set(item.id, item.attributes.email);
    }
  }
  return {
    events: response?.data ?? [],
    profileEmails,
    nextCursor: parseNextCursor(response?.links?.next),
  };
};

/** Klaviyo takes at most this many profiles per subscribe call. */
export const KLAVIYO_SUBSCRIBE_BATCH = 1000;
/** Klaviyo takes at most this many profiles per unsubscribe call. */
export const KLAVIYO_UNSUBSCRIBE_BATCH = 100;

/**
 * Subscribes addresses to e-mail marketing on a list, with the time each
 * person consented. A historical import: the CRM already confirmed the
 * address, so Klaviyo sends no second opt-in e-mail (and starts no "added to
 * list" flow).
 */
export const subscribeKlaviyoProfiles = async (
  apiKey: string,
  listId: string,
  profiles: Array<{ email: string; consentedAt: Date }>,
) => {
  await requestKlaviyo(apiKey, "/profile-subscription-bulk-create-jobs", {
    method: "POST",
    body: {
      data: {
        type: "profile-subscription-bulk-create-job",
        attributes: {
          custom_source: "CRM",
          historical_import: true,
          profiles: {
            data: profiles.map(({ email, consentedAt }) => ({
              type: "profile",
              attributes: {
                email,
                subscriptions: {
                  email: {
                    marketing: {
                      consent: "SUBSCRIBED",
                      consented_at: consentedAt.toISOString(),
                    },
                  },
                },
              },
            })),
          },
        },
        relationships: { list: { data: { type: "list", id: listId } } },
      },
    },
  });
};

/**
 * Unsubscribes addresses from e-mail marketing altogether (no list given):
 * a withdrawn marketing consent covers every list.
 */
export const unsubscribeKlaviyoProfiles = async (
  apiKey: string,
  emails: string[],
) => {
  await requestKlaviyo(apiKey, "/profile-subscription-bulk-delete-jobs", {
    method: "POST",
    body: {
      data: {
        type: "profile-subscription-bulk-delete-job",
        attributes: {
          profiles: {
            data: emails.map((email) => ({
              type: "profile",
              attributes: {
                email,
                subscriptions: {
                  email: { marketing: { consent: "UNSUBSCRIBED" } },
                },
              },
            })),
          },
        },
      },
    },
  });
};

/** Klaviyo's filter takes this many addresses at once. */
export const KLAVIYO_LOOKUP_BATCH = 100;

/** Profile ids of the given addresses (lowercase), for those Klaviyo has. */
export const findKlaviyoProfileIds = async (
  apiKey: string,
  emails: string[],
) => {
  const ids = new Map<string, string>();
  if (!emails.length) return ids;
  const response = await requestKlaviyo<
    Array<{ id: string; attributes?: { email?: string | null } }>
  >(apiKey, "/profiles", {
    searchParams: {
      "page[size]": String(KLAVIYO_LOOKUP_BATCH),
      "fields[profile]": "email",
      filter: `any(email,[${emails.map((email) => JSON.stringify(email)).join(",")}])`,
    },
  });
  for (const profile of response?.data ?? []) {
    const email = profile.attributes?.email?.trim().toLowerCase();
    if (email) ids.set(email, profile.id);
  }
  return ids;
};

/** Sets custom properties on one profile; other properties stay. */
export const setKlaviyoProfileProperties = async (
  apiKey: string,
  profileId: string,
  properties: Record<string, string>,
) => {
  await requestKlaviyo(apiKey, `/profiles/${encodeURIComponent(profileId)}`, {
    method: "PATCH",
    body: {
      data: { type: "profile", id: profileId, attributes: { properties } },
    },
  });
};

export const testKlaviyoCredentials = async (apiKey: string) => {
  await requestKlaviyo<KlaviyoProfile[]>(apiKey, "/profiles", {
    searchParams: { "page[size]": "1" },
  });
  return true;
};

export const maskKlaviyoApiKey = (apiKey?: string) => {
  if (!apiKey) return "";
  const trimmed = apiKey.trim();
  if (trimmed.length <= 4) return "*".repeat(trimmed.length);
  return `${"*".repeat(Math.max(4, trimmed.length - 4))}${trimmed.slice(-4)}`;
};
