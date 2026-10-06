import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { loadModule } from "./helpers/load-module";

const encryptionSecret = "inbound-email-integration-test-key";
process.env.INBOUND_EMAIL_ENCRYPTION_KEY = encryptionSecret;

const encryptInboxPassword = (value: string) => {
  const key = crypto.createHash("sha256").update(encryptionSecret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
};

const inbox = (overrides: Record<string, unknown> = {}) => ({
  id: "inbox-a",
  teamId: "team-a",
  groupId: "group-a",
  name: "Support",
  host: "imap.example.org",
  port: 993,
  secure: true,
  username: "support@example.org",
  passwordEncrypted: encryptInboxPassword("password"),
  mailbox: "INBOX",
  allowedDomains: [],
  allowCreateContacts: false,
  autoApproveExistingVisible: true,
  requireReviewForHiddenMatches: true,
  isEnabled: true,
  uidValidity: BigInt(1),
  lastUid: BigInt(5),
  ...overrides,
});

type LoadOptions = {
  prisma: Record<string, unknown>;
  ImapFlow?: new (...args: never[]) => unknown;
  simpleParser?: (source: unknown) => Promise<unknown>;
  findContactByIdentityEmail?: () => Promise<unknown>;
  storeFileAtKey?: () => Promise<unknown>;
};

const loadInboundService = ({
  prisma,
  ImapFlow = class {},
  simpleParser = async () => ({}),
  findContactByIdentityEmail = async () => null,
  storeFileAtKey = async () => undefined,
}: LoadOptions) =>
  loadModule<{
    approveContactAccessReviewForInboundEmail: (input: {
      teamId: string;
      reviewId: string;
    }) => Promise<unknown>;
    replyToInboundEmail: (input: Record<string, unknown>) => Promise<unknown>;
    syncDueEmailInboxes: (
      workerId: string,
    ) => Promise<Array<Record<string, unknown>>>;
    syncEmailInbox: (
      inboxId: string,
      options?: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
  }>("src/services/inbound-email/index.ts", {
    "@/lib/email-timeouts": { getEmailConnectionTimeouts: () => ({}) },
    "@/lib/logger": {
      debug: () => undefined,
      error: () => undefined,
      info: () => undefined,
      warn: () => undefined,
    },
    "@/lib/prisma": prisma,
    "@/services/contact-change-logs": {
      logContactCreation: async () => undefined,
      logFieldUpdate: async () => undefined,
    },
    "@/services/contact-emails": {
      getPrimaryEmail: () => null,
      primaryContactEmailSelect: {},
    },
    "@/services/contacts": {
      findContactByIdentityEmail,
      getContactById: async () => null,
    },
    "@/services/email-delivery-errors": {
      EmailDeliveryUncertainError: class extends Error {},
    },
    "@/services/file/s3-service": {
      getStoredFile: async () => ({ body: Buffer.alloc(0) }),
      getStoredFileMetadata: async () => ({ sizeBytes: 1 }),
      storeFileAtKey,
    },
    "@/services/integrations/scaleway-email": {
      ScalewayEmailConfigurationError: class extends Error {},
      ScalewayEmailRejectedError: class extends Error {},
      sendScalewayTransactionalEmail: async () => ({ id: "provider-a" }),
    },
    "@/services/system-logs": {
      recordSystemLog: async () => undefined,
    },
    "@/types": { ContactEmailKind: { PRIMARY: "PRIMARY" } },
    "./authentication": {
      parseInboundAuthentication: () => ({
        status: "PASS",
        reason: "trusted-dmarc-pass",
      }),
    },
    "./attachments": {
      getInboundMessageByteLimit: () => 100 * 1024 * 1024,
      isEmailAttachmentBlocked: () => false,
      MAX_EMAIL_ATTACHMENT_BYTES: 10 * 1024 * 1024,
      MAX_EMAIL_ATTACHMENT_COUNT: 10,
      MAX_SMTP_MESSAGE_BYTES: 25 * 1024 * 1024,
      SAFE_INLINE_IMAGE_MIME_TYPES: new Set(),
      sanitizeAttachmentFileName: (value?: string) => value ?? "attachment",
      SCALEWAY_ATTACHMENT_MIME_TYPES: new Set(),
    },
    "./reply-helpers": {
      escapeEmailHtml: (value: string) => value,
      getStoredReferences: () => [],
      normalizeReplySubject: (value?: string) =>
        `Re: ${value ?? "Email reply"}`,
    },
    "@prisma/client": {
      ContactAccessReviewStatus: {
        PENDING: "PENDING",
        APPROVED: "APPROVED",
        REJECTED: "REJECTED",
        REVOKED: "REVOKED",
      },
      EmailAttachmentDirection: { INBOUND: "INBOUND", OUTBOUND: "OUTBOUND" },
      EmailAttachmentStatus: { AVAILABLE: "AVAILABLE", BLOCKED: "BLOCKED" },
      EmailInboxOutboundMode: {
        DISABLED: "DISABLED",
        SMTP: "SMTP",
        SCALEWAY: "SCALEWAY",
      },
      EmailReplyDispatchStatus: {
        PENDING: "PENDING",
        DISPATCHING: "DISPATCHING",
        SENT: "SENT",
        FAILED: "FAILED",
        UNKNOWN: "UNKNOWN",
      },
      EngagementDirection: { INBOUND: "INBOUND", OUTBOUND: "OUTBOUND" },
      EngagementSource: { EMAIL: "EMAIL" },
      InboundEmailAuthenticationStatus: {
        PASS: "PASS",
        FAIL: "FAIL",
        UNKNOWN: "UNKNOWN",
      },
      SystemLogLevel: { ERROR: "ERROR", WARN: "WARN" },
    },
    imapflow: { ImapFlow },
    mailparser: { simpleParser },
    nodemailer: { createTransport: () => ({}) },
    "sanitize-html": Object.assign((value: string) => value, {
      defaults: { allowedTags: [], allowedAttributes: {} },
      simpleTransform: () => () => undefined,
    }),
  });

test("IMAP sync imports an authenticated visible-contact message end to end", async () => {
  let releasedData: Record<string, unknown> | undefined;
  let engagementCreate: Record<string, unknown> | undefined;
  const source = Buffer.from("message");
  const parsed = {
    from: { value: [{ address: "sender@example.org", name: "Sender" }] },
    date: new Date("2026-10-05T10:00:00.000Z"),
    subject: "Question",
    text: "Hello",
    messageId: "<message@example.org>",
    headers: new Map<string, string>(),
    headerLines: [],
  };
  class MockImapFlow {
    mailbox = { uidValidity: BigInt(9), uidNext: BigInt(8) };
    async connect() {}
    async getMailboxLock() {
      return { release: () => undefined };
    }
    async *fetch() {
      yield { source, uid: 7, internalDate: parsed.date };
    }
    async logout() {}
  }
  const transaction = {
    inboundEmailMessage: {
      findUnique: async () => null,
      create: async () => ({ id: "inbound-a", engagementId: null }),
      update: async () => ({}),
    },
    contactEngagement: {
      upsert: async (args: { create: Record<string, unknown> }) => {
        engagementCreate = args.create;
        return { id: "engagement-a" };
      },
    },
  };
  const prisma = {
    emailInbox: {
      updateMany: async (args: { data: Record<string, unknown> }) => {
        if ("lastSyncedAt" in args.data) releasedData = args.data;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => inbox(),
    },
    group: {
      findFirst: async () => ({ canAccessAllContacts: false }),
    },
    $transaction: async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
  };
  const service = loadInboundService({
    prisma,
    ImapFlow: MockImapFlow,
    simpleParser: async () => parsed,
    findContactByIdentityEmail: async () => ({
      id: "contact-a",
      groupId: "group-a",
      groups: [],
    }),
  });

  const result = await service.syncEmailInbox("inbox-a", {
    workerId: "worker-a",
    teamId: "team-a",
  });

  assert.equal(result.imported, 1);
  assert.equal(result.lastUid, "7");
  assert.equal(releasedData?.uidValidity, BigInt(9));
  assert.equal(releasedData?.lastUid, BigInt(7));
  assert.deepEqual(engagementCreate, {
    contactId: "contact-a",
    teamId: "team-a",
    direction: "INBOUND",
    source: "EMAIL",
    subject: "Question",
    message: "Hello",
    externalId: "imap:inbox-a:9:7",
    externalSource: "IMAP",
    engagedAt: parsed.date,
  });
});

test("UIDVALIDITY changes clear a stale checkpoint even when the mailbox is empty", async () => {
  let releasedData: Record<string, unknown> | undefined;
  class MockImapFlow {
    mailbox = { uidValidity: BigInt(2), uidNext: BigInt(1) };
    async connect() {}
    async getMailboxLock() {
      return { release: () => undefined };
    }
    async *fetch() {}
    async logout() {}
  }
  const service = loadInboundService({
    ImapFlow: MockImapFlow,
    prisma: {
      emailInbox: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          if ("lastSyncedAt" in args.data) releasedData = args.data;
          return { count: 1 };
        },
        findUniqueOrThrow: async () => inbox({ lastUid: BigInt(500) }),
      },
    },
  });

  const result = await service.syncEmailInbox("inbox-a", {
    workerId: "worker-a",
    teamId: "team-a",
  });

  assert.equal(result.lastUid, undefined);
  assert.equal(releasedData?.uidValidity, BigInt(2));
  assert.equal(releasedData?.lastUid, null);
});

test("manual sync cannot claim an inbox from another team", async () => {
  let loaded = false;
  let claimWhere: unknown;
  const service = loadInboundService({
    prisma: {
      emailInbox: {
        updateMany: async (args: { where: unknown }) => {
          claimWhere = args.where;
          return { count: 0 };
        },
        findUniqueOrThrow: async () => {
          loaded = true;
          return inbox();
        },
      },
    },
  });

  const result = await service.syncEmailInbox("inbox-a", {
    workerId: "manual:team-b",
    teamId: "team-b",
  });

  assert.equal(result.skipped, true);
  assert.equal(loaded, false);
  const claim = claimWhere as {
    id: string;
    teamId: string;
    isEnabled: boolean;
    OR: [{ syncLockedAt: null }, { syncLockedAt: { lt: Date } }];
  };
  assert.equal(claim.id, "inbox-a");
  assert.equal(claim.teamId, "team-b");
  assert.equal(claim.isEnabled, true);
  assert.equal(claim.OR[0].syncLockedAt, null);
  assert.ok(claim.OR[1].syncLockedAt.lt instanceof Date);
});

test("access-review approval scopes the lookup to team, source, and pending state", async () => {
  let reviewWhere: unknown;
  let writes = 0;
  const transaction = {
    contactAccessReview: {
      findFirst: async (args: { where: unknown }) => {
        reviewWhere = args.where;
        return null;
      },
    },
    contactGroup: { createMany: async () => (writes += 1) },
  };
  const service = loadInboundService({
    prisma: {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    },
  });

  await assert.rejects(
    service.approveContactAccessReviewForInboundEmail({
      teamId: "team-a",
      reviewId: "review-from-team-b",
    }),
    /Pending contact access review not found/,
  );
  assert.deepEqual(reviewWhere, {
    id: "review-from-team-b",
    teamId: "team-a",
    source: "INBOUND_EMAIL",
    status: "PENDING",
  });
  assert.equal(writes, 0);
});

test("attachment storage failure leaves the IMAP checkpoint unchanged for retry", async () => {
  const releases: Record<string, unknown>[] = [];
  const source = Buffer.from("message with attachment");
  class MockImapFlow {
    mailbox = { uidValidity: BigInt(1), uidNext: BigInt(7) };
    async connect() {}
    async getMailboxLock() {
      return { release: () => undefined };
    }
    async *fetch() {
      yield { source, uid: 6 };
    }
    async logout() {}
  }
  const prisma = {
    emailInbox: {
      updateMany: async (args: { data: Record<string, unknown> }) => {
        if ("lastSyncError" in args.data) releases.push(args.data);
        return { count: 1 };
      },
      findUniqueOrThrow: async () => inbox(),
    },
    inboundEmailMessage: { findUnique: async () => null },
  };
  const service = loadInboundService({
    prisma,
    ImapFlow: MockImapFlow,
    simpleParser: async () => ({
      from: { value: [{ address: "sender@example.org" }] },
      text: "Hello",
      headers: new Map(),
      headerLines: [],
      attachments: [
        {
          filename: "invoice.pdf",
          contentType: "application/pdf",
          content: Buffer.from("pdf"),
          size: 3,
        },
      ],
    }),
    storeFileAtKey: async () => {
      throw new Error("object storage unavailable");
    },
  });

  await assert.rejects(
    service.syncEmailInbox("inbox-a", { workerId: "worker-a" }),
    /object storage unavailable/,
  );
  assert.equal(releases.length, 1);
  assert.equal(releases[0].lastUid, undefined);
  assert.match(String(releases[0].lastSyncError), /object storage unavailable/);
});
