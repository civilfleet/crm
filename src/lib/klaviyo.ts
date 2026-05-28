const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const KLAVIYO_API_REVISION = "2024-06-15";

type KlaviyoResponseLinks = {
  next?: string;
};

export type KlaviyoProfile = {
  id: string;
  type?: string;
  attributes: {
    email?: string;
    phone_number?: string;
    first_name?: string;
    last_name?: string;
    location?: {
      address1?: string;
      address2?: string;
      city?: string;
      region?: string;
      country?: string;
      zip?: string;
    };
    properties?: Record<string, unknown>;
  };
};

export type KlaviyoEvent = {
  id: string;
  type?: string;
  attributes: {
    timestamp?: string;
    event_properties?: Record<string, unknown>;
    properties?: Record<string, unknown>;
    metric?: {
      id?: string;
      name?: string;
    };
  };
  relationships?: {
    profile?: {
      data?: {
        id?: string;
        type?: string;
      } | null;
    };
  };
};

export type KlaviyoMetric = {
  id?: string;
  type?: string;
  attributes?: {
    name?: string;
  };
};

export type KlaviyoMessageContent = {
  id?: string;
  attributes?: {
    subject?: string;
    html_body?: string;
    text_body?: string;
    html?: string;
    text?: string;
    content_html?: string;
    content_text?: string;
  };
};

export type KlaviyoCampaignMessage = {
  id: string;
  type?: string;
  attributes?: {
    label?: string;
    channel?: string;
    content?: {
      subject?: string;
      preview_text?: string;
      from_email?: string;
      from_label?: string;
      reply_to_email?: string;
    };
  };
  relationships?: {
    template?: {
      data?: {
        id?: string;
        type?: string;
      } | null;
    };
  };
};
export type KlaviyoCampaignMessageResponse = KlaviyoListResponse<
  KlaviyoCampaignMessage,
  KlaviyoTemplate
>;

export type KlaviyoTemplate = {
  id: string;
  type?: string;
  attributes?: {
    name?: string | null;
    editor_type?: string | null;
    html?: string | null;
    text?: string | null;
  };
};

type KlaviyoListResponse<TData, TIncluded = never> = {
  data: TData;
  included?: TIncluded[];
  links?: KlaviyoResponseLinks;
};

type RequestSearchParams = Record<string, string | undefined>;

const buildUrl = (path: string, searchParams: RequestSearchParams = {}) => {
  const url = new URL(`${KLAVIYO_API_BASE}${path}`);
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  return url;
};

const parseNextCursor = (nextLink?: string) => {
  if (!nextLink) {
    return undefined;
  }
  try {
    const nextUrl = new URL(nextLink);
    return nextUrl.searchParams.get("page[cursor]") ?? undefined;
  } catch {
    return undefined;
  }
};

export const requestKlaviyo = async <TData, TIncluded = never>(
  apiKey: string,
  path: string,
  searchParams: RequestSearchParams = {},
) => {
  const url = buildUrl(path, searchParams);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      Accept: "application/json",
      revision: KLAVIYO_API_REVISION,
    },
  });

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorBody = (await response.json()) as {
        errors?: Array<{ detail?: string; title?: string }>;
        message?: string;
      };
      if (errorBody?.errors?.[0]?.detail) {
        errorMessage = errorBody.errors[0].detail;
      } else if (errorBody?.errors?.[0]?.title) {
        errorMessage = errorBody.errors[0].title;
      } else if (errorBody?.message) {
        errorMessage = errorBody.message;
      }
    } catch {
      // Ignore parsing errors and fall back to status text.
    }
    throw new Error(
      `Klaviyo request failed (${response.status}): ${errorMessage}`,
    );
  }

  return (await response.json()) as KlaviyoListResponse<TData, TIncluded>;
};

export const fetchKlaviyoProfiles = async (apiKey: string, cursor?: string) => {
  const response = await requestKlaviyo<KlaviyoProfile[]>(apiKey, "/profiles", {
    "page[size]": "50",
    "page[cursor]": cursor,
    "fields[profile]":
      "email,first_name,last_name,phone_number,location,properties",
  });

  return {
    profiles: response.data,
    nextCursor: parseNextCursor(response.links?.next),
  };
};

export const fetchKlaviyoEmailEvents = async (
  apiKey: string,
  cursor?: string,
) => {
  const response = await requestKlaviyo<KlaviyoEvent[]>(apiKey, "/events", {
    "page[size]": "50",
    "page[cursor]": cursor,
    sort: "-timestamp",
    "fields[event]": "event_properties,timestamp",
    include: "metric,profile",
    "fields[metric]": "name",
    "fields[profile]": "email",
  });

  return {
    events: response.data,
    nextCursor: parseNextCursor(response.links?.next),
  };
};

export const fetchKlaviyoEventDetails = async (
  apiKey: string,
  eventId: string,
) => {
  const response = await requestKlaviyo<KlaviyoEvent>(
    apiKey,
    `/events/${eventId}`,
    {
      "fields[event]": "event_properties,timestamp",
      include: "metric,profile",
      "fields[metric]": "name",
      "fields[profile]": "email",
    },
  );

  return response.data;
};

export const fetchKlaviyoEventMetric = async (
  apiKey: string,
  eventId: string,
) => {
  const response = await requestKlaviyo<KlaviyoMetric>(
    apiKey,
    `/events/${eventId}/metric`,
    {
      "fields[metric]": "name",
    },
  );

  return response.data;
};

export const fetchKlaviyoMessageContent = async (
  apiKey: string,
  messageId: string,
) => {
  try {
    const response = await requestKlaviyo<KlaviyoMessageContent>(
      apiKey,
      `/messages/${messageId}/content`,
    );
    return response.data;
  } catch (_error) {
    // If message content endpoint is not available or fails, return null so caller can fallback.
    return null;
  }
};

export const fetchKlaviyoCampaignMessage = async (
  apiKey: string,
  messageId: string,
) => {
  try {
    const response = await requestKlaviyo<
      KlaviyoCampaignMessage,
      KlaviyoTemplate
    >(apiKey, `/campaign-messages/${messageId}`, {
      include: "template",
      "fields[template]": "html,text,name",
    });
    return response;
  } catch (_error) {
    return null;
  }
};

export const fetchKlaviyoTemplate = async (
  apiKey: string,
  templateId: string,
) => {
  try {
    const response = await requestKlaviyo<KlaviyoTemplate>(
      apiKey,
      `/templates/${templateId}`,
      {
        "fields[template]": "html,text,name",
      },
    );
    return response.data;
  } catch (_error) {
    return null;
  }
};

export const testKlaviyoCredentials = async (apiKey: string) => {
  await requestKlaviyo<KlaviyoProfile[]>(apiKey, "/profiles", {
    "page[size]": "1",
  });
  return true;
};

export const maskKlaviyoApiKey = (apiKey?: string) => {
  if (!apiKey) {
    return "";
  }
  const trimmed = apiKey.trim();
  if (trimmed.length <= 4) {
    return "*".repeat(trimmed.length);
  }
  const suffix = trimmed.slice(-4);
  return `${"*".repeat(Math.max(4, trimmed.length - 4))}${suffix}`;
};