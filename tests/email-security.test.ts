import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";

const emailTypes = {
  EmailBatchStatus: {
    SENDING: "SENDING",
    SENT: "SENT",
    PARTIAL: "PARTIAL",
    FAILED: "FAILED",
  },
  EmailRecipientStatus: {
    PENDING: "PENDING",
    DISPATCHING: "DISPATCHING",
    SENT: "SENT",
    SKIPPED: "SKIPPED",
    FAILED: "FAILED",
    DELIVERED: "DELIVERED",
    BOUNCED: "BOUNCED",
    UNKNOWN: "UNKNOWN",
  },
  EngagementDirection: { OUTBOUND: "OUTBOUND" },
  EngagementSource: { EMAIL: "EMAIL" },
  IntegrationProvider: { SCALEWAY_TEM: "SCALEWAY_TEM" },
};

test("bulk email rejects direct contact IDs outside the sender's visibility", async () => {
  let batchWrites = 0;
  let visibilityWhere: unknown;
  const service = loadModule<{
    sendMassEmailToContacts: (input: {
      teamId: string;
      contactIds: string[];
      subject: string;
      html: string;
      bccEmails?: string[];
      userId: string;
    }) => Promise<unknown>;
  }>("src/services/integrations/scaleway-email.ts", {
    "@/constants/email": {
      DEFAULT_INTERNAL_COPY_MODE: "summary",
      INTERNAL_COPY_MODE_LABELS: { summary: "Summary only" },
    },
    "@/lib/logger": {
      error: () => undefined,
      info: () => undefined,
      warn: () => undefined,
    },
    "@/lib/prisma": {
      eventRegistration: { findMany: async () => [] },
      contact: {
        findMany: async (args: { where: unknown }) => {
          visibilityWhere = args.where;
          return [{ id: "visible", name: "Visible", emails: [] }];
        },
      },
      emailBatch: {
        create: async () => {
          batchWrites += 1;
          return { id: "batch" };
        },
      },
    },
    "@/services/contact-emails": {
      getPrimaryEmail: () => null,
      primaryContactEmailSelect: {},
    },
    "@/services/contacts/access": {
      getContactVisibility: async () => ({
        where: { teamId: "team-a", groups: { some: { groupId: "group-a" } } },
        userGroupIds: ["group-a"],
      }),
    },
    "@/services/teams/access": {
      getTeamAdminAccess: async () => ({ allowed: false }),
    },
    "@/types": emailTypes,
    "./scaleway-email-verification": {
      verifyScalewaySenderConfiguration: async () => ({
        domain: "example.org",
        status: "checked",
      }),
    },
  });

  await assert.rejects(
    service.sendMassEmailToContacts({
      teamId: "team-a",
      contactIds: ["visible", "hidden"],
      subject: "Update",
      html: "<p>Hello</p>",
      userId: "actor",
    }),
    /selected recipients are unavailable/,
  );
  assert.deepEqual(visibilityWhere, {
    AND: [
      { teamId: "team-a", groups: { some: { groupId: "group-a" } } },
      { id: { in: ["visible", "hidden"] } },
    ],
  });
  assert.equal(batchWrites, 0);
});

test("bulk email restricts internal recipient reports to team administrators", async () => {
  let recipientReads = 0;
  const service = loadModule<{
    sendMassEmailToContacts: (input: {
      teamId: string;
      contactIds: string[];
      subject: string;
      html: string;
      bccEmails: string[];
      userId: string;
    }) => Promise<unknown>;
  }>("src/services/integrations/scaleway-email.ts", {
    "@/constants/email": {
      DEFAULT_INTERNAL_COPY_MODE: "summary",
      INTERNAL_COPY_MODE_LABELS: { summary: "Summary only" },
    },
    "@/lib/logger": {},
    "@/lib/prisma": {
      eventRegistration: {
        findMany: async () => {
          recipientReads += 1;
          return [];
        },
      },
    },
    "@/services/contact-emails": {
      getPrimaryEmail: () => null,
      primaryContactEmailSelect: {},
    },
    "@/services/contacts/access": {
      getContactVisibility: async () => ({ where: {}, userGroupIds: [] }),
    },
    "@/services/teams/access": {
      getTeamAdminAccess: async () => ({ allowed: false }),
    },
    "@/types": emailTypes,
    "./scaleway-email-verification": {
      verifyScalewaySenderConfiguration: async () => ({
        domain: "example.org",
        status: "checked",
      }),
    },
  });

  await assert.rejects(
    service.sendMassEmailToContacts({
      teamId: "team-a",
      contactIds: ["contact-a"],
      subject: "Update",
      html: "<p>Hello</p>",
      bccEmails: ["external@example.org"],
      userId: "actor",
    }),
    /Only team administrators/,
  );
  assert.equal(recipientReads, 0);
});

test("bulk email publishes its batch and complete recipient set atomically", async () => {
  const writes: string[] = [];
  let recipientData: Array<Record<string, unknown>> = [];
  let internalCopyData: Array<Record<string, unknown>> = [];
  const transactionClient = {
    emailBatch: {
      create: async () => {
        writes.push("batch");
        return { id: "batch-a" };
      },
    },
    emailRecipient: {
      createMany: async (args: { data: Array<Record<string, unknown>> }) => {
        writes.push("recipients");
        recipientData = args.data;
        return { count: args.data.length };
      },
    },
    emailInternalCopyRecipient: {
      createMany: async (args: { data: Array<Record<string, unknown>> }) => {
        writes.push("internal-copies");
        internalCopyData = args.data;
        return { count: args.data.length };
      },
    },
  };
  const service = loadModule<{
    sendMassEmailToContacts: (input: {
      teamId: string;
      contactIds: string[];
      subject: string;
      html: string;
      bccEmails?: string[];
      userId: string;
    }) => Promise<{ batchId: string; requested: number }>;
  }>("src/services/integrations/scaleway-email.ts", {
    "@/constants/email": {
      DEFAULT_INTERNAL_COPY_MODE: "summary",
      INTERNAL_COPY_MODE_LABELS: { summary: "Summary only" },
    },
    "@/lib/logger": {},
    "@/lib/prisma": {
      eventRegistration: { findMany: async () => [] },
      contact: {
        findMany: async () => [
          {
            id: "contact-a",
            name: "Ada",
            emails: [{ email: "ada@example.org" }],
          },
          {
            id: "contact-b",
            name: "Blocked",
            emails: [{ email: "blocked@example.org" }],
          },
        ],
      },
      integrationConnection: {
        findUnique: async () => ({
          apiKey: "secret",
          defaultListId: "project",
          senderEmail: "crm@example.org",
          senderName: "CRM",
          isEnabled: true,
        }),
      },
      emailSuppression: {
        findMany: async () => [
          { email: "blocked@example.org", reason: "HARD_BOUNCE" },
        ],
      },
      $transaction: async (
        callback: (tx: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    },
    "@/services/contact-emails": {
      getPrimaryEmail: (contact: { emails: Array<{ email: string }> }) =>
        contact.emails[0]?.email ?? null,
      primaryContactEmailSelect: {},
    },
    "@/services/contacts/access": {
      getContactVisibility: async () => ({
        where: { teamId: "team-a" },
        userGroupIds: [],
      }),
    },
    "@/services/teams/access": {
      getTeamAdminAccess: async () => ({ allowed: true }),
    },
    "@/types": emailTypes,
    "./scaleway-email-verification": {
      verifyScalewaySenderConfiguration: async () => ({
        domain: "example.org",
        status: "checked",
      }),
    },
  });

  const result = await service.sendMassEmailToContacts({
    teamId: "team-a",
    contactIds: ["contact-a", "contact-b"],
    subject: "Update",
    html: "<p>Hello</p>",
    bccEmails: ["audit@example.org"],
    userId: "actor",
  });

  assert.deepEqual(writes, ["batch", "recipients", "internal-copies"]);
  assert.deepEqual(recipientData, [
    {
      batchId: "batch-a",
      contactId: "contact-a",
      email: "ada@example.org",
      name: "Ada",
      status: "PENDING",
    },
    {
      batchId: "batch-a",
      contactId: "contact-b",
      email: "blocked@example.org",
      name: "Blocked",
      status: "SKIPPED",
      errorMessage: "Email is suppressed (HARD_BOUNCE).",
    },
  ]);
  assert.deepEqual(internalCopyData, [
    { batchId: "batch-a", email: "audit@example.org" },
  ]);
  assert.deepEqual(result, {
    batchId: "batch-a",
    requested: 2,
    sent: 0,
    skipped: 1,
    failed: 0,
    failures: [
      {
        contactId: "contact-b",
        email: "blocked@example.org",
        message: "Email is suppressed (HARD_BOUNCE).",
      },
    ],
  });
});

test("email history is scoped to the sender unless the viewer is an admin", async () => {
  const whereClauses: unknown[] = [];
  let isAdmin = false;
  const service = loadModule<{
    getEmailHistoryBatches: (
      teamId: string,
      access: { userId: string },
    ) => Promise<unknown[]>;
  }>("src/services/emails/index.ts", {
    "@/lib/prisma": {
      emailBatch: {
        findMany: async (args: { where: unknown }) => {
          whereClauses.push(args.where);
          return [];
        },
      },
    },
    "@/services/contact-emails": {
      getPrimaryEmail: () => null,
      primaryContactEmailSelect: {},
    },
    "@/services/teams/access": {
      getTeamAdminAccess: async () => ({ allowed: isAdmin }),
    },
  });

  await service.getEmailHistoryBatches("team-a", { userId: "actor" });
  isAdmin = true;
  await service.getEmailHistoryBatches("team-a", { userId: "admin" });

  assert.deepEqual(whereClauses, [
    { teamId: "team-a", userId: "actor" },
    { teamId: "team-a" },
  ]);
});

test("email retry hides batches created by other non-admin users", async () => {
  let batchWhere: unknown;
  const transactionClient = {
    emailBatch: {
      findFirst: async (args: { where: unknown }) => {
        batchWhere = args.where;
        return null;
      },
    },
  };
  const service = loadModule<{
    retryEmailBatch: (
      teamId: string,
      batchId: string,
      access: { userId: string },
    ) => Promise<unknown>;
  }>("src/services/emails/index.ts", {
    "@/lib/prisma": {
      $transaction: async (
        callback: (tx: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    },
    "@/services/contact-emails": {
      getPrimaryEmail: () => null,
      primaryContactEmailSelect: {},
    },
    "@/services/teams/access": {
      getTeamAdminAccess: async () => ({ allowed: false }),
    },
  });

  await assert.rejects(
    service.retryEmailBatch("team-a", "batch-a", { userId: "actor" }),
    /Email batch not found/,
  );
  assert.deepEqual(batchWhere, {
    id: "batch-a",
    teamId: "team-a",
    userId: "actor",
  });
});

test("bulk email does not resend after provider acceptance if persistence fails", async () => {
  let recipientStatus = "PENDING";
  let providerCalls = 0;
  let transactionCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response(JSON.stringify({ emails: [{ id: "provider-a" }] }), {
      status: 200,
    });
  };

  const service = loadModule<{
    processEmailBatch: (batch: Record<string, unknown>) => Promise<{
      failed: number;
    }>;
  }>("src/services/integrations/scaleway-email.ts", {
    "@/constants/email": {
      DEFAULT_INTERNAL_COPY_MODE: "summary",
      INTERNAL_COPY_MODE_LABELS: { summary: "Summary only" },
    },
    "@/lib/logger": {
      error: () => undefined,
      info: () => undefined,
      warn: () => undefined,
    },
    "@/lib/prisma": {
      integrationConnection: {
        findUnique: async () => ({
          apiKey: "secret",
          defaultListId: "project",
          senderEmail: "crm@example.org",
          senderName: "CRM",
          isEnabled: true,
        }),
      },
      emailRecipient: {
        updateMany: async (args: {
          where: { status: string };
          data: { status: string };
        }) => {
          if (args.where.status !== recipientStatus) return { count: 0 };
          recipientStatus = args.data.status;
          return { count: 1 };
        },
        findMany: async () =>
          recipientStatus === "PENDING"
            ? [
                {
                  id: "recipient-a",
                  contactId: "contact-a",
                  email: "ada@example.org",
                  name: "Ada",
                  contact: {
                    name: "Ada",
                    emails: [{ email: "ada@example.org" }],
                    city: null,
                    country: null,
                    phone: null,
                  },
                },
              ]
            : [],
        groupBy: async () => [{ status: recipientStatus, _count: { _all: 1 } }],
      },
      emailBatch: {
        update: async () => ({ id: "batch-a", status: "FAILED" }),
      },
      emailInternalCopyRecipient: {
        updateMany: async () => ({ count: 0 }),
      },
      $transaction: async () => {
        transactionCalls += 1;
        throw new Error("database unavailable after provider acceptance");
      },
    },
    "@/services/contact-emails": {
      getPrimaryEmail: (contact: { emails: Array<{ email: string }> }) =>
        contact.emails[0]?.email ?? null,
      primaryContactEmailSelect: {},
    },
    "@/services/contacts/access": {},
    "@/services/teams/access": {},
    "@/types": emailTypes,
    "./scaleway-email-verification": {
      verifyScalewaySenderConfiguration: async () => ({
        domain: "example.org",
        status: "checked",
      }),
    },
  });

  const batch = {
    id: "batch-a",
    teamId: "team-a",
    subject: "Update",
    html: "<p>Hello</p>",
    senderEmail: "crm@example.org",
    senderName: "CRM",
    bccEmails: [],
    internalCopySentAt: null,
    userId: "actor",
    userName: "Ada",
  };

  try {
    await assert.rejects(
      service.processEmailBatch(batch),
      /database unavailable/,
    );
    assert.equal(recipientStatus, "DISPATCHING");

    const recovered = await service.processEmailBatch(batch);
    assert.equal(recipientStatus, "UNKNOWN");
    assert.equal(recovered.failed, 1);
    assert.equal(providerCalls, 1);
    assert.equal(transactionCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("inbox reply retries cannot resend an uncertain dispatch", async () => {
  const replyStatuses = {
    PENDING: "PENDING",
    DISPATCHING: "DISPATCHING",
    SENT: "SENT",
    FAILED: "FAILED",
    UNKNOWN: "UNKNOWN",
  };
  let dispatch = {
    id: "dispatch-a",
    requestHash: "",
    status: replyStatuses.PENDING,
    engagement: null,
  };
  let providerCalls = 0;
  class MockUncertainError extends Error {}
  class MockRejectedError extends Error {}
  class MockConfigurationError extends Error {}

  const prisma = {
    inboundEmailMessage: {
      findFirst: async () => ({
        id: "inbound-a",
        teamId: "team-a",
        contactId: "contact-a",
        engagementId: "engagement-inbound",
        fromEmail: "sender@example.org",
        fromName: "Sender",
        subject: "Question",
        messageId: "<message@example.org>",
        rawHeaders: {},
        emailInbox: {
          id: "inbox-a",
          groupId: "group-a",
          outboundMode: "SCALEWAY",
          replyFromEmail: "crm@example.org",
          replyFromName: "CRM",
        },
      }),
    },
    userGroup: { findUnique: async () => ({ userId: "actor" }) },
    emailReplyDispatch: {
      create: async (args: { data: { requestHash: string } }) => {
        dispatch = { ...dispatch, requestHash: args.data.requestHash };
        return dispatch;
      },
      findUnique: async () => dispatch,
      updateMany: async (args: {
        where: { status: string | { in: string[] } };
        data: { status: string };
      }) => {
        const expected = args.where.status;
        const matches =
          typeof expected === "string"
            ? dispatch.status === expected
            : expected.in.includes(dispatch.status);
        if (!matches) return { count: 0 };
        dispatch = { ...dispatch, status: args.data.status };
        return { count: 1 };
      },
    },
    $transaction: async () => {
      throw new Error("database unavailable after provider acceptance");
    },
  };

  const service = loadModule<{
    replyToInboundEmail: (input: Record<string, unknown>) => Promise<unknown>;
  }>("src/services/inbound-email/index.ts", {
    "@/lib/logger": {},
    "@/lib/prisma": prisma,
    "@/services/contact-change-logs": {},
    "@/services/contact-emails": {
      getPrimaryEmail: () => null,
      primaryContactEmailSelect: {},
    },
    "@/services/contacts": {
      getContactById: async () => ({ id: "contact-a" }),
    },
    "@/services/email-delivery-errors": {
      EmailDeliveryUncertainError: MockUncertainError,
    },
    "@/services/integrations/scaleway-email": {
      ScalewayEmailConfigurationError: MockConfigurationError,
      ScalewayEmailRejectedError: MockRejectedError,
      sendScalewayTransactionalEmail: async () => {
        providerCalls += 1;
        return { id: "provider-a" };
      },
    },
    "@/services/system-logs": { recordSystemLog: async () => undefined },
    "@/types": { ContactEmailKind: {} },
    "./reply-helpers": {
      escapeEmailHtml: (value: string) => value,
      getStoredReferences: () => [],
      normalizeReplySubject: (value: string) => `Re: ${value}`,
    },
    "./authentication": {
      parseInboundAuthentication: () => ({
        status: "PASS",
        reason: "test",
      }),
    },
    "@prisma/client": {
      ContactAccessReviewStatus: {},
      EmailInboxOutboundMode: {
        DISABLED: "DISABLED",
        SMTP: "SMTP",
        SCALEWAY: "SCALEWAY",
      },
      EmailReplyDispatchStatus: replyStatuses,
      EngagementDirection: { OUTBOUND: "OUTBOUND" },
      EngagementSource: { EMAIL: "EMAIL" },
      IntegrationProvider: { SCALEWAY_TEM: "SCALEWAY_TEM" },
      InboundEmailAuthenticationStatus: {
        PASS: "PASS",
        FAIL: "FAIL",
        UNKNOWN: "UNKNOWN",
      },
      SystemLogLevel: { ERROR: "ERROR" },
    },
  });

  const input = {
    teamId: "team-a",
    inboxId: "inbox-a",
    inboundEmailMessageId: "inbound-a",
    message: "Hello",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    userId: "actor",
    roles: [],
    isTeamAdmin: true,
  };

  await assert.rejects(
    service.replyToInboundEmail(input),
    /database unavailable/,
  );
  assert.equal(dispatch.status, replyStatuses.DISPATCHING);
  await assert.rejects(service.replyToInboundEmail(input), MockUncertainError);
  assert.equal(providerCalls, 1);
});
