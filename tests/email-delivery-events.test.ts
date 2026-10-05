import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  getScalewaySnsStringToSign,
  type ScalewaySnsEnvelope,
  validateScalewaySnsCertificateUrl,
  verifyScalewaySnsEnvelope,
} from "@/services/integrations/scaleway-sns";
import { loadModule } from "./helpers/load-module";

test("accepts an allowlisted Scaleway SNS envelope with a valid signature", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const envelope: ScalewaySnsEnvelope = {
    Type: "Notification",
    Message: JSON.stringify({ id: "event-a", type: "email_delivered" }),
    MessageId: "message-a",
    TopicArn: "arn:scw:sns:fr-par:project-a:crm-email",
    Timestamp: "2026-10-05T12:00:00Z",
    SignatureVersion: "1",
    Signature: "",
    SigningCertURL:
      "https://messaging.s3.fr-par.scw.cloud/fr-par/sns/sns_certificate_test.crt",
  };
  envelope.Signature = sign(
    "RSA-SHA1",
    Buffer.from(getScalewaySnsStringToSign(envelope)),
    privateKey,
  ).toString("base64");

  await verifyScalewaySnsEnvelope(envelope, {
    allowedTopicArns: [envelope.TopicArn],
    loadSigningPublicKey: async () => publicKey,
  });
});

test("rejects wrong topics, signatures, and certificate URL hosts", async () => {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const envelope: ScalewaySnsEnvelope = {
    Type: "Notification",
    Message: "{}",
    MessageId: "message-a",
    TopicArn: "arn:scw:sns:fr-par:project-a:crm-email",
    Timestamp: "2026-10-05T12:00:00Z",
    SignatureVersion: "1",
    Signature: Buffer.from("invalid").toString("base64"),
    SigningCertURL:
      "https://messaging.s3.fr-par.scw.cloud/fr-par/sns/sns_certificate_test.crt",
  };

  await assert.rejects(
    verifyScalewaySnsEnvelope(envelope, {
      allowedTopicArns: ["arn:scw:sns:fr-par:project-a:other"],
      loadSigningPublicKey: async () => publicKey,
    }),
    /topic is not allowed/,
  );
  await assert.rejects(
    verifyScalewaySnsEnvelope(envelope, {
      allowedTopicArns: [envelope.TopicArn],
      loadSigningPublicKey: async () => publicKey,
    }),
    /Invalid Scaleway SNS signature/,
  );
  assert.throws(
    () =>
      validateScalewaySnsCertificateUrl(
        "https://attacker.example/sns_certificate_test.crt",
        "fr-par",
      ),
    /Untrusted Scaleway SNS signing certificate URL/,
  );
});

test("hard bounce updates the recipient, batch counts, and suppression once", async () => {
  let recipientStatus: string | undefined;
  let suppression: Record<string, unknown> | undefined;
  let batchUpdate: Record<string, unknown> | undefined;
  let eventWrites = 0;
  const transactionClient = {
    emailDeliveryEvent: {
      findUnique: async () => (eventWrites > 0 ? { eventId: "event-a" } : null),
      create: async () => {
        eventWrites += 1;
      },
    },
    emailRecipient: {
      updateMany: async (args: { data: { status: string } }) => {
        recipientStatus = args.data.status;
        return { count: 1 };
      },
      groupBy: async () => [{ status: "BOUNCED", _count: { _all: 1 } }],
    },
    emailInternalCopyRecipient: { updateMany: async () => ({ count: 0 }) },
    emailSuppression: {
      upsert: async (args: Record<string, unknown>) => {
        suppression = args;
      },
    },
    emailBatch: {
      update: async (args: { data: Record<string, unknown> }) => {
        batchUpdate = args.data;
      },
    },
  };
  const service = loadModule<{
    applyScalewayEmailEvent: (
      event: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
  }>("src/services/email-delivery-events.ts", {
    "@/lib/prisma": {
      integrationConnection: {
        findMany: async () => [{ teamId: "team-a" }],
      },
      emailRecipient: {
        findFirst: async () => ({
          id: "recipient-a",
          batchId: "batch-a",
          email: "person@example.org",
          batch: { teamId: "team-a" },
        }),
      },
      emailInternalCopyRecipient: { findFirst: async () => null },
      $transaction: async (
        callback: (tx: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    },
    "@prisma/client": {
      EmailBatchStatus: { SENT: "SENT", PARTIAL: "PARTIAL" },
      EmailRecipientStatus: {
        SENT: "SENT",
        DELIVERED: "DELIVERED",
        BOUNCED: "BOUNCED",
        FAILED: "FAILED",
        UNKNOWN: "UNKNOWN",
        SKIPPED: "SKIPPED",
      },
      EmailSuppressionReason: {
        HARD_BOUNCE: "HARD_BOUNCE",
        SPAM: "SPAM",
      },
      IntegrationProvider: { SCALEWAY_TEM: "SCALEWAY_TEM" },
    },
  });

  const result = await service.applyScalewayEmailEvent({
    id: "event-a",
    type: "email_dropped",
    project_id: "project-a",
    email_id: "provider-a",
    email_to: "person@example.org",
    email_response_message: "mailbox rejected",
  });

  assert.equal(eventWrites, 1);
  assert.equal(recipientStatus, "BOUNCED");
  assert.equal(
    (suppression?.create as Record<string, unknown>).reason,
    "HARD_BOUNCE",
  );
  assert.deepEqual(batchUpdate, {
    status: "PARTIAL",
    sentCount: 0,
    failedCount: 1,
    skippedCount: 0,
  });
  assert.deepEqual(result, {
    duplicate: false,
    type: "email_dropped",
    statusChanged: true,
    suppressed: true,
  });
  assert.deepEqual(
    await service.applyScalewayEmailEvent({
      id: "event-a",
      type: "email_dropped",
      project_id: "project-a",
      email_id: "provider-a",
      email_to: "person@example.org",
    }),
    { duplicate: true, type: "email_dropped" },
  );
  assert.equal(eventWrites, 1);
});
