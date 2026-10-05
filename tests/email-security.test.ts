import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";

const emailTypes = {
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
