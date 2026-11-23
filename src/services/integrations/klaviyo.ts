import {
  ConsentSource,
  ConsentStatus,
  KlaviyoConsentSyncStatus,
  Prisma,
  IntegrationProvider as PrismaIntegrationProvider,
} from "@prisma/client";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from "@/lib/integration-secrets";
import {
  fetchKlaviyoMetricEvents,
  fetchKlaviyoMetrics,
  fetchKlaviyoProfiles,
  findKlaviyoProfileIds,
  KLAVIYO_EMAIL_METRICS,
  KLAVIYO_LOOKUP_BATCH,
  KLAVIYO_SUBSCRIBE_BATCH,
  KLAVIYO_UNSUBSCRIBE_BATCH,
  type KlaviyoEmailMetric,
  type KlaviyoMetric,
  KlaviyoRequestError,
  maskKlaviyoApiKey,
  setKlaviyoProfileProperties,
  subscribeKlaviyoProfiles,
  testKlaviyoCredentials,
  unsubscribeKlaviyoProfiles,
} from "@/lib/klaviyo";
import {
  type ConsentPushCandidate,
  eventToEngagement,
  KLAVIYO_SOURCE_LABEL,
  klaviyoEventTime,
  normalizeKlaviyoEmail,
  planConsentPush,
  profileListLeftAt,
  profileMarketingWithdrawnAt,
  profileToIntake,
  WITHDRAWING_METRICS,
} from "@/lib/klaviyo-mapping";
import prisma from "@/lib/prisma";
import { proposeFieldChange } from "@/services/contact-change-logs";
import { isContactImportBlocked } from "@/services/contact-import-blocks";
import {
  comparableIntakeValue,
  resolveIntakeContact,
} from "@/services/contact-intake";
import { getLatestKlaviyoSyncJob } from "@/services/integrations/klaviyo-queue";
import {
  ContactEmailKind,
  EngagementSource,
  type IntegrationConnection,
  IntegrationProvider,
} from "@/types";

/*
  Klaviyo sync, run by the background worker (klaviyo-queue.ts). Rules and
  their reasons: docs/DATA_RULES.md, "Klaviyo".
*/

const EXTERNAL_SOURCE = "KLAVIYO";
const MARKETING = "marketing";
const INTAKE_SOURCE = {
  label: KLAVIYO_SOURCE_LABEL,
  metadata: { source: "klaviyo", createdVia: "klaviyo-import" },
};
/** Each sync re-reads this much before the last one, for late arrivals. */
const SYNC_OVERLAP_MS = 10 * 60 * 1000;
const DEFAULT_INITIAL_EVENT_DAYS = 90;
const MAX_CONSENT_PUSH_ATTEMPTS = 5;
const CONSENT_PUSH_LIMIT = 5000;
const MAX_REPORTED_ERRORS = 10;

export type KlaviyoIntegrationSettings = IntegrationConnection & {
  hasApiKey: boolean;
  apiKeyPreview?: string;
  connectionVerified?: boolean;
  connectionMessage?: string;
  lastSync?: {
    status: string;
    queuedAt: Date;
    finishedAt?: Date;
    error?: string;
    result?: unknown;
  };
};

export type KlaviyoSyncResult = {
  profilesRead: number;
  contactsCreated: number;
  contactsMatched: number;
  changesProposed: number;
  profilesSkipped: number;
  engagementsUpserted: number;
  eventsSkipped: number;
  consentsWithdrawn: number;
  /** Left the team's list in Klaviyo: proposed for review, not applied. */
  withdrawalsProposed: number;
  consentsSent: number;
  consentsSkipped: number;
  consentsFailed: number;
  consentsWaiting: string[];
  /** Permanently deleted in the CRM: marked and unsubscribed in Klaviyo. */
  deletionsMarked: number;
  /** Permanently deleted in the CRM, with no profile in Klaviyo. */
  deletionsNotInKlaviyo: number;
  failures: number;
  errors: string[];
  lastSyncedAt: Date;
};

const initialEventDays = () => {
  const days = Number(process.env.KLAVIYO_INITIAL_EVENT_DAYS);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_INITIAL_EVENT_DAYS;
};

type ContactLookup =
  | { kind: "found"; contactId: string }
  | { kind: "trashed" }
  | { kind: "blocked" }
  | { kind: "none" };

/** The contact an address identifies, including one in the trash. */
const lookUpContact = async (
  teamId: string,
  email: string,
): Promise<ContactLookup> => {
  const identity = await prisma.contactEmail.findFirst({
    where: {
      teamId,
      email,
      kind: { in: [ContactEmailKind.PRIMARY, ContactEmailKind.ALIAS] },
    },
    select: { contact: { select: { id: true, deletedAt: true } } },
  });
  if (identity?.contact.deletedAt) return { kind: "trashed" };
  if (identity) return { kind: "found", contactId: identity.contact.id };
  return (await isContactImportBlocked(teamId, email))
    ? { kind: "blocked" }
    : { kind: "none" };
};

type ProfileIntake = NonNullable<ReturnType<typeof profileToIntake>>;
type ProposableField = "name" | "phone" | "city";

/**
 * Drops values Klaviyo already proposed for this contact (pending or
 * declined), so a declined value is not proposed again on every sync.
 */
const withoutRepeatedProposals = async (
  contactId: string,
  intake: ProfileIntake,
): Promise<ProfileIntake> => {
  const earlier = await prisma.contactChangeLog.findMany({
    where: {
      contactId,
      action: "PROPOSED",
      fieldName: { in: ["name", "phone", "city"] },
      metadata: { path: ["source"], equals: "klaviyo" },
    },
    select: { fieldName: true, newValue: true },
  });
  if (!earlier.length) return intake;
  const result = { ...intake };
  for (const field of ["name", "phone", "city"] as ProposableField[]) {
    const value = result[field];
    if (!value) continue;
    const repeated = earlier.some((log) => {
      if (log.fieldName !== field || !log.newValue) return false;
      try {
        const proposed = JSON.parse(log.newValue);
        return (
          typeof proposed === "string" &&
          comparableIntakeValue(field, proposed) ===
            comparableIntakeValue(field, value)
        );
      } catch {
        return false;
      }
    });
    if (!repeated) continue;
    if (field === "name") result.name = "";
    else result[field] = undefined;
  }
  return result;
};

/**
 * Records that the person withdrew marketing consent in Klaviyo, unless the
 * CRM already says so or holds a later grant (consented again since).
 */
const recordKlaviyoWithdrawal = async (
  teamId: string,
  contactId: string,
  at: Date,
) => {
  const latest = await prisma.contactConsent.findFirst({
    where: {
      teamId,
      contactId,
      purpose: MARKETING,
      status: { in: [ConsentStatus.GRANTED, ConsentStatus.WITHDRAWN] },
    },
    orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
    select: { status: true, recordedAt: true },
  });
  if (latest?.status === ConsentStatus.WITHDRAWN) return false;
  if (latest && latest.recordedAt >= at) return false;
  await prisma.contactConsent.create({
    data: {
      teamId,
      contactId,
      purpose: MARKETING,
      status: ConsentStatus.WITHDRAWN,
      source: ConsentSource.EXTERNAL,
      recordedBy: KLAVIYO_SOURCE_LABEL,
      recordedAt: at,
    },
  });
  return true;
};

/**
 * The person left the team's list in Klaviyo (not all marketing). Proposed
 * for a person to decide, once per time Klaviyo reports, and only while the
 * CRM holds a grant older than that.
 */
const proposeListLeave = async (
  teamId: string,
  contactId: string,
  at: Date,
  listId: string,
) => {
  const latest = await prisma.contactConsent.findFirst({
    where: {
      teamId,
      contactId,
      purpose: MARKETING,
      status: { in: [ConsentStatus.GRANTED, ConsentStatus.WITHDRAWN] },
    },
    orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
    select: { status: true, recordedAt: true },
  });
  if (latest?.status !== ConsentStatus.GRANTED || latest.recordedAt >= at) {
    return false;
  }
  const already = await prisma.contactChangeLog.findFirst({
    where: {
      contactId,
      action: "PROPOSED",
      fieldName: "marketingConsent",
      AND: [
        { metadata: { path: ["source"], equals: "klaviyo" } },
        { metadata: { path: ["at"], equals: at.toISOString() } },
      ],
    },
    select: { id: true },
  });
  if (already) return false;
  await prisma.$transaction((tx) =>
    proposeFieldChange(tx, {
      contactId,
      fieldName: "marketingConsent",
      oldValue: ConsentStatus.GRANTED,
      newValue: ConsentStatus.WITHDRAWN,
      userName: KLAVIYO_SOURCE_LABEL,
      metadata: {
        source: "klaviyo",
        reason: "left-list",
        listId,
        at: at.toISOString(),
      },
    }),
  );
  return true;
};

/**
 * Errors about one record's data (too long, taken meanwhile, gone
 * meanwhile): that record is skipped and reported. Anything else (the
 * database unreachable, a timeout) fails the sync, which is retried.
 */
const RECORD_ERROR_CODES = new Set([
  "P2000",
  "P2002",
  "P2003",
  "P2011",
  "P2025",
]);
const isRecordError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  RECORD_ERROR_CODES.has(error.code);

const newResult = (now: Date): KlaviyoSyncResult => ({
  profilesRead: 0,
  contactsCreated: 0,
  contactsMatched: 0,
  changesProposed: 0,
  profilesSkipped: 0,
  engagementsUpserted: 0,
  eventsSkipped: 0,
  consentsWithdrawn: 0,
  withdrawalsProposed: 0,
  consentsSent: 0,
  consentsSkipped: 0,
  consentsFailed: 0,
  consentsWaiting: [],
  deletionsMarked: 0,
  deletionsNotInKlaviyo: 0,
  failures: 0,
  errors: [],
  lastSyncedAt: now,
});

const recordFailure = (
  result: KlaviyoSyncResult,
  what: string,
  error: unknown,
) => {
  if (!isRecordError(error)) throw error;
  result.failures += 1;
  if (result.errors.length < MAX_REPORTED_ERRORS) {
    result.errors.push(
      `${what}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const importProfiles = async (
  teamId: string,
  apiKey: string,
  updatedAfter: Date | undefined,
  listId: string | null,
  result: KlaviyoSyncResult,
) => {
  let cursor: string | undefined;
  do {
    const page = await fetchKlaviyoProfiles(apiKey, { cursor, updatedAfter });
    for (const profile of page.profiles) {
      result.profilesRead += 1;
      const intake = profileToIntake(profile);
      if (!intake) {
        result.profilesSkipped += 1;
        continue;
      }
      try {
        const lookup = await lookUpContact(teamId, intake.email);
        // The trash and permanent deletion are decisions of the team; an
        // import must not undo them.
        if (lookup.kind === "trashed" || lookup.kind === "blocked") {
          result.profilesSkipped += 1;
          continue;
        }
        const input =
          lookup.kind === "found"
            ? await withoutRepeatedProposals(lookup.contactId, intake)
            : intake;
        const resolved = await prisma.$transaction((tx) =>
          resolveIntakeContact(tx, { teamId, ...input }, INTAKE_SOURCE),
        );
        if (resolved.created) result.contactsCreated += 1;
        else result.contactsMatched += 1;
        result.changesProposed += resolved.proposedChanges;

        const withdrawnAt = profileMarketingWithdrawnAt(profile);
        if (
          withdrawnAt &&
          (await recordKlaviyoWithdrawal(
            teamId,
            resolved.contact.id,
            withdrawnAt,
          ))
        ) {
          result.consentsWithdrawn += 1;
        }
        const leftAt =
          !withdrawnAt && listId ? profileListLeftAt(profile, listId) : null;
        if (
          leftAt &&
          listId &&
          (await proposeListLeave(teamId, resolved.contact.id, leftAt, listId))
        ) {
          result.withdrawalsProposed += 1;
        }
      } catch (error) {
        recordFailure(result, `Profile ${profile.id}`, error);
      }
    }
    cursor = page.nextCursor;
  } while (cursor);
};

/** The account's built-in e-mail metrics, by name. */
const findEmailMetrics = (metrics: KlaviyoMetric[]) => {
  const byName = new Map<KlaviyoEmailMetric, string>();
  for (const name of KLAVIYO_EMAIL_METRICS) {
    const candidates = metrics.filter(
      (metric) => metric.attributes?.name === name,
    );
    const builtIn =
      candidates.find(
        (metric) => metric.attributes?.integration?.name === "Klaviyo",
      ) ?? candidates[0];
    if (builtIn) byName.set(name, builtIn.id);
  }
  return byName;
};

const importEmailEvents = async (
  teamId: string,
  apiKey: string,
  since: Date,
  result: KlaviyoSyncResult,
) => {
  const metrics = findEmailMetrics(await fetchKlaviyoMetrics(apiKey));
  const contactByEmail = new Map<string, string | null>();
  const contactFor = async (email: string) => {
    if (!contactByEmail.has(email)) {
      const lookup = await lookUpContact(teamId, email);
      contactByEmail.set(
        email,
        lookup.kind === "found" ? lookup.contactId : null,
      );
    }
    return contactByEmail.get(email) ?? null;
  };

  for (const [metric, metricId] of metrics) {
    let cursor: string | undefined;
    do {
      const page = await fetchKlaviyoMetricEvents(apiKey, {
        metricId,
        since,
        cursor,
      });
      for (const event of page.events) {
        try {
          const profileId = event.relationships?.profile?.data?.id;
          const email = normalizeKlaviyoEmail(
            profileId ? page.profileEmails.get(profileId) : undefined,
          );
          // Events only attach to contacts that exist: profiles were
          // imported first, and a contact in the trash or deleted stays so.
          const contactId = email ? await contactFor(email) : null;
          const draft =
            contactId && profileId
              ? eventToEngagement(metric, event, profileId, email)
              : null;
          if (!contactId || !draft) {
            result.eventsSkipped += 1;
            continue;
          }
          const fields = {
            direction: draft.direction,
            source: EngagementSource.EMAIL,
            subject: draft.subject.slice(0, 500),
            message: draft.message,
            engagedAt: draft.engagedAt,
          };
          await prisma.contactEngagement.upsert({
            where: {
              teamId_externalId_externalSource: {
                teamId,
                externalId: draft.externalId,
                externalSource: EXTERNAL_SOURCE,
              },
            },
            create: {
              ...fields,
              teamId,
              contactId,
              externalId: draft.externalId,
              externalSource: EXTERNAL_SOURCE,
            },
            update: draft.firstOnly ? {} : fields,
          });
          result.engagementsUpserted += 1;

          const at = klaviyoEventTime(event);
          if (
            WITHDRAWING_METRICS.has(metric) &&
            at &&
            (await recordKlaviyoWithdrawal(teamId, contactId, at))
          ) {
            result.consentsWithdrawn += 1;
          }
        } catch (error) {
          recordFailure(result, `Event ${event.id}`, error);
        }
      }
      cursor = page.nextCursor;
    } while (cursor);
  }
};

const markConsentSync = (
  teamId: string,
  consentId: string,
  status: KlaviyoConsentSyncStatus,
  detail?: string,
) =>
  prisma.klaviyoConsentSync.upsert({
    where: { consentId },
    create: { consentId, teamId, status, detail },
    update: { status, detail: detail ?? null, attempts: { increment: 1 } },
  });

const isRequestRejected = (error: unknown) =>
  error instanceof KlaviyoRequestError &&
  error.status >= 400 &&
  error.status < 500 &&
  error.status !== 429;

/**
 * Sends batches; when Klaviyo rejects a whole batch, sends its entries one
 * by one so a single bad address does not hold back the rest.
 */
const sendInBatches = async <T extends { consentId: string }>(
  teamId: string,
  entries: T[],
  batchSize: number,
  send: (batch: T[]) => Promise<void>,
  result: KlaviyoSyncResult,
) => {
  for (let index = 0; index < entries.length; index += batchSize) {
    const batch = entries.slice(index, index + batchSize);
    try {
      await send(batch);
      for (const entry of batch) {
        await markConsentSync(teamId, entry.consentId, "SENT");
      }
      result.consentsSent += batch.length;
    } catch (error) {
      // Klaviyo unreachable or failing: the whole sync fails and is retried.
      if (!isRequestRejected(error)) throw error;
      if (batch.length > 1) {
        await sendInBatches(teamId, batch, 1, send, result);
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      await markConsentSync(teamId, batch[0].consentId, "FAILED", message);
      result.consentsFailed += 1;
    }
  }
};

/**
 * The outbox: every marketing grant or withdrawal not yet sent (or failed
 * fewer than five times) goes to Klaviyo. Only the row that holds now for
 * its contact is sent; older ones are marked skipped.
 */
const pushConsents = async (
  teamId: string,
  apiKey: string,
  listId: string | null,
  result: KlaviyoSyncResult,
) => {
  const candidates = (await prisma.contactConsent.findMany({
    where: {
      teamId,
      purpose: MARKETING,
      // Without a list grants cannot be sent; withdrawals still can.
      status: listId
        ? { in: [ConsentStatus.GRANTED, ConsentStatus.WITHDRAWN] }
        : ConsentStatus.WITHDRAWN,
      OR: [
        { klaviyoSync: null },
        {
          klaviyoSync: {
            status: KlaviyoConsentSyncStatus.FAILED,
            attempts: { lt: MAX_CONSENT_PUSH_ATTEMPTS },
          },
        },
      ],
    },
    orderBy: { recordedAt: "asc" },
    take: CONSENT_PUSH_LIMIT,
    select: {
      id: true,
      contactId: true,
      status: true,
      source: true,
      recordedBy: true,
      recordedAt: true,
    },
  })) as ConsentPushCandidate[];
  if (!listId) {
    const waiting = await prisma.contactConsent.count({
      where: {
        teamId,
        purpose: MARKETING,
        status: ConsentStatus.GRANTED,
        klaviyoSync: null,
      },
    });
    if (waiting) {
      result.consentsWaiting.push(
        `${waiting} marketing consents wait for a Klaviyo list to be set.`,
      );
    }
  }
  if (!candidates.length) return;

  const contactIds = [...new Set(candidates.map((row) => row.contactId))];
  const [latestRows, contacts] = await Promise.all([
    prisma.contactConsent.findMany({
      where: {
        teamId,
        purpose: MARKETING,
        contactId: { in: contactIds },
        status: { in: [ConsentStatus.GRANTED, ConsentStatus.WITHDRAWN] },
      },
      orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, contactId: true },
    }),
    prisma.contact.findMany({
      where: { teamId, id: { in: contactIds } },
      select: {
        id: true,
        deletedAt: true,
        emails: {
          where: { kind: ContactEmailKind.PRIMARY },
          select: { email: true },
        },
      },
    }),
  ]);
  const latestByContact = new Map<string, string>();
  for (const row of latestRows) {
    if (!latestByContact.has(row.contactId)) {
      latestByContact.set(row.contactId, row.id);
    }
  }
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));

  const subscribes: Array<{
    consentId: string;
    email: string;
    consentedAt: Date;
  }> = [];
  const unsubscribes: Array<{ consentId: string; email: string }> = [];
  let trashedWaiting = 0;
  for (const candidate of candidates) {
    const contact = contactById.get(candidate.contactId);
    const action = planConsentPush(candidate, {
      latestConsentId: latestByContact.get(candidate.contactId),
      email: contact?.emails[0]?.email ?? null,
      contactInTrash: Boolean(contact?.deletedAt),
      listId,
    });
    if (action.kind === "subscribe") {
      subscribes.push({ consentId: candidate.id, ...action });
    } else if (action.kind === "unsubscribe") {
      unsubscribes.push({ consentId: candidate.id, email: action.email });
    } else if (action.kind === "skip") {
      await markConsentSync(teamId, candidate.id, "SKIPPED", action.reason);
      result.consentsSkipped += 1;
    } else {
      trashedWaiting += 1;
    }
  }
  if (trashedWaiting) {
    result.consentsWaiting.push(
      `${trashedWaiting} marketing consents of contacts in the trash wait until they are restored.`,
    );
  }

  if (listId) {
    await sendInBatches(
      teamId,
      subscribes,
      KLAVIYO_SUBSCRIBE_BATCH,
      (batch) => subscribeKlaviyoProfiles(apiKey, listId, batch),
      result,
    );
  }
  await sendInBatches(
    teamId,
    unsubscribes,
    KLAVIYO_UNSUBSCRIBE_BATCH,
    (batch) =>
      unsubscribeKlaviyoProfiles(
        apiKey,
        batch.map(({ email }) => email),
      ),
    result,
  );
};

const MAX_DELETION_ATTEMPTS = 5;
/** The custom profile property Klaviyo users can build a segment on. */
export const KLAVIYO_DELETED_PROPERTY = "crm_deleted_at";

/**
 * People permanently deleted in the CRM: their Klaviyo profile gets
 * `crm_deleted_at` and is unsubscribed from e-mail marketing, so the team can
 * find and delete them in Klaviyo and no newsletter reaches them meanwhile.
 * An address Klaviyo does not know is left alone (an unsubscribe would create
 * a profile). Each queued address is removed once handled, or after five
 * refused attempts, so it is not kept longer than needed.
 */
const markDeletedProfiles = async (
  teamId: string,
  apiKey: string,
  result: KlaviyoSyncResult,
) => {
  const queued = await prisma.klaviyoProfileDeletion.findMany({
    where: { teamId },
    orderBy: { deletedAt: "asc" },
    take: 1000,
  });
  for (let index = 0; index < queued.length; index += KLAVIYO_LOOKUP_BATCH) {
    const batch = queued.slice(index, index + KLAVIYO_LOOKUP_BATCH);
    const emails = [...new Set(batch.map((row) => row.email))];
    try {
      const profileIds = await findKlaviyoProfileIds(apiKey, emails);
      for (const row of batch) {
        const profileId = profileIds.get(row.email);
        if (!profileId) continue;
        await setKlaviyoProfileProperties(apiKey, profileId, {
          [KLAVIYO_DELETED_PROPERTY]: row.deletedAt.toISOString(),
        });
      }
      const found = emails.filter((email) => profileIds.has(email));
      for (
        let start = 0;
        start < found.length;
        start += KLAVIYO_UNSUBSCRIBE_BATCH
      ) {
        await unsubscribeKlaviyoProfiles(
          apiKey,
          found.slice(start, start + KLAVIYO_UNSUBSCRIBE_BATCH),
        );
      }
      result.deletionsMarked += batch.filter((row) =>
        profileIds.has(row.email),
      ).length;
      result.deletionsNotInKlaviyo += batch.filter(
        (row) => !profileIds.has(row.email),
      ).length;
      await prisma.klaviyoProfileDeletion.deleteMany({
        where: { id: { in: batch.map((row) => row.id) } },
      });
    } catch (error) {
      // Klaviyo unreachable or failing: the sync fails and is retried.
      if (!isRequestRejected(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      for (const row of batch) {
        if (row.attempts + 1 >= MAX_DELETION_ATTEMPTS) {
          await prisma.klaviyoProfileDeletion.delete({ where: { id: row.id } });
          result.failures += 1;
          if (result.errors.length < MAX_REPORTED_ERRORS) {
            result.errors.push(
              `A deleted contact could not be marked in Klaviyo: ${message}`,
            );
          }
        } else {
          await prisma.klaviyoProfileDeletion.update({
            where: { id: row.id },
            data: { attempts: { increment: 1 }, lastError: message },
          });
        }
      }
    }
  }
};

const findIntegration = (teamId: string) =>
  prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: { teamId, provider: PrismaIntegrationProvider.KLAVIYO },
    },
  });

/**
 * One sync: profiles changed since the last sync (all, the first time), the
 * e-mail events since then (the last KLAVIYO_INITIAL_EVENT_DAYS days, the
 * first time), then the consent outbox. A Klaviyo API failure throws, so the
 * worker retries the whole sync; a single profile or event that cannot be
 * saved is counted and reported instead.
 */
export const syncKlaviyoIntegration = async (
  teamId: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<KlaviyoSyncResult> => {
  const integration = await findIntegration(teamId);
  if (!integration?.apiKey) {
    throw new Error("Klaviyo integration is not configured for this team.");
  }
  if (!integration.isEnabled) {
    throw new Error("Klaviyo integration is currently disabled.");
  }
  const apiKey = decryptIntegrationSecret(integration.apiKey);
  const result = newResult(now);
  const watermark = integration.lastSyncedAt
    ? new Date(integration.lastSyncedAt.getTime() - SYNC_OVERLAP_MS)
    : undefined;

  await markDeletedProfiles(teamId, apiKey, result);
  await importProfiles(
    teamId,
    apiKey,
    watermark,
    integration.defaultListId,
    result,
  );
  await importEmailEvents(
    teamId,
    apiKey,
    watermark ??
      new Date(now.getTime() - initialEventDays() * 24 * 60 * 60 * 1000),
    result,
  );
  await pushConsents(teamId, apiKey, integration.defaultListId, result);

  await prisma.integrationConnection.update({
    where: { id: integration.id },
    data: { lastSyncedAt: now },
  });
  return result;
};

const toSettings = async (
  record: NonNullable<Awaited<ReturnType<typeof findIntegration>>>,
  extra: { connectionVerified?: boolean; connectionMessage?: string } = {},
): Promise<KlaviyoIntegrationSettings> => {
  const job = await getLatestKlaviyoSyncJob(record.teamId);
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
    apiKeyPreview: maskKlaviyoApiKey(decryptIntegrationSecret(record.apiKey)),
    // Known only from a test or a sync; a saved key alone proves nothing.
    connectionVerified:
      extra.connectionVerified ??
      (job?.status === "SUCCEEDED" ? true : undefined),
    connectionMessage: extra.connectionMessage,
    lastSync: job
      ? {
          status: job.status,
          queuedAt: job.createdAt,
          finishedAt: job.finishedAt ?? undefined,
          error: job.lastError ?? undefined,
          result: job.result ?? undefined,
        }
      : undefined,
  };
};

export const getKlaviyoIntegration = async (
  teamId: string,
): Promise<KlaviyoIntegrationSettings | null> => {
  const integration = await findIntegration(teamId);
  return integration ? await toSettings(integration) : null;
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
  /** Empty clears the list; undefined keeps it. */
  defaultListId?: string;
  isEnabled?: boolean;
  shouldTestConnection?: boolean;
}): Promise<KlaviyoIntegrationSettings> => {
  const existing = await findIntegration(teamId);
  const plaintextApiKey =
    apiKey?.trim() ||
    (existing?.apiKey ? decryptIntegrationSecret(existing.apiKey) : undefined);
  if (!plaintextApiKey) {
    throw new Error("API key is required to configure Klaviyo integration.");
  }
  if (shouldTestConnection) {
    await testKlaviyoCredentials(plaintextApiKey);
  }
  const apiKeyToPersist = encryptIntegrationSecret(plaintextApiKey);
  const listId =
    defaultListId === undefined ? undefined : defaultListId.trim() || null;

  const record = await prisma.integrationConnection.upsert({
    where: {
      teamId_provider: { teamId, provider: PrismaIntegrationProvider.KLAVIYO },
    },
    update: {
      apiKey: apiKeyToPersist,
      ...(listId === undefined ? {} : { defaultListId: listId }),
      isEnabled: isEnabled ?? existing?.isEnabled ?? true,
    },
    create: {
      teamId,
      provider: PrismaIntegrationProvider.KLAVIYO,
      apiKey: apiKeyToPersist,
      defaultListId: listId ?? null,
      isEnabled: isEnabled ?? true,
    },
  });

  return await toSettings(
    record,
    shouldTestConnection
      ? { connectionVerified: true, connectionMessage: "Connection successful" }
      : {},
  );
};

/**
 * Disconnects Klaviyo: removes the key, the queued syncs and the record of
 * what was sent, so connecting an account again sends every consent anew.
 * Imported contacts, engagements and consents stay.
 */
export const deleteKlaviyoIntegration = async (teamId: string) => {
  await prisma.$transaction([
    prisma.klaviyoSyncJob.deleteMany({ where: { teamId } }),
    prisma.klaviyoConsentSync.deleteMany({ where: { teamId } }),
    // Addresses waiting to be marked in Klaviyo are not kept without it.
    prisma.klaviyoProfileDeletion.deleteMany({ where: { teamId } }),
    prisma.integrationConnection.deleteMany({
      where: { teamId, provider: PrismaIntegrationProvider.KLAVIYO },
    }),
  ]);
};
