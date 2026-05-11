import {
  EngagementDirection,
  EngagementSource,
  IntegrationProvider,
  type IntegrationConnection,
} from "@/types";
import { IntegrationProvider as PrismaIntegrationProvider } from "@prisma/client";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";

const DEFAULT_REGION = "fr-par";
const EXTERNAL_SOURCE = "SCALEWAY_TEM";
const MAX_RECIPIENTS = 100;

type ScalewayEmailRecord = {
  id?: string;
  status?: string;
};

export type ScalewayEmailIntegrationSettings = IntegrationConnection & {
  hasApiKey: boolean;
  apiKeyPreview?: string;
  connectionVerified?: boolean;
  connectionMessage?: string;
  region?: string;
  projectId?: string;
};

export type SendMassEmailInput = {
  teamId: string;
  contactIds: string[];
  subject: string;
  html: string;
  userId?: string;
  userName?: string;
};

export type SendMassEmailResult = {
  requested: number;
  sent: number;
  skipped: number;
  failed: number;
  failures: Array<{
    contactId: string;
    email?: string;
    message: string;
  }>;
};

const maskApiKey = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  if (value.length <= 8) {
    return "••••";
  }
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
};

const stripHtml = (html: string) =>
  html
    .replace(/<(br|p|div|section|article)[^>]*>/gi, "\n")
    .replace(/<\/(p|div|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n+\s*\n+/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();

const parseScalewayResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
};

const assertOkResponse = async (response: Response, fallback: string) => {
  if (response.ok) {
    return;
  }

  const body = await parseScalewayResponse(response);
  const message =
    (typeof body.message === "string" && body.message) ||
    (typeof body.error === "string" && body.error) ||
    fallback;
  throw new Error(message);
};

const buildSender = (settings: {
  senderEmail?: string | null;
  senderName?: string | null;
}) => {
  const email = settings.senderEmail?.trim();
  if (!email) {
    throw new Error("Default sender email is required.");
  }

  const name = settings.senderName?.trim();
  return name ? { email, name } : { email };
};

const sendScalewayEmail = async ({
  apiKey,
  region,
  projectId,
  from,
  to,
  subject,
  html,
}: {
  apiKey: string;
  region: string;
  projectId: string;
  from: { email: string; name?: string };
  to: { email: string; name?: string };
  subject: string;
  html: string;
}) => {
  const response = await fetch(
    `https://api.scaleway.com/transactional-email/v1alpha1/regions/${region}/emails`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": apiKey,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: stripHtml(html),
        html,
        project_id: projectId,
      }),
    },
  );

  await assertOkResponse(response, "Scaleway Transactional Email send failed.");
  const body = await parseScalewayResponse(response);
  return (body.email ?? body) as ScalewayEmailRecord;
};

export const getScalewayEmailIntegration = async (
  teamId: string,
): Promise<ScalewayEmailIntegrationSettings | null> => {
  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.SCALEWAY_TEM,
      },
    },
  });

  if (!integration) {
    return null;
  }

  return {
    id: integration.id,
    teamId: integration.teamId,
    provider: IntegrationProvider.SCALEWAY_TEM,
    region: integration.baseUrl ?? DEFAULT_REGION,
    projectId: integration.defaultListId ?? undefined,
    senderEmail: integration.senderEmail ?? undefined,
    senderName: integration.senderName ?? undefined,
    isEnabled: integration.isEnabled,
    lastSyncedAt: integration.lastSyncedAt ?? undefined,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
    hasApiKey: Boolean(integration.apiKey),
    apiKeyPreview: maskApiKey(integration.apiKey),
    connectionVerified:
      Boolean(integration.apiKey) &&
      Boolean(integration.defaultListId) &&
      Boolean(integration.senderEmail) &&
      integration.isEnabled,
  };
};

export const saveScalewayEmailIntegration = async ({
  teamId,
  apiKey,
  region,
  projectId,
  senderEmail,
  senderName,
  isEnabled,
}: {
  teamId: string;
  apiKey?: string;
  region?: string;
  projectId?: string;
  senderEmail?: string;
  senderName?: string;
  isEnabled?: boolean;
}): Promise<ScalewayEmailIntegrationSettings> => {
  const existing = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.SCALEWAY_TEM,
      },
    },
  });

  const apiKeyToPersist = apiKey?.trim() || existing?.apiKey;
  const projectIdToPersist = projectId?.trim() || existing?.defaultListId;
  const senderEmailToPersist =
    senderEmail?.trim().toLowerCase() || existing?.senderEmail;

  if (!apiKeyToPersist) {
    throw new Error("Scaleway secret key is required.");
  }
  if (!projectIdToPersist) {
    throw new Error("Scaleway project ID is required.");
  }
  if (!senderEmailToPersist) {
    throw new Error("Default sender email is required.");
  }

  const record = await prisma.integrationConnection.upsert({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.SCALEWAY_TEM,
      },
    },
    update: {
      apiKey: apiKeyToPersist,
      baseUrl: region?.trim() || existing?.baseUrl || DEFAULT_REGION,
      defaultListId: projectIdToPersist,
      senderEmail: senderEmailToPersist,
      senderName: senderName?.trim() || null,
      isEnabled: isEnabled ?? existing?.isEnabled ?? true,
    },
    create: {
      teamId,
      provider: PrismaIntegrationProvider.SCALEWAY_TEM,
      apiKey: apiKeyToPersist,
      baseUrl: region?.trim() || DEFAULT_REGION,
      defaultListId: projectIdToPersist,
      senderEmail: senderEmailToPersist,
      senderName: senderName?.trim() || null,
      isEnabled: isEnabled ?? true,
    },
  });

  return {
    id: record.id,
    teamId: record.teamId,
    provider: IntegrationProvider.SCALEWAY_TEM,
    region: record.baseUrl ?? DEFAULT_REGION,
    projectId: record.defaultListId ?? undefined,
    senderEmail: record.senderEmail ?? undefined,
    senderName: record.senderName ?? undefined,
    isEnabled: record.isEnabled,
    lastSyncedAt: record.lastSyncedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    hasApiKey: Boolean(record.apiKey),
    apiKeyPreview: maskApiKey(record.apiKey),
    connectionVerified: true,
    connectionMessage: "Scaleway Transactional Email settings saved.",
  };
};

export const sendMassEmailToContacts = async ({
  teamId,
  contactIds,
  subject,
  html,
  userId,
  userName,
}: SendMassEmailInput): Promise<SendMassEmailResult> => {
  const uniqueContactIds = Array.from(new Set(contactIds));
  if (uniqueContactIds.length > MAX_RECIPIENTS) {
    throw new Error(`You can send to at most ${MAX_RECIPIENTS} contacts at once.`);
  }

  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.SCALEWAY_TEM,
      },
    },
  });

  if (!integration?.apiKey || !integration.defaultListId) {
    throw new Error("Scaleway Transactional Email is not configured.");
  }
  if (!integration.isEnabled) {
    throw new Error("Scaleway Transactional Email is disabled.");
  }

  const contacts = await prisma.contact.findMany({
    where: {
      teamId,
      id: { in: uniqueContactIds },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  const from = buildSender(integration);
  const region = integration.baseUrl || DEFAULT_REGION;
  const failures: SendMassEmailResult["failures"] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const contact of contacts) {
    const email = contact.email?.trim().toLowerCase();
    if (!email) {
      skipped += 1;
      failures.push({
        contactId: contact.id,
        message: "Contact has no email address.",
      });
      continue;
    }

    try {
      const scalewayEmail = await sendScalewayEmail({
        apiKey: integration.apiKey,
        region,
        projectId: integration.defaultListId,
        from,
        to: { email, name: contact.name },
        subject,
        html,
      });

      await prisma.contactEngagement.create({
        data: {
          contactId: contact.id,
          teamId,
          direction: EngagementDirection.OUTBOUND,
          source: EngagementSource.EMAIL,
          subject,
          message: html,
          userId,
          userName,
          externalId: scalewayEmail.id,
          externalSource: EXTERNAL_SOURCE,
          engagedAt: new Date(),
        },
      });

      sent += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Email delivery failed.";
      logger.error(
        { teamId, contactId: contact.id, email, error },
        "Scaleway mass email recipient failed",
      );
      failed += 1;
      failures.push({ contactId: contact.id, email, message });
    }
  }

  const missingContacts = uniqueContactIds.length - contacts.length;
  if (missingContacts > 0) {
    skipped += missingContacts;
  }

  return {
    requested: uniqueContactIds.length,
    sent,
    skipped,
    failed,
    failures: failures.slice(0, 10),
  };
};
