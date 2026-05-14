import { IntegrationProvider as PrismaIntegrationProvider } from "@prisma/client";
import {
  fetchKlaviyoCampaignMessage,
  fetchKlaviyoEmailEvents,
  fetchKlaviyoEventDetails,
  fetchKlaviyoEventMetric,
  fetchKlaviyoMessageContent,
  fetchKlaviyoProfiles,
  fetchKlaviyoTemplate,
  type KlaviyoEvent,
  type KlaviyoProfile,
  maskKlaviyoApiKey,
  testKlaviyoCredentials,
} from "@/lib/klaviyo";
import prisma from "@/lib/prisma";
import { logContactCreation } from "@/services/contact-change-logs";
import {
  EngagementDirection,
  EngagementSource,
  type IntegrationConnection,
  IntegrationProvider,
} from "@/types";

const EXTERNAL_SOURCE = "KLAVIYO";

export type KlaviyoIntegrationSettings = IntegrationConnection & {
  hasApiKey: boolean;
  apiKeyPreview?: string;
  connectionVerified?: boolean;
  connectionMessage?: string;
};

export type KlaviyoSyncResult = {
  contactsCreated: number;
  contactsUpdated: number;
  engagementsUpserted: number;
  fallbackContactsCreated: number;
  lastSyncedAt: Date;
};

const getContactName = (profile: KlaviyoProfile, fallback: string) => {
  const first = profile.attributes.first_name?.trim() ?? "";
  const last = profile.attributes.last_name?.trim() ?? "";
  const name = [first, last].filter(Boolean).join(" ").trim();
  if (name) {
    return name;
  }
  return fallback;
};

const normalizeEmail = (email?: string) => email?.trim().toLowerCase() ?? "";

const upsertContactFromProfile = async (
  teamId: string,
  profile: KlaviyoProfile,
) => {
  const email = normalizeEmail(profile.attributes.email);
  if (!email) {
    return null;
  }

  const existing = await prisma.contact.findUnique({
    where: {
      teamId_email: {
        teamId,
        email,
      },
    },
  });

  const name = getContactName(profile, email);
  const phone = profile.attributes.phone_number?.trim() || undefined;
  const city =
    profile.attributes.location?.city?.trim() ||
    profile.attributes.location?.region?.trim() ||
    undefined;

  if (existing) {
    const updated = await prisma.contact.update({
      where: { id: existing.id },
      data: {
        name,
        phone,
        city,
      },
    });
    return {
      contactId: updated.id,
      created: false,
    };
  }

  const created = await prisma.contact.create({
    data: {
      teamId,
      name,
      email,
      phone,
      city,
    },
  });

  await logContactCreation(created.id, undefined, "Klaviyo import", prisma);

  return {
    contactId: created.id,
    created: true,
  };
};

const resolveEngagementDirection = (metricName?: string) => {
  const lower = metricName?.toLowerCase() ?? "";
  if (
    lower.includes("open") ||
    lower.includes("click") ||
    lower.includes("reply") ||
    lower.includes("responded")
  ) {
    return EngagementDirection.INBOUND;
  }
  return EngagementDirection.OUTBOUND;
};

const getEventProperties = (event: KlaviyoEvent) =>
  event.attributes.properties ?? event.attributes.event_properties ?? {};

const stripHtml = (html?: string) =>
  typeof html === "string"
    ? html
        .replace(/<(br|p|div|section|article)[^>]*>/gi, "\n")
        .replace(/<\/(p|div|section|article)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+\n/g, "\n")
        .replace(/\n+\s*\n+/g, "\n\n")
        .replace(/\s{2,}/g, " ")
        .trim()
    : undefined;

const buildEngagementContent = async (
  event: KlaviyoEvent,
  profileId: string | undefined,
  apiKey: string,
) => {
  const properties = getEventProperties(event);
  const resolveMessageId = () => {
    const direct =
      (properties.$message as string | undefined) ||
      (properties.message_id as string | undefined) ||
      (properties.$message_interaction as string | undefined) ||
      (properties.message_interaction as string | undefined);
    if (direct && typeof direct === "string" && direct.trim()) {
      return direct.trim();
    }
    const cohort = properties.$_cohort$message_send_cohort;
    if (typeof cohort === "string" && cohort.includes(":")) {
      const parts = cohort.split(":");
      const last = parts[parts.length - 1]?.trim();
      if (last) {
        return last;
      }
    }
    const eventId = properties.$event_id as string | undefined;
    if (eventId?.includes(":")) {
      const maybe = eventId.split(":")[0]?.trim();
      if (maybe) {
        return maybe;
      }
    }
    return undefined;
  };

  const messageId = resolveMessageId();

  const possibleBodyFields = [
    properties.body as string | undefined,
    properties.Body as string | undefined,
    properties.preview_text as string | undefined,
  ];
  const body = possibleBodyFields.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );

  let subject =
    (properties.subject as string | undefined) ||
    (properties.Subject as string | undefined) ||
    (properties["Campaign Name"] as string | undefined) ||
    (properties.campaign_name as string | undefined) ||
    event.attributes.metric?.name ||
    "Email engagement";

  const detailEntries: Array<[string, string]> = [];
  const seenLabels = new Set<string>();
  const usedPropertyKeys = new Set<string>();

  const addDetail = (label: string, value?: unknown) => {
    if (value === undefined || value === null) {
      return;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      const normalized = String(value).trim();
      if (normalized && !seenLabels.has(label)) {
        seenLabels.add(label);
        detailEntries.push([label, normalized]);
      }
      return;
    }
    try {
      const serialized = JSON.stringify(value, null, 2);
      if (serialized && !seenLabels.has(label)) {
        seenLabels.add(label);
        detailEntries.push([label, serialized]);
      }
    } catch {
      // ignore non-serializable
    }
  };

  const addPropertyDetail = (label: string, key?: keyof typeof properties) => {
    if (!key) return;
    if (Object.hasOwn(properties, key)) {
      usedPropertyKeys.add(String(key));
      addDetail(label, properties[key]);
    }
  };

  addPropertyDetail("Recipient", "Recipient Email Address");
  addPropertyDetail("Recipient", "recipient");
  addPropertyDetail("Recipient", "email");
  addPropertyDetail("Recipient", "to_email");
  addPropertyDetail("Recipient", "email_address");
  addPropertyDetail("Recipient", "to");
  addPropertyDetail("Recipient", "from_email");
  addPropertyDetail("Recipient", "from");
  addPropertyDetail("Recipient", "customer_email");

  addPropertyDetail("Subject", "subject");
  addPropertyDetail("Subject", "Subject");
  addPropertyDetail("Campaign Name", "Campaign Name");
  addPropertyDetail("Campaign Name", "campaign_name");
  addPropertyDetail("Inbox Provider", "Inbox Provider");
  addPropertyDetail("Email Domain", "Email Domain");
  addPropertyDetail("Email Domain", "email_domain");
  addPropertyDetail("Email Domain", "domain");
  addPropertyDetail("Message Id", "message_id");
  addPropertyDetail("Klaviyo Message", "$message");

  addDetail(
    "Metric",
    event.attributes.metric?.name ?? event.attributes.metric?.id,
  );
  addDetail("Event Timestamp", event.attributes.timestamp);
  addDetail("Event Id", event.id);
  addDetail("Profile Id", profileId);

  const ignoredKeys = new Set([
    "body",
    "Body",
    "preview_text",
    "subject",
    "Subject",
    "$message",
    ...usedPropertyKeys,
  ]);

  Object.entries(properties).forEach(([key, value]) => {
    if (ignoredKeys.has(key)) {
      return;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      const normalized = String(value).trim();
      if (normalized) {
        detailEntries.push([`Additional - ${key}`, normalized]);
      }
      return;
    }
    try {
      const serialized = JSON.stringify(value, null, 2);
      if (serialized && serialized !== "{}" && serialized !== "[]") {
        detailEntries.push([`Additional - ${key}`, serialized]);
      }
    } catch {
      // ignore
    }
  });

  let enrichedBody = body?.trim();
  if (messageId) {
    const campaignMessage = await fetchKlaviyoCampaignMessage(
      apiKey,
      messageId,
    );
    const includedTemplate = campaignMessage?.included?.find(
      (item) => item.type === "template",
    );
    const templateId =
      includedTemplate?.id ??
      campaignMessage?.data?.relationships?.template?.data?.id;

    if (
      includedTemplate?.attributes?.html ||
      includedTemplate?.attributes?.text
    ) {
      enrichedBody =
        stripHtml(includedTemplate.attributes?.html ?? undefined) ||
        (includedTemplate.attributes?.text ?? undefined)?.trim() ||
        enrichedBody;
    }

    if (!enrichedBody && templateId) {
      const template = await fetchKlaviyoTemplate(apiKey, templateId);
      const templateHtml = template?.attributes?.html ?? undefined;
      const templateText = template?.attributes?.text ?? undefined;
      enrichedBody =
        stripHtml(templateHtml) ||
        (typeof templateText === "string" && templateText.trim()
          ? templateText.trim()
          : undefined);
    }

    if (!enrichedBody) {
      const messageContent = await fetchKlaviyoMessageContent(
        apiKey,
        messageId,
      );
      const htmlBody =
        messageContent?.attributes?.html_body ??
        messageContent?.attributes?.html ??
        messageContent?.attributes?.content_html;
      const textBody =
        messageContent?.attributes?.text_body ??
        messageContent?.attributes?.text ??
        messageContent?.attributes?.content_text;

      enrichedBody =
        stripHtml(htmlBody) ||
        (typeof textBody === "string" && textBody.trim()
          ? textBody.trim()
          : undefined);

      if (!subject && messageContent?.attributes?.subject) {
        subject = messageContent.attributes.subject;
      }
    }

    if (!subject && campaignMessage?.data?.attributes?.content?.subject) {
      subject = campaignMessage.data.attributes.content.subject;
    }
  }

  const detailsText =
    detailEntries.length > 0
      ? detailEntries.map(([label, value]) => `${label}: ${value}`).join("\n")
      : JSON.stringify(
          {
            metric: event.attributes.metric,
            properties,
            timestamp: event.attributes.timestamp,
            profileId,
            rawEvent: event,
          },
          null,
          2,
        );

  const message = enrichedBody
    ? [enrichedBody, detailsText].filter(Boolean).join("\n\n")
    : [subject, detailsText].filter(Boolean).join("\n\n");

  return {
    subject,
    message: message || subject,
  };
};

const getEmailFromEvent = (event: KlaviyoEvent) => {
  const properties = getEventProperties(event);
  const possibleEmailFields = [
    properties.email as string | undefined,
    properties.to as string | undefined,
    properties.recipient as string | undefined,
    properties.to_email as string | undefined,
    properties.email_address as string | undefined,
    properties.from_email as string | undefined,
    properties.from as string | undefined,
    properties.customer_email as string | undefined,
  ];

  const email = possibleEmailFields.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );

  return normalizeEmail(email);
};

const createEngagementFromEvent = async ({
  teamId,
  contactId,
  event,
  profileId,
  apiKey,
}: {
  teamId: string;
  contactId: string;
  event: KlaviyoEvent;
  profileId?: string;
  apiKey: string;
}) => {
  const direction = resolveEngagementDirection(event.attributes.metric?.name);

  let enrichedEvent = event;

  const properties = getEventProperties(event);
  const hasMeaningfulProperties =
    properties && Object.keys(properties).length > 0;
  const hasMetricDetails = Boolean(event.attributes.metric?.name);
  const hasProfile = Boolean(event.relationships?.profile?.data?.id);

  if (!hasMeaningfulProperties || !hasMetricDetails || !hasProfile) {
    try {
      const detail = await fetchKlaviyoEventDetails(apiKey, event.id);
      if (
        detail?.attributes?.properties &&
        Object.keys(detail.attributes.properties).length > 0
      ) {
        enrichedEvent = {
          ...event,
          attributes: { ...event.attributes, ...detail.attributes },
          relationships: detail.relationships ?? event.relationships,
        };
      } else {
        enrichedEvent = detail ?? event;
      }
    } catch (_error) {
      // Fallback to the original event if detail fetch fails.
    }
  }

  if (!enrichedEvent.attributes.metric?.name) {
    try {
      const metric = await fetchKlaviyoEventMetric(apiKey, event.id);
      if (metric?.attributes?.name) {
        enrichedEvent = {
          ...enrichedEvent,
          attributes: {
            ...enrichedEvent.attributes,
            metric: {
              id: metric.id ?? enrichedEvent.attributes.metric?.id,
              name: metric.attributes.name,
            },
          },
        };
      }
    } catch (_error) {
      // keep existing metric info if fetch fails
    }
  }

  const { subject, message } = await buildEngagementContent(
    enrichedEvent,
    profileId,
    apiKey,
  );

  const rawTimestamp = enrichedEvent.attributes.timestamp;
  const engagedAt = (() => {
    if (typeof rawTimestamp === "number") {
      return new Date(
        rawTimestamp > 2_000_000_000 ? rawTimestamp : rawTimestamp * 1000,
      );
    }
    if (typeof rawTimestamp === "string") {
      const asNumber = Number(rawTimestamp);
      if (!Number.isNaN(asNumber) && asNumber > 0) {
        return new Date(asNumber > 2_000_000_000 ? asNumber : asNumber * 1000);
      }
      const parsed = new Date(rawTimestamp);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
  })();

  await prisma.contactEngagement.upsert({
    where: {
      teamId_externalId_externalSource: {
        teamId,
        externalId: event.id,
        externalSource: EXTERNAL_SOURCE,
      },
    },
    update: {
      direction,
      source: EngagementSource.EMAIL,
      subject,
      message,
      engagedAt,
    },
    create: {
      contactId,
      teamId,
      direction,
      source: EngagementSource.EMAIL,
      subject,
      message,
      engagedAt,
      externalId: event.id,
      externalSource: EXTERNAL_SOURCE,
    },
  });
};

export const getKlaviyoIntegration = async (
  teamId: string,
): Promise<KlaviyoIntegrationSettings | null> => {
  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.KLAVIYO,
      },
    },
  });

  if (!integration) {
    return null;
  }

  return {
    id: integration.id,
    teamId: integration.teamId,
    provider: IntegrationProvider.KLAVIYO,
    defaultListId: integration.defaultListId ?? undefined,
    isEnabled: integration.isEnabled,
    lastSyncedAt: integration.lastSyncedAt ?? undefined,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
    hasApiKey: Boolean(integration.apiKey),
    apiKeyPreview: maskKlaviyoApiKey(integration.apiKey),
    connectionVerified: Boolean(integration.apiKey) && integration.isEnabled,
  };
};

export const saveKlaviyoIntegration = async ({
  teamId,
  apiKey,
  defaultListId,
  isEnabled,
  shouldTestConnection,
}: {
  teamId: string;
  apiKey?: string;
  defaultListId?: string;
  isEnabled?: boolean;
  shouldTestConnection?: boolean;
}): Promise<KlaviyoIntegrationSettings> => {
  const existing = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.KLAVIYO,
      },
    },
  });

  const apiKeyToPersist = apiKey?.trim() || existing?.apiKey;

  if (!apiKeyToPersist) {
    throw new Error("API key is required to configure Klaviyo integration.");
  }

  if (shouldTestConnection) {
    await testKlaviyoCredentials(apiKeyToPersist);
  }

  const record = await prisma.integrationConnection.upsert({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.KLAVIYO,
      },
    },
    update: {
      apiKey: apiKeyToPersist,
      defaultListId,
      isEnabled: isEnabled ?? existing?.isEnabled ?? true,
    },
    create: {
      teamId,
      provider: PrismaIntegrationProvider.KLAVIYO,
      apiKey: apiKeyToPersist,
      defaultListId,
      isEnabled: isEnabled ?? true,
    },
  });

  return {
    id: record.id,
    teamId: record.teamId,
    provider: IntegrationProvider.KLAVIYO,
    defaultListId: record.defaultListId ?? undefined,
    isEnabled: record.isEnabled,
    lastSyncedAt: record.lastSyncedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    hasApiKey: Boolean(record.apiKey),
    apiKeyPreview: maskKlaviyoApiKey(record.apiKey),
    connectionVerified: true,
    connectionMessage: shouldTestConnection
      ? "Connection successful"
      : undefined,
  };
};

export const syncKlaviyoIntegration = async (
  teamId: string,
): Promise<KlaviyoSyncResult> => {
  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.KLAVIYO,
      },
    },
  });

  if (!integration?.apiKey) {
    throw new Error("Klaviyo integration is not configured for this team.");
  }

  if (!integration.isEnabled) {
    throw new Error("Klaviyo integration is currently disabled.");
  }

  const profileIdToContactId = new Map<string, string>();
  const emailToContactId = new Map<string, string>();
  let contactsCreated = 0;
  let contactsUpdated = 0;
  let fallbackContactsCreated = 0;

  const ensureContactForEmail = async (
    email?: string,
  ): Promise<string | undefined> => {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      return undefined;
    }

    const cached = emailToContactId.get(normalized);
    if (cached) {
      return cached;
    }

    const existing = await prisma.contact.findUnique({
      where: {
        teamId_email: {
          teamId,
          email: normalized,
        },
      },
    });

    if (existing) {
      emailToContactId.set(normalized, existing.id);
      return existing.id;
    }

    const created = await prisma.contact.create({
      data: {
        teamId,
        email: normalized,
        name: normalized,
      },
    });
    await logContactCreation(created.id, undefined, "Klaviyo import", prisma);
    fallbackContactsCreated += 1;
    emailToContactId.set(normalized, created.id);
    return created.id;
  };

  let profileCursor: string | undefined;
  do {
    const { profiles, nextCursor } = await fetchKlaviyoProfiles(
      integration.apiKey,
      profileCursor,
    );

    for (const profile of profiles) {
      const result = await upsertContactFromProfile(teamId, profile);
      if (result) {
        if (result.created) {
          contactsCreated += 1;
        } else {
          contactsUpdated += 1;
        }
        profileIdToContactId.set(profile.id, result.contactId);
        const email = normalizeEmail(profile.attributes.email);
        if (email) {
          emailToContactId.set(email, result.contactId);
        }
      }
    }

    profileCursor = nextCursor;
  } while (profileCursor);

  let engagementsUpserted = 0;
  let eventsCursor: string | undefined;
  do {
    const { events, nextCursor } = await fetchKlaviyoEmailEvents(
      integration.apiKey,
      eventsCursor,
    );

    for (const event of events) {
      const profileId = event.relationships?.profile?.data?.id;
      const email = getEmailFromEvent(event);
      const contactIdFromProfile = profileId
        ? profileIdToContactId.get(profileId)
        : undefined;
      const contactIdFromEmail = email
        ? emailToContactId.get(email)
        : undefined;

      let contactId = contactIdFromProfile ?? contactIdFromEmail;

      if (!contactId && email) {
        contactId = await ensureContactForEmail(email);
      }

      if (!contactId) {
        continue;
      }

      await createEngagementFromEvent({
        teamId,
        contactId,
        event,
        profileId,
        apiKey: integration.apiKey,
      });
      engagementsUpserted += 1;
    }

    eventsCursor = nextCursor;
  } while (eventsCursor);

  const now = new Date();
  await prisma.integrationConnection.update({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.KLAVIYO,
      },
    },
    data: {
      lastSyncedAt: now,
    },
  });

  return {
    contactsCreated,
    contactsUpdated,
    engagementsUpserted,
    fallbackContactsCreated,
    lastSyncedAt: now,
  };
};
