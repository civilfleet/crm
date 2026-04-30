import crypto from "crypto";
import { IntegrationProvider as PrismaIntegrationProvider } from "@prisma/client";
import prisma from "@/lib/prisma";
import { EngagementDirection, EngagementSource } from "@/types";
import logger from "@/lib/logger";
import { enqueueZammadTicketSyncJob } from "@/services/integrations/zammad-queue";

const ZAMMAD_SOURCE_PREFIX = "ZAMMAD";

const normalizeBaseUrl = (value?: string | null) =>
  value ? value.replace(/\/+$/, "") : "";

const maskToken = (token?: string | null) => {
  if (!token) return "";
  if (token.length <= 8) return "••••";
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
};

const buildExternalSource = (ticketId: number | string) =>
  `${ZAMMAD_SOURCE_PREFIX}:${ticketId}`;

const extractEmails = (value?: string | null): string[] => {
  if (!value) return [];
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return matches ? matches.map((match) => match.toLowerCase()) : [];
};

const stripHtml = (value?: string | null) =>
  (value || "").replace(/<[^>]*>/g, "").replace(/\s+\n/g, "\n").trim();

const buildDetails = (details: Array<{ label: string; value?: string | null }>) =>
  details
    .filter((detail) => detail.value)
    .map((detail) => `${detail.label}: ${detail.value}`)
    .join("\n");

const buildEngagementMessage = (body: string, details: string) => {
  const trimmedBody = body.trim();
  if (!details) {
    return trimmedBody || "No message content.";
  }
  const combined = `${trimmedBody}\n\n${details}`.trim();
  return combined || "No message content.";
};

const buildZammadHeaders = (apiKey: string) => ({
  Authorization: `Token token=${apiKey}`,
  "Content-Type": "application/json",
});

const fetchZammad = async <T>(baseUrl: string, path: string, apiKey: string) => {
  logger.debug({ baseUrl, path }, "[Zammad] Fetch");
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
    headers: buildZammadHeaders(apiKey),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    logger.error({
      path,
      status: response.status,
      body: text,
    }, "[Zammad] Fetch failed");
    throw new Error(text || response.statusText);
  }

  return (await response.json()) as T;
};

type ZammadUser = {
  id?: number;
  firstname?: string;
  lastname?: string;
  email?: string;
  login?: string;
  roles?: Array<{ id: number; name: string }>;
};

type ZammadTicket = {
  id: number;
  number?: string;
  title?: string;
  updated_at?: string;
  article_ids?: number[];
  group_id?: number;
};

type ZammadTicketArticle = {
  id: number;
  ticket_id: number;
  subject?: string;
  body?: string;
  body_plain?: string;
  from?: string;
  to?: string;
  cc?: string;
  sender?: string;
  sender_id?: number;
  type?: string;
  created_at?: string;
  created_by?: ZammadUser;
};

type ZammadGroup = {
  id: number;
  name: string;
};

type ZammadTicketCreateResponse = {
  id: number;
  article_ids?: number[];
};

export type ZammadIntegrationSettings = {
  id?: string;
  teamId?: string;
  isEnabled?: boolean;
  hasApiKey?: boolean;
  apiKeyPreview?: string;
  baseUrl?: string;
  webhookSecretSet?: boolean;
  connectionVerified?: boolean;
  connectionMessage?: string;
  lastSyncedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

const resolveUserName = (article: ZammadTicketArticle) => {
  const user = article.created_by;
  if (user?.firstname || user?.lastname) {
    return `${user.firstname ?? ""} ${user.lastname ?? ""}`.trim();
  }
  return article.from || undefined;
};

const resolveEngagementDirection = (article: ZammadTicketArticle) => {
  if (article.sender?.toLowerCase() === "customer") {
    return EngagementDirection.INBOUND;
  }
  return EngagementDirection.OUTBOUND;
};

const getTicketArticles = async (
  baseUrl: string,
  apiKey: string,
  ticketId: number,
) => {
  const ticket = await fetchZammad<ZammadTicket>(
    baseUrl,
    `/api/v1/tickets/${ticketId}?expand=true`,
    apiKey,
  );

  const articleIds = ticket.article_ids ?? [];
  if (!articleIds.length) {
    return { ticket, articles: [] as ZammadTicketArticle[] };
  }

  const articles = await Promise.all(
    articleIds.map((articleId) =>
      fetchZammad<ZammadTicketArticle>(
        baseUrl,
        `/api/v1/ticket_articles/${articleId}`,
        apiKey,
      ),
    ),
  );

  return { ticket, articles };
};

const findContactIdForEmails = async (teamId: string, emails: string[]) => {
  if (!emails.length) {
    return null;
  }

  const contact = await prisma.contact.findFirst({
    where: {
      teamId,
      email: { in: emails },
    },
    select: { id: true },
  });

  return contact?.id ?? null;
};

const ensureContactForEmail = async (
  teamId: string,
  email?: string | null,
  name?: string | null,
) => {
  if (!email) return null;
  const normalizedEmail = email.toLowerCase();
  const contactName =
    name?.trim() || normalizedEmail.split("@")[0] || "Unknown Contact";

  const contact = await prisma.contact.upsert({
    where: {
      teamId_email: {
        teamId,
        email: normalizedEmail,
      },
    },
    create: {
      teamId,
      name: contactName,
      email: normalizedEmail,
    },
    update: {},
    select: { id: true },
  });

  return contact.id;
};

const getZammadGroupSettingsMap = async (teamId: string) => {
  const settings = await prisma.zammadGroupSetting.findMany({
    where: { teamId },
  });

  return new Map(
    settings.map((setting) => [
      setting.groupId,
      {
        importEnabled: setting.importEnabled,
        autoCreateContacts: setting.autoCreateContacts,
      },
    ]),
  );
};

const upsertArticleEngagement = async (
  teamId: string,
  ticket: ZammadTicket,
  article: ZammadTicketArticle,
  baseUrl: string,
  contactIdOverride?: string,
  autoCreateContacts?: boolean,
  userIdOverride?: string,
  userNameOverride?: string,
) => {
  const body = article.body_plain || stripHtml(article.body);
  const details = buildDetails([
    { label: "From", value: article.from },
    { label: "To", value: article.to },
    { label: "Cc", value: article.cc },
    { label: "Ticket", value: ticket.number || String(ticket.id) },
    { label: "Ticket ID", value: String(ticket.id) },
    { label: "Article ID", value: String(article.id) },
    {
      label: "Zammad URL",
      value: `${normalizeBaseUrl(baseUrl)}/#ticket/zoom/${ticket.id}`,
    },
  ]);
  const message = buildEngagementMessage(body, details);

  const emails = Array.from(
    new Set([
      ...extractEmails(article.from),
      ...extractEmails(article.to),
      ...extractEmails(article.cc),
    ]),
  );

  const contactId =
    contactIdOverride || (await findContactIdForEmails(teamId, emails));
  if (!contactId && autoCreateContacts) {
    const primaryEmail =
      extractEmails(article.from)[0] ||
      extractEmails(article.to)[0] ||
      emails[0];
    const contactName = resolveUserName(article) || primaryEmail;
    const createdId = await ensureContactForEmail(
      teamId,
      primaryEmail,
      contactName,
    );
    if (createdId) {
      return await upsertArticleEngagement(
        teamId,
        ticket,
        article,
        baseUrl,
        createdId,
        false,
      );
    }
  }
  if (!contactId) {
    logger.warn({
      teamId,
      ticketId: ticket.id,
      articleId: article.id,
      emails,
    }, "[Zammad] No matching contact");
    return null;
  }

  const externalId = String(article.id);
  const externalSource = buildExternalSource(ticket.id);
  const engagedAt = article.created_at
    ? new Date(article.created_at)
    : new Date();

  const resolvedUserName = userNameOverride ?? resolveUserName(article);
  const resolvedUserId = userIdOverride ?? undefined;
  const updateUserFields: Record<string, unknown> = {};
  if (userNameOverride) {
    updateUserFields.userName = userNameOverride;
  }
  if (userIdOverride) {
    updateUserFields.userId = userIdOverride;
  }

  await prisma.contactEngagement.upsert({
    where: {
      teamId_externalId_externalSource: {
        teamId,
        externalId,
        externalSource,
      },
    },
    create: {
      contactId,
      teamId,
      direction: resolveEngagementDirection(article),
      source: EngagementSource.EMAIL,
      subject: article.subject || ticket.title || "Zammad ticket update",
      message,
      userName: resolvedUserName,
      userId: resolvedUserId,
      engagedAt,
      externalId,
      externalSource,
    },
    update: {
      direction: resolveEngagementDirection(article),
      subject: article.subject || ticket.title || "Zammad ticket update",
      message,
      userName: resolvedUserName,
      ...updateUserFields,
      engagedAt,
    },
  });

  logger.debug({
    teamId,
    contactId,
    ticketId: ticket.id,
    articleId: article.id,
  }, "[Zammad] Engagement upserted");

  return contactId;
};

const parseWebhookSignature = (header?: string | null) => {
  if (!header) return null;
  const [scheme, signature] = header.split("=");
  if (!signature) return null;
  return { scheme, signature };
};

const verifyWebhookSignature = (
  rawBody: string,
  secret: string,
  header?: string | null,
) => {
  const parsed = parseWebhookSignature(header);
  if (!parsed || parsed.scheme !== "sha1") {
    return false;
  }

  const digest = crypto
    .createHmac("sha1", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(parsed.signature),
      Buffer.from(digest),
    );
  } catch {
    return false;
  }
};

export const getZammadIntegration = async (
  teamId: string,
): Promise<ZammadIntegrationSettings | null> => {
  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.ZAMMAD,
      },
    },
  });

  if (!integration) {
    return null;
  }

  return {
    id: integration.id,
    teamId: integration.teamId,
    isEnabled: integration.isEnabled,
    hasApiKey: Boolean(integration.apiKey),
    apiKeyPreview: maskToken(integration.apiKey),
    baseUrl: integration.baseUrl ?? undefined,
    webhookSecretSet: Boolean(integration.webhookSecret),
    connectionVerified:
      Boolean(integration.apiKey) && Boolean(integration.baseUrl),
    lastSyncedAt: integration.lastSyncedAt?.toISOString(),
    createdAt: integration.createdAt.toISOString(),
    updatedAt: integration.updatedAt.toISOString(),
  };
};

export const saveZammadIntegration = async ({
  teamId,
  apiKey,
  baseUrl,
  webhookSecret,
  isEnabled,
  shouldTestConnection,
}: {
  teamId: string;
  apiKey?: string;
  baseUrl?: string;
  webhookSecret?: string;
  isEnabled?: boolean;
  shouldTestConnection?: boolean;
}): Promise<ZammadIntegrationSettings> => {
  const existing = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.ZAMMAD,
      },
    },
  });

  const nextApiKey = apiKey ?? existing?.apiKey ?? "";
  const nextBaseUrl = baseUrl ?? existing?.baseUrl ?? "";

  if (!nextApiKey) {
    throw new Error("API token is required to configure Zammad.");
  }

  if (!nextBaseUrl) {
    throw new Error("Base URL is required to configure Zammad.");
  }

  let connectionMessage = "";
  let connectionVerified = false;

  if (shouldTestConnection ?? true) {
    try {
      await fetchZammad<ZammadUser>(nextBaseUrl, "/api/v1/users/me", nextApiKey);
      connectionVerified = true;
      connectionMessage = "Zammad connection verified.";
    } catch (error) {
      connectionMessage =
        error instanceof Error
          ? `Unable to reach Zammad: ${error.message}`
          : "Unable to reach Zammad.";
    }
  }

  const record = await prisma.integrationConnection.upsert({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.ZAMMAD,
      },
    },
    create: {
      teamId,
      provider: PrismaIntegrationProvider.ZAMMAD,
      apiKey: nextApiKey,
      baseUrl: normalizeBaseUrl(nextBaseUrl),
      webhookSecret: webhookSecret ?? null,
      isEnabled: isEnabled ?? true,
    },
    update: {
      apiKey: nextApiKey,
      baseUrl: normalizeBaseUrl(nextBaseUrl),
      webhookSecret: webhookSecret ?? existing?.webhookSecret ?? null,
      isEnabled: isEnabled ?? existing?.isEnabled ?? true,
    },
  });

  return {
    id: record.id,
    teamId: record.teamId,
    isEnabled: record.isEnabled,
    hasApiKey: Boolean(record.apiKey),
    apiKeyPreview: maskToken(record.apiKey),
    baseUrl: record.baseUrl ?? undefined,
    webhookSecretSet: Boolean(record.webhookSecret),
    connectionVerified,
    connectionMessage,
    lastSyncedAt: record.lastSyncedAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
};

export const syncZammadIntegration = async (
  teamId: string,
  { fullSync = false }: { fullSync?: boolean } = {},
) => {
  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.ZAMMAD,
      },
    },
  });

  if (!integration || !integration.apiKey || !integration.baseUrl) {
    logger.error({ teamId }, "[Zammad] Sync missing integration settings");
    throw new Error("Zammad integration is not configured for this team.");
  }

  if (!integration.isEnabled) {
    logger.warn({
      teamId,
    }, "[Zammad] Sync skipped because integration is disabled");
    throw new Error("Zammad integration is currently disabled.");
  }

  logger.debug({
    teamId,
    baseUrl: integration.baseUrl,
    lastSyncedAt: integration.lastSyncedAt?.toISOString(),
    fullSync,
  }, "[Zammad] Sync start");

  const syncStartedAt = new Date();
  const groupSettings = await getZammadGroupSettingsMap(teamId);
  const perPage = 50;
  const tickets: ZammadTicket[] = [];
  let page = 1;
  const maxPages = 200;

  while (page <= maxPages) {
    const pageTickets = await fetchZammad<ZammadTicket[]>(
      integration.baseUrl,
      `/api/v1/tickets?per_page=${perPage}&page=${page}`,
      integration.apiKey,
    );

    logger.debug({
      page,
      count: pageTickets.length,
    }, "[Zammad] Tickets page fetched");

    if (!pageTickets.length) {
      break;
    }

    tickets.push(...pageTickets);

    if (pageTickets.length < perPage) {
      break;
    }

    page += 1;
  }

  if (page > maxPages) {
    logger.warn({ maxPages }, "[Zammad] Pagination stopped at max pages");
  }

  const lastSyncedAt = integration.lastSyncedAt ?? null;
  const filtered = fullSync
    ? tickets
    : lastSyncedAt
      ? tickets.filter((ticket) => {
          if (!ticket.updated_at) return true;
          return new Date(ticket.updated_at) > lastSyncedAt;
        })
      : tickets;

  logger.debug({
    total: tickets.length,
    filtered: filtered.length,
  }, "[Zammad] Tickets fetched");

  let engagementsUpserted = 0;

  for (const ticket of filtered) {
    const { ticket: fullTicket, articles } = await getTicketArticles(
      integration.baseUrl,
      integration.apiKey,
      ticket.id,
    );

    const groupId = fullTicket.group_id ?? ticket.group_id;
    const groupSetting = groupId ? groupSettings.get(groupId) : undefined;
    if (!groupSetting?.importEnabled) {
      continue;
    }

    for (const article of articles) {
      const contactId = await upsertArticleEngagement(
        teamId,
        fullTicket,
        article,
        integration.baseUrl,
        undefined,
        groupSetting?.autoCreateContacts ?? false,
      );
      if (contactId) {
        engagementsUpserted += 1;
      }
    }
  }

  const updated = await prisma.integrationConnection.update({
    where: { id: integration.id },
    data: { lastSyncedAt: syncStartedAt },
    select: { lastSyncedAt: true },
  });

  logger.info({
    teamId,
    engagementsUpserted,
    lastSyncedAt: updated.lastSyncedAt?.toISOString(),
  }, "[Zammad] Sync finished");

  return {
    engagementsUpserted,
    lastSyncedAt: updated.lastSyncedAt?.toISOString(),
  };
};

export const syncZammadTicket = async (teamId: string, ticketId: number) => {
  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.ZAMMAD,
      },
    },
  });

  if (!integration || !integration.apiKey || !integration.baseUrl) {
    logger.error({ teamId }, "[Zammad] Ticket sync missing integration settings");
    throw new Error("Zammad integration is not configured for this team.");
  }

  if (!integration.isEnabled) {
    logger.warn({
      teamId,
    }, "[Zammad] Ticket sync skipped because integration is disabled");
    throw new Error("Zammad integration is currently disabled.");
  }

  const { ticket, articles } = await getTicketArticles(
    integration.baseUrl,
    integration.apiKey,
    ticketId,
  );

  const groupSettings = await getZammadGroupSettingsMap(teamId);
  const groupId = ticket.group_id;
  const groupSetting = groupId ? groupSettings.get(groupId) : undefined;
  if (!groupSetting?.importEnabled) {
    return { engagementsUpserted: 0, ticketId };
  }

  let engagementsUpserted = 0;

  for (const article of articles) {
    const contactId = await upsertArticleEngagement(
      teamId,
      ticket,
      article,
      integration.baseUrl,
      undefined,
      groupSetting?.autoCreateContacts ?? false,
    );
    if (contactId) {
      engagementsUpserted += 1;
    }
  }

  logger.info({
    teamId,
    ticketId,
    engagementsUpserted,
  }, "[Zammad] Ticket sync processed");

  return { engagementsUpserted, ticketId };
};

export const handleZammadWebhook = async ({
  teamId,
  rawBody,
  signature,
}: {
  teamId: string;
  rawBody: string;
  signature?: string | null;
}) => {
  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.ZAMMAD,
      },
    },
  });

  if (!integration || !integration.apiKey || !integration.baseUrl) {
    logger.error({ teamId }, "[Zammad] Webhook missing integration settings");
    throw new Error("Zammad integration is not configured for this team.");
  }

  if (!integration.isEnabled) {
    logger.warn({
      teamId,
    }, "[Zammad] Webhook received but integration disabled");
    throw new Error("Zammad integration is currently disabled.");
  }

  if (integration.webhookSecret) {
    const isValid = verifyWebhookSignature(
      rawBody,
      integration.webhookSecret,
      signature,
    );
    if (!isValid) {
      logger.error({ teamId }, "[Zammad] Webhook signature invalid");
      throw new Error("Invalid webhook signature.");
    }
  }

  logger.debug({ teamId }, "[Zammad] Webhook received");

  const payload = JSON.parse(rawBody) as {
    ticket?: ZammadTicket;
    ticket_id?: number;
    article?: ZammadTicketArticle;
    articles?: ZammadTicketArticle[];
  };

  const ticketId =
    payload.ticket?.id ??
    payload.ticket_id ??
    payload.article?.ticket_id ??
    payload.articles?.[0]?.ticket_id ??
    null;

  if (!ticketId) {
    logger.error({
      teamId,
      payloadKeys: Object.keys(payload || {}),
    }, "[Zammad] Webhook missing ticket id");
    throw new Error("Webhook payload missing ticket id.");
  }

  const job = await enqueueZammadTicketSyncJob({ teamId, ticketId });

  logger.info({
    teamId,
    ticketId,
    jobId: job.id,
    status: job.status,
  }, "[Zammad] Webhook queued");

  return { jobId: job.id, status: job.status, ticketId };
};

export const replyToZammadTicket = async ({
  teamId,
  ticketId,
  message,
  subject,
  contactId,
  userId,
  userName,
}: {
  teamId: string;
  ticketId: number;
  message: string;
  subject?: string;
  contactId?: string;
  userId?: string;
  userName?: string;
}) => {
  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.ZAMMAD,
      },
    },
  });

  if (!integration || !integration.apiKey || !integration.baseUrl) {
    throw new Error("Zammad integration is not configured for this team.");
  }

  if (!integration.isEnabled) {
    throw new Error("Zammad integration is currently disabled.");
  }

  if (!contactId) {
    throw new Error("Contact email is required to send a reply.");
  }

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, teamId },
    select: { email: true, name: true },
  });

  if (!contact?.email) {
    throw new Error("Contact email is required to send a reply.");
  }

  const response = await fetch(
    `${normalizeBaseUrl(integration.baseUrl)}/api/v1/ticket_articles`,
    {
      method: "POST",
      headers: buildZammadHeaders(integration.apiKey),
      body: JSON.stringify({
        ticket_id: ticketId,
        body: message,
        subject,
        type: "email",
        sender: "Agent",
        to: contact.email,
        content_type: "text/plain",
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || response.statusText);
  }

  const article = (await response.json()) as ZammadTicketArticle;
  const ticket: ZammadTicket = {
    id: ticketId,
    title: subject,
  };

  await upsertArticleEngagement(
    teamId,
    ticket,
    article,
    integration.baseUrl,
    contactId,
    false,
    userId,
    userName,
  );

  return { articleId: article.id };
};

export const createZammadTicket = async ({
  teamId,
  contactId,
  groupId,
  subject,
  message,
  userId,
  userName,
}: {
  teamId: string;
  contactId: string;
  groupId: number;
  subject: string;
  message: string;
  userId?: string;
  userName?: string;
}) => {
  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.ZAMMAD,
      },
    },
  });

  if (!integration || !integration.apiKey || !integration.baseUrl) {
    throw new Error("Zammad integration is not configured for this team.");
  }

  if (!integration.isEnabled) {
    throw new Error("Zammad integration is currently disabled.");
  }

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, teamId },
    select: { email: true, name: true },
  });

  if (!contact?.email) {
    throw new Error("Contact email is required to create a Zammad ticket.");
  }

  const response = await fetch(
    `${normalizeBaseUrl(integration.baseUrl)}/api/v1/tickets`,
    {
      method: "POST",
      headers: buildZammadHeaders(integration.apiKey),
      body: JSON.stringify({
        title: subject,
        group_id: groupId,
        customer_id: `guess:${contact.email}`,
        article: {
          subject,
          body: message,
          type: "email",
          sender: "Agent",
          to: contact.email,
          content_type: "text/plain",
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || response.statusText);
  }

  const created = (await response.json()) as ZammadTicketCreateResponse;
  const { ticket, articles } = await getTicketArticles(
    integration.baseUrl,
    integration.apiKey,
    created.id,
  );

  let engagementsUpserted = 0;
  for (const article of articles) {
    const contactMatch = await upsertArticleEngagement(
      teamId,
      ticket,
      article,
      integration.baseUrl,
      contactId,
      false,
      userId,
      userName,
    );
    if (contactMatch) {
      engagementsUpserted += 1;
    }
  }

  return {
    ticketId: created.id,
    engagementsUpserted,
  };
};

export const getZammadGroups = async (teamId: string) => {
  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.ZAMMAD,
      },
    },
  });

  if (!integration || !integration.apiKey || !integration.baseUrl) {
    throw new Error("Zammad integration is not configured for this team.");
  }

  const tokenUser = await fetchZammad<ZammadUser>(
    integration.baseUrl,
    "/api/v1/users/me",
    integration.apiKey,
  );
  const groups = await fetchZammad<ZammadGroup[]>(
    integration.baseUrl,
    "/api/v1/groups",
    integration.apiKey,
  );

  const settings = await prisma.zammadGroupSetting.findMany({
    where: { teamId },
  });
  const settingsById = new Map(
    settings.map((setting) => [setting.groupId, setting]),
  );

  const userGroupIds = tokenUser && (tokenUser as { group_ids?: Record<string, unknown> }).group_ids
    ? Object.keys((tokenUser as { group_ids?: Record<string, unknown> }).group_ids || {}).map((id) => Number(id))
    : [];
  const filteredGroups =
    userGroupIds.length > 0
      ? groups.filter((group) => userGroupIds.includes(group.id))
      : groups;

  return filteredGroups.map((group) => {
    const existing = settingsById.get(group.id);
    return {
      groupId: group.id,
      groupName: group.name,
      importEnabled: existing?.importEnabled ?? false,
      autoCreateContacts: existing?.autoCreateContacts ?? false,
    };
  });
};


export const saveZammadGroups = async (
  teamId: string,
  groups: Array<{
    groupId: number;
    groupName: string;
    importEnabled: boolean;
    autoCreateContacts: boolean;
  }>,
) => {
  const operations = groups.map((group) =>
    prisma.zammadGroupSetting.upsert({
      where: {
        teamId_groupId: {
          teamId,
          groupId: group.groupId,
        },
      },
      create: {
        teamId,
        groupId: group.groupId,
        groupName: group.groupName,
        importEnabled: group.importEnabled,
        autoCreateContacts: group.autoCreateContacts,
      },
      update: {
        groupName: group.groupName,
        importEnabled: group.importEnabled,
        autoCreateContacts: group.autoCreateContacts,
      },
    }),
  );

  await prisma.$transaction(operations);

  return { saved: groups.length };
};

export const getZammadWebhookUrl = (baseUrl: string, teamId: string) =>
  `${normalizeBaseUrl(baseUrl)}/api/teams/${teamId}/integrations/zammad/webhook`;

export const parseZammadExternalSource = (externalSource?: string | null) => {
  if (!externalSource) return null;
  if (!externalSource.startsWith(`${ZAMMAD_SOURCE_PREFIX}:`)) return null;
  const ticketId = externalSource.split(":")[1];
  return ticketId ? Number(ticketId) : null;
};
