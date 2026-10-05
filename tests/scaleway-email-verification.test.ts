import assert from "node:assert/strict";
import test from "node:test";
import { verifyScalewaySenderConfiguration } from "@/services/integrations/scaleway-email-verification";
import { loadModule } from "./helpers/load-module";

const settings = {
  apiKey: "secret-token",
  region: "fr-par",
  projectId: "project-a",
  senderEmail: "CRM@Example.org",
};

test("verifies the exact checked sender domain in the configured project", async () => {
  let requestedUrl: URL | undefined;
  let requestedToken: string | null = null;
  const result = await verifyScalewaySenderConfiguration({
    ...settings,
    fetchImpl: async (input, init) => {
      requestedUrl = new URL(input.toString());
      requestedToken = new Headers(init?.headers).get("X-Auth-Token");
      return Response.json({
        domains: [
          {
            name: "example.org",
            project_id: "other-project",
            status: "checked",
          },
          { name: "example.org", project_id: "project-a", status: "checked" },
        ],
      });
    },
  });

  assert.deepEqual(result, { domain: "example.org", status: "checked" });
  assert.equal(
    requestedUrl?.pathname,
    "/transactional-email/v1alpha1/regions/fr-par/domains",
  );
  assert.equal(requestedUrl?.searchParams.get("project_id"), "project-a");
  assert.equal(requestedUrl?.searchParams.get("name"), "example.org");
  assert.equal(requestedToken, "secret-token");
});

test("rejects an unverified sender domain", async () => {
  await assert.rejects(
    verifyScalewaySenderConfiguration({
      ...settings,
      fetchImpl: async () =>
        Response.json({
          domains: [
            { name: "example.org", project_id: "project-a", status: "pending" },
          ],
        }),
    }),
    /not verified by Scaleway \(status: pending\)/,
  );
});

test("reports rejected Scaleway credentials without exposing the token", async () => {
  await assert.rejects(
    verifyScalewaySenderConfiguration({
      ...settings,
      fetchImpl: async () =>
        Response.json({ message: "invalid credentials" }, { status: 401 }),
    }),
    (error: Error) => {
      assert.match(error.message, /401.*invalid credentials/);
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    },
  );
});

test("inbox outbound test submits a real Scaleway delivery", async () => {
  let providerInput: Record<string, unknown> | undefined;
  const service = loadModule<{
    testEmailInboxOutboundConnection: (
      teamId: string,
      inboxId: string,
      recipientEmail: string,
    ) => Promise<{ recipientEmail: string; messageId: string }>;
  }>("src/services/inbound-email/index.ts", {
    "@/lib/email-timeouts": { getEmailConnectionTimeouts: () => ({}) },
    "@/lib/logger": {},
    "@/lib/prisma": {
      emailInbox: {
        findFirst: async () => ({
          id: "inbox-a",
          teamId: "team-a",
          name: "Support",
          outboundMode: "SCALEWAY",
          replyFromEmail: "support@example.org",
          replyFromName: "Support team",
        }),
      },
    },
    "@/services/contact-change-logs": {},
    "@/services/contact-emails": {
      getPrimaryEmail: () => null,
      primaryContactEmailSelect: {},
    },
    "@/services/contacts": {},
    "@/services/email-delivery-errors": {
      EmailDeliveryUncertainError: class extends Error {},
    },
    "@/services/integrations/scaleway-email": {
      ScalewayEmailConfigurationError: class extends Error {},
      ScalewayEmailRejectedError: class extends Error {},
      sendScalewayTransactionalEmail: async (
        input: Record<string, unknown>,
      ) => {
        providerInput = input;
        return { id: "provider-email-a", messageId: "message-a" };
      },
    },
    "@/services/system-logs": {},
    "@/types": { ContactEmailKind: {} },
    "./authentication": { parseInboundAuthentication: () => ({}) },
    "./reply-helpers": {
      escapeEmailHtml: (value: string) => value,
      getStoredReferences: () => [],
      normalizeReplySubject: (value: string) => value,
    },
    "@prisma/client": {
      ContactAccessReviewStatus: {},
      EmailInboxOutboundMode: {
        DISABLED: "DISABLED",
        SMTP: "SMTP",
        SCALEWAY: "SCALEWAY",
      },
      EmailReplyDispatchStatus: {},
      EngagementDirection: {},
      EngagementSource: {},
      InboundEmailAuthenticationStatus: {},
      SystemLogLevel: {},
    },
    imapflow: { ImapFlow: class {} },
    mailparser: { simpleParser: async () => ({}) },
    nodemailer: { createTransport: () => ({}) },
    "sanitize-html": (value: string) => value,
  });

  const result = await service.testEmailInboxOutboundConnection(
    "team-a",
    "inbox-a",
    "admin@example.org",
  );

  assert.deepEqual(result, {
    recipientEmail: "admin@example.org",
    messageId: "message-a",
  });
  assert.deepEqual(providerInput, {
    teamId: "team-a",
    from: { email: "support@example.org", name: "Support team" },
    to: { email: "admin@example.org" },
    subject: "CRM outbound test: Support",
    text: "This test confirms that the CRM can send replies through this inbox's Scaleway configuration.",
    html: "<p>This test confirms that the CRM can send replies through this inbox's Scaleway configuration.</p>",
  });
});
