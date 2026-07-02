import crypto from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import {
  ContactAccessReviewStatus,
  EngagementDirection,
  EngagementSource,
  type Prisma,
} from "@prisma/client";
import sanitizeHtml from "sanitize-html";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { logFieldUpdate } from "@/services/contact-change-logs";

const DEFAULT_INBOX_SYNC_LIMIT = 25;
const DEFAULT_INBOX_LOCK_MS = 5 * 60 * 1000;
const IMAP_EXTERNAL_SOURCE = "IMAP";
const INBOUND_EMAIL_ACCESS_REVIEW_SOURCE = "INBOUND_EMAIL";

const getEncryptionKey = () => {
  const secret = process.env.INBOUND_EMAIL_ENCRYPTION_KEY ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("INBOUND_EMAIL_ENCRYPTION_KEY or AUTH_SECRET is required.");
  }
  return crypto.createHash("sha256").update(secret).digest();
};

const encryptSecret = (value: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
};

const decryptSecret = (value: string) => {
  const [version, iv, authTag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !authTag || !encrypted) {
    throw new Error("Unsupported encrypted secret format.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
};

const toBigInt = (value?: bigint | number | null) => {
  if (value === null || value === undefined) return null;
  return typeof value === "bigint" ? value : BigInt(value);
};

const bigintToString = (value?: bigint | null) =>
  value === null || value === undefined ? undefined : value.toString();

const normalizeEmail = (value?: string | null) =>
  value?.trim().toLowerCase() || null;

const normalizeDomains = (domains?: string[]) =>
  Array.from(
    new Set(
      (domains ?? [])
        .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean),
    ),
  );

const getEmailDomain = (email: string) => email.split("@").at(1)?.toLowerCase();

const isDomainAllowed = (email: string, domains: string[]) => {
  const normalized = normalizeDomains(domains);
  if (normalized.length === 0) return true;

  const emailDomain = getEmailDomain(email);
  return Boolean(emailDomain && normalized.includes(emailDomain));
};

const truncate = (value: string | undefined, maxLength: number) => {
  if (!value) return undefined;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
};

const getPreviewText = (value: string, maxLength = 320) => {
  const text = value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
};

const buildExternalId = (
  inboxId: string,
  uidValidity: bigint,
  uid: bigint,
) => `imap:${inboxId}:${uidValidity.toString()}:${uid.toString()}`;

const mapInbox = (
  inbox: Prisma.EmailInboxGetPayload<{ include: { group: true } }>,
) => ({
  id: inbox.id,
  teamId: inbox.teamId,
  groupId: inbox.groupId,
  groupName: inbox.group.name,
  name: inbox.name,
  host: inbox.host,
  port: inbox.port,
  secure: inbox.secure,
  username: inbox.username,
  mailbox: inbox.mailbox,
  autoApproveExistingVisible: inbox.autoApproveExistingVisible,
  requireReviewForHiddenMatches: inbox.requireReviewForHiddenMatches,
  allowCreateContacts: inbox.allowCreateContacts,
  allowedDomains: inbox.allowedDomains,
  isEnabled: inbox.isEnabled,
  lastSyncedAt: inbox.lastSyncedAt?.toISOString(),
  uidValidity: bigintToString(inbox.uidValidity),
  lastUid: bigintToString(inbox.lastUid),
  syncLockedAt: inbox.syncLockedAt?.toISOString(),
  syncLockedBy: inbox.syncLockedBy ?? undefined,
  lastSyncError: inbox.lastSyncError ?? undefined,
  createdAt: inbox.createdAt.toISOString(),
  updatedAt: inbox.updatedAt.toISOString(),
});

const toIso = (value?: Date | null) => value?.toISOString();

type ContactAccessReviewWithInboundEmailDetails = Prisma.ContactAccessReviewGetPayload<{
  include: {
    inboundEmailMessage: {
      include: { emailInbox: { select: { id: true; name: true } } };
    };
    group: { select: { id: true; name: true } };
    contact: {
      select: {
        id: true;
        name: true;
        email: true;
        group: { select: { id: true; name: true } };
        groups: { select: { group: { select: { id: true; name: true } } } };
        engagements: {
          orderBy: { engagedAt: "desc" };
          take: 1;
          select: { engagedAt: true; subject: true; source: true };
        };
      };
    };
  };
}>;

const mapPendingContactAccessReview = (
  review: ContactAccessReviewWithInboundEmailDetails,
) => {
  if (!review.inboundEmailMessage) {
    throw new Error("Contact access review is missing its inbound email source message.");
  }

  return {
    id: review.id,
    teamId: review.teamId,
    groupId: review.groupId,
    groupName: review.group.name,
    inboundEmailMessageId: review.inboundEmailMessageId,
    emailInboxId: review.inboundEmailMessage.emailInboxId,
    emailInboxName: review.inboundEmailMessage.emailInbox.name,
    contactId: review.contactId,
    contactName: review.contact.name,
    contactEmail: review.contact.email ?? undefined,
    fromEmail: review.inboundEmailMessage.fromEmail,
    fromName: review.inboundEmailMessage.fromName ?? undefined,
    subject: review.inboundEmailMessage.subject ?? undefined,
    messagePreview: getPreviewText(review.inboundEmailMessage.body),
    matchReason: review.contact.email
      ? `Sender matched contact email ${review.contact.email}.`
      : "Sender matched an existing contact record.",
    contactGroups: [
      review.contact.group,
      ...review.contact.groups.map((membership) => membership.group),
    ]
      .filter((group): group is { id: string; name: string } => Boolean(group))
      .filter(
        (group, index, groups) =>
          groups.findIndex((candidate) => candidate.id === group.id) === index,
      ),
    contactLastEngagedAt:
      review.contact.engagements[0]?.engagedAt.toISOString() ?? undefined,
    contactLastEngagementSubject:
      review.contact.engagements[0]?.subject ?? undefined,
    receivedAt: review.inboundEmailMessage.receivedAt.toISOString(),
    createdAt: review.createdAt.toISOString(),
    reviewedAt: review.reviewedAt?.toISOString(),
    reviewedByUserName: review.reviewedByUserName ?? undefined,
    revokedAt: review.revokedAt?.toISOString(),
    revokedByUserName: review.revokedByUserName ?? undefined,
    status: review.status,
  };
};

const includeContactAccessReviewInboundEmailDetails = {
  inboundEmailMessage: {
    include: {
      emailInbox: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  group: {
    select: {
      id: true,
      name: true,
    },
  },
  contact: {
    select: {
      id: true,
      name: true,
      email: true,
      group: {
        select: {
          id: true,
          name: true,
        },
      },
      groups: {
        select: {
          group: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      engagements: {
        orderBy: {
          engagedAt: "desc",
        },
        take: 1,
        select: {
          engagedAt: true,
          subject: true,
          source: true,
        },
      },
    },
  },
} satisfies Prisma.ContactAccessReviewInclude;

export type EmailInboxInput = {
  teamId: string;
  groupId: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  mailbox?: string;
  autoApproveExistingVisible?: boolean;
  requireReviewForHiddenMatches?: boolean;
  allowCreateContacts?: boolean;
  allowedDomains?: string[];
  isEnabled?: boolean;
};

export type EmailInboxUpdateInput = Omit<
  Partial<EmailInboxInput>,
  "teamId" | "password"
> & {
  teamId: string;
  id: string;
  password?: string;
};

export const listEmailInboxes = async (teamId: string) => {
  const inboxes = await prisma.emailInbox.findMany({
    where: { teamId },
    include: { group: true },
    orderBy: [{ isEnabled: "desc" }, { name: "asc" }],
  });

  return inboxes.map(mapInbox);
};

export const createEmailInbox = async (input: EmailInboxInput) => {
  const group = await prisma.group.findFirst({
    where: { id: input.groupId, teamId: input.teamId },
    select: { id: true },
  });

  if (!group) {
    throw new Error("Group not found for this team.");
  }

  const inbox = await prisma.emailInbox.create({
    data: {
      teamId: input.teamId,
      groupId: input.groupId,
      name: input.name,
      host: input.host,
      port: input.port,
      secure: input.secure,
      username: input.username,
      passwordEncrypted: encryptSecret(input.password),
      mailbox: input.mailbox || "INBOX",
      autoApproveExistingVisible: input.autoApproveExistingVisible ?? true,
      requireReviewForHiddenMatches: input.requireReviewForHiddenMatches ?? true,
      allowCreateContacts: input.allowCreateContacts ?? false,
      allowedDomains: normalizeDomains(input.allowedDomains),
      isEnabled: input.isEnabled ?? true,
    },
    include: { group: true },
  });

  return mapInbox(inbox);
};

export const updateEmailInbox = async (input: EmailInboxUpdateInput) => {
  const existing = await prisma.emailInbox.findFirst({
    where: { id: input.id, teamId: input.teamId },
    select: { id: true },
  });

  if (!existing) {
    throw new Error("Email inbox not found.");
  }

  if (input.groupId) {
    const group = await prisma.group.findFirst({
      where: { id: input.groupId, teamId: input.teamId },
      select: { id: true },
    });

    if (!group) {
      throw new Error("Group not found for this team.");
    }
  }

  const inbox = await prisma.emailInbox.update({
    where: { id: input.id },
    data: {
      groupId: input.groupId,
      name: input.name,
      host: input.host,
      port: input.port,
      secure: input.secure,
      username: input.username,
      passwordEncrypted: input.password
        ? encryptSecret(input.password)
        : undefined,
      mailbox: input.mailbox,
      autoApproveExistingVisible: input.autoApproveExistingVisible,
      requireReviewForHiddenMatches: input.requireReviewForHiddenMatches,
      allowCreateContacts: input.allowCreateContacts,
      allowedDomains: input.allowedDomains
        ? normalizeDomains(input.allowedDomains)
        : undefined,
      isEnabled: input.isEnabled,
    },
    include: { group: true },
  });

  return mapInbox(inbox);
};

export const deleteEmailInbox = async (teamId: string, id: string) => {
  await prisma.emailInbox.delete({
    where: { id, teamId },
  });
};

const getClient = (inbox: {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordEncrypted: string;
}) =>
  new ImapFlow({
    host: inbox.host,
    port: inbox.port,
    secure: inbox.secure,
    auth: {
      user: inbox.username,
      pass: decryptSecret(inbox.passwordEncrypted),
    },
    logger: false,
  });

export const testEmailInboxConnection = async (teamId: string, id: string) => {
  const inbox = await prisma.emailInbox.findFirst({
    where: { id, teamId },
  });

  if (!inbox) {
    throw new Error("Email inbox not found.");
  }

  const client = getClient(inbox);
  await client.connect();
  try {
    const lock = await client.getMailboxLock(inbox.mailbox);
    lock.release();
  } finally {
    await client.logout();
  }
};

const parseHeaders = (mail: ParsedMail) =>
  Object.fromEntries(
    Array.from(mail.headers.entries()).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]),
  );

const getMessageBody = (mail: ParsedMail) => {
  if (mail.html) {
    return sanitizeHtml(mail.html, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        "img",
        "h1",
        "h2",
        "span",
      ]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        a: ["href", "name", "target"],
        img: ["src", "alt", "title", "width", "height"],
        span: ["style"],
      },
      allowedSchemes: ["http", "https", "mailto", "data"],
    }).trim();
  }

  return (mail.text ?? "").trim();
};

type ContactResolution = {
  contactId: string | null;
  canCreateEngagement: boolean;
  needsAccessReview: boolean;
  canAutoGrantAccess: boolean;
};

const resolveContactForInboundEmail = async ({
  teamId,
  groupId,
  fromEmail,
  fromName,
  allowCreateContacts,
  autoApproveExistingVisible,
  requireReviewForHiddenMatches,
}: {
  teamId: string;
  groupId: string;
  fromEmail: string;
  fromName?: string;
  allowCreateContacts: boolean;
  autoApproveExistingVisible: boolean;
  requireReviewForHiddenMatches: boolean;
}): Promise<ContactResolution> => {
  const existing = await prisma.contact.findUnique({
    where: {
      teamId_email: {
        teamId,
        email: fromEmail,
      },
    },
    select: {
      id: true,
      groupId: true,
      groups: {
        select: {
          groupId: true,
        },
      },
    },
  });

  if (existing) {
    const inboxGroup = await prisma.group.findFirst({
      where: { id: groupId, teamId },
      select: { canAccessAllContacts: true },
    });
    const contactGroupIds = new Set(
      [
        existing.groupId,
        ...existing.groups.map((group) => group.groupId),
      ].filter((id): id is string => Boolean(id)),
    );
    const isVisibleToInboxGroup =
      Boolean(inboxGroup?.canAccessAllContacts) ||
      contactGroupIds.size === 0 ||
      contactGroupIds.has(groupId);

    return {
      contactId: existing.id,
      canCreateEngagement: isVisibleToInboxGroup && autoApproveExistingVisible,
      needsAccessReview:
        (isVisibleToInboxGroup && !autoApproveExistingVisible) ||
        (!isVisibleToInboxGroup && requireReviewForHiddenMatches),
      canAutoGrantAccess: !isVisibleToInboxGroup && !requireReviewForHiddenMatches,
    };
  }

  if (!allowCreateContacts) {
    return {
      contactId: null,
      canCreateEngagement: false,
      needsAccessReview: false,
      canAutoGrantAccess: false,
    };
  }

  const contact = await prisma.contact.create({
    data: {
      teamId,
      name: fromName || fromEmail,
      email: fromEmail,
      groupId,
      groups: {
        create: [{ groupId }],
      },
    },
    select: { id: true },
  });

  return {
    contactId: contact.id,
    canCreateEngagement: true,
    needsAccessReview: false,
    canAutoGrantAccess: false,
  };
};

const importMessage = async ({
  inbox,
  uid,
  uidValidity,
  parsed,
}: {
  inbox: Prisma.EmailInboxGetPayload<Record<string, never>>;
  uid: bigint;
  uidValidity: bigint;
  parsed: ParsedMail;
}) => {
  const from = parsed.from?.value[0];
  const fromEmail = normalizeEmail(from?.address);
  if (!fromEmail) {
    return { imported: false as const, reason: "missing-from" };
  }

  const receivedAt = parsed.date ?? new Date();
  const externalId = buildExternalId(inbox.id, uidValidity, uid);
  const message = getMessageBody(parsed) || "(No message body)";
  const domainAllowed = isDomainAllowed(fromEmail, inbox.allowedDomains);
  const contactResolution = domainAllowed
    ? await resolveContactForInboundEmail({
        teamId: inbox.teamId,
        groupId: inbox.groupId,
        fromEmail,
        fromName: from?.name,
        allowCreateContacts: inbox.allowCreateContacts,
        autoApproveExistingVisible: inbox.autoApproveExistingVisible,
        requireReviewForHiddenMatches: inbox.requireReviewForHiddenMatches,
      })
    : {
        contactId: null,
        canCreateEngagement: false,
        needsAccessReview: false,
        canAutoGrantAccess: false,
      };

  const result = await prisma.$transaction(async (tx) => {
    const inbound = await tx.inboundEmailMessage.upsert({
      where: {
        emailInboxId_mailbox_uidValidity_uid: {
          emailInboxId: inbox.id,
          mailbox: inbox.mailbox,
          uidValidity,
          uid,
        },
      },
      update: {},
      create: {
        teamId: inbox.teamId,
        groupId: inbox.groupId,
        emailInboxId: inbox.id,
        mailbox: inbox.mailbox,
        uidValidity,
        uid,
        messageId: truncate(parsed.messageId ?? undefined, 500),
        fromEmail,
        fromName: truncate(from?.name, 255),
        subject: truncate(parsed.subject ?? undefined, 500),
        body: message,
        receivedAt,
        contactId: contactResolution.contactId,
        rawHeaders: parseHeaders(parsed),
      },
      select: { id: true, engagementId: true },
    });

    if (contactResolution.contactId && contactResolution.canAutoGrantAccess) {
      const contact = await tx.contact.findUnique({
        where: { id: contactResolution.contactId },
        include: { groups: true },
      });

      if (!contact) {
        throw new Error("Contact not found for inbound email access grant.");
      }

      const oldGroupIds = contact.groups.map((group) => group.groupId);
      const nextGroupIds = Array.from(new Set([...oldGroupIds, inbox.groupId]));

      await tx.contactGroup.createMany({
        data: [{ contactId: contactResolution.contactId, groupId: inbox.groupId }],
        skipDuplicates: true,
      });

      if (!contact.groupId) {
        await tx.contact.update({
          where: { id: contactResolution.contactId },
          data: { groupId: inbox.groupId },
        });
      }

      await logFieldUpdate(
        contactResolution.contactId,
        "groupIds",
        oldGroupIds,
        nextGroupIds,
        undefined,
        "Inbound email sync",
        tx,
        {
          source: "INBOUND_EMAIL_AUTO_ACCESS_GRANT",
          inboundEmailMessageId: inbound.id,
          emailInboxId: inbox.id,
          groupId: inbox.groupId,
        },
      );

      contactResolution.canCreateEngagement = true;
    }

    if (
      !contactResolution.contactId ||
      !contactResolution.canCreateEngagement ||
      inbound.engagementId
    ) {
      if (contactResolution.contactId && contactResolution.needsAccessReview) {
        await tx.contactAccessReview.upsert({
          where: {
            source_inboundEmailMessageId_groupId_contactId: {
              source: INBOUND_EMAIL_ACCESS_REVIEW_SOURCE,
              inboundEmailMessageId: inbound.id,
              groupId: inbox.groupId,
              contactId: contactResolution.contactId,
            },
          },
          update: {},
          create: {
            teamId: inbox.teamId,
            groupId: inbox.groupId,
            contactId: contactResolution.contactId,
            source: INBOUND_EMAIL_ACCESS_REVIEW_SOURCE,
            inboundEmailMessageId: inbound.id,
          },
        });
      }
      return { inboundId: inbound.id, engagementId: inbound.engagementId };
    }

    const engagement = await tx.contactEngagement.upsert({
      where: {
        teamId_externalId_externalSource: {
          teamId: inbox.teamId,
          externalId,
          externalSource: IMAP_EXTERNAL_SOURCE,
        },
      },
      update: {},
      create: {
        contactId: contactResolution.contactId,
        teamId: inbox.teamId,
        direction: EngagementDirection.INBOUND,
        source: EngagementSource.EMAIL,
        subject: truncate(parsed.subject ?? undefined, 500),
        message,
        externalId,
        externalSource: IMAP_EXTERNAL_SOURCE,
        engagedAt: receivedAt,
      },
      select: { id: true },
    });

    await tx.inboundEmailMessage.update({
      where: { id: inbound.id },
      data: {
        engagementId: engagement.id,
        contactId: contactResolution.contactId,
      },
    });

    return { inboundId: inbound.id, engagementId: engagement.id };
  });

  return {
    imported: true as const,
    contactId: contactResolution.contactId,
    needsAccessReview: contactResolution.needsAccessReview,
    ...result,
  };
};

export const listContactAccessReviewsForInboundEmail = async (teamId: string) => {
  const reviews = await prisma.contactAccessReview.findMany({
    where: {
      teamId,
      source: INBOUND_EMAIL_ACCESS_REVIEW_SOURCE,
      status: {
        in: [
          ContactAccessReviewStatus.PENDING,
          ContactAccessReviewStatus.APPROVED,
        ],
      },
    },
    include: includeContactAccessReviewInboundEmailDetails,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return reviews.map(mapPendingContactAccessReview);
};

export const approveContactAccessReviewForInboundEmail = async ({
  teamId,
  reviewId,
  userId,
  userName,
}: {
  teamId: string;
  reviewId: string;
  userId?: string;
  userName?: string;
}) =>
  await prisma.$transaction(async (tx) => {
    const review = await tx.contactAccessReview.findFirst({
      where: {
        id: reviewId,
        teamId,
        source: INBOUND_EMAIL_ACCESS_REVIEW_SOURCE,
        status: ContactAccessReviewStatus.PENDING,
      },
      include: {
        inboundEmailMessage: true,
        contact: {
          include: {
            groups: true,
          },
        },
      },
    });

    if (!review) {
      throw new Error("Pending contact access review not found.");
    }

    const message = review.inboundEmailMessage;
    if (!message) {
      throw new Error("Contact access review is missing its inbound email source message.");
    }

    const oldGroupIds = review.contact.groups.map((group) => group.groupId);
    const nextGroupIds = Array.from(new Set([...oldGroupIds, review.groupId]));

    await tx.contactGroup.createMany({
      data: [{ contactId: review.contactId, groupId: review.groupId }],
      skipDuplicates: true,
    });

    if (!review.contact.groupId) {
      await tx.contact.update({
        where: { id: review.contactId },
        data: { groupId: review.groupId },
      });
    }

    const externalId = buildExternalId(
      message.emailInboxId,
      message.uidValidity,
      message.uid,
    );

    const engagement = await tx.contactEngagement.upsert({
      where: {
        teamId_externalId_externalSource: {
          teamId,
          externalId,
          externalSource: IMAP_EXTERNAL_SOURCE,
        },
      },
      update: {},
      create: {
        contactId: review.contactId,
        teamId,
        direction: EngagementDirection.INBOUND,
        source: EngagementSource.EMAIL,
        subject: message.subject,
        message: message.body,
        externalId,
        externalSource: IMAP_EXTERNAL_SOURCE,
        engagedAt: message.receivedAt,
      },
      select: { id: true },
    });

    const reviewedAt = new Date();
    await tx.inboundEmailMessage.update({
      where: { id: message.id },
      data: {
        engagementId: engagement.id,
      },
    });

    const updated = await tx.contactAccessReview.update({
      where: { id: review.id },
      data: {
        status: ContactAccessReviewStatus.APPROVED,
        reviewedAt,
        reviewedByUserId: userId,
        reviewedByUserName: userName,
      },
      include: includeContactAccessReviewInboundEmailDetails,
    });

    await logFieldUpdate(
      review.contactId,
      "groupIds",
      oldGroupIds,
      nextGroupIds,
      userId,
      userName,
      tx,
      {
        source: "INBOUND_EMAIL_ACCESS_REVIEW",
        contactAccessReviewId: review.id,
        inboundEmailMessageId: message.id,
        emailInboxId: message.emailInboxId,
        groupId: review.groupId,
      },
    );

    return {
      ...mapPendingContactAccessReview(updated),
      reviewedAt: toIso(reviewedAt),
      engagementId: engagement.id,
      status: updated.status,
    };
  });

export const rejectContactAccessReviewForInboundEmail = async ({
  teamId,
  reviewId,
  userId,
  userName,
  reviewNote,
}: {
  teamId: string;
  reviewId: string;
  userId?: string;
  userName?: string;
  reviewNote?: string;
}) => {
  const updated = await prisma.contactAccessReview.update({
    where: {
      id: reviewId,
      teamId,
      source: INBOUND_EMAIL_ACCESS_REVIEW_SOURCE,
      status: ContactAccessReviewStatus.PENDING,
    },
    data: {
      status: ContactAccessReviewStatus.REJECTED,
      reviewedAt: new Date(),
      reviewedByUserId: userId,
      reviewedByUserName: userName,
      reviewNote,
    },
    include: includeContactAccessReviewInboundEmailDetails,
  });

  return {
    ...mapPendingContactAccessReview(updated),
    reviewedAt: toIso(updated.reviewedAt),
    status: updated.status,
  };
};

export const revokeContactAccessReviewForInboundEmail = async ({
  teamId,
  reviewId,
  userId,
  userName,
  reviewNote,
}: {
  teamId: string;
  reviewId: string;
  userId?: string;
  userName?: string;
  reviewNote?: string;
}) =>
  await prisma.$transaction(async (tx) => {
    const review = await tx.contactAccessReview.findFirst({
      where: {
        id: reviewId,
        teamId,
        source: INBOUND_EMAIL_ACCESS_REVIEW_SOURCE,
        status: ContactAccessReviewStatus.APPROVED,
      },
      include: {
        inboundEmailMessage: true,
        contact: {
          include: {
            groups: true,
          },
        },
      },
    });

    if (!review) {
      throw new Error("Approved contact access review not found.");
    }

    const message = review.inboundEmailMessage;
    if (!message) {
      throw new Error("Contact access review is missing its inbound email source message.");
    }

    const otherApprovedReviews = await tx.contactAccessReview.count({
      where: {
        id: { not: review.id },
        teamId,
        source: INBOUND_EMAIL_ACCESS_REVIEW_SOURCE,
        groupId: review.groupId,
        contactId: review.contactId,
        status: ContactAccessReviewStatus.APPROVED,
      },
    });

    const membership = review.contact.groups.find(
      (group) => group.groupId === review.groupId,
    );
    const oldGroupIds = review.contact.groups.map((group) => group.groupId);
    let nextGroupIds = oldGroupIds;
    const canRemoveMembership =
      otherApprovedReviews === 0 &&
      membership &&
      membership.createdAt >= review.createdAt;

    if (canRemoveMembership) {
      await tx.contactGroup.delete({
        where: {
          contactId_groupId: {
            contactId: review.contactId,
            groupId: review.groupId,
          },
        },
      });

      nextGroupIds = oldGroupIds.filter((groupId) => groupId !== review.groupId);

      if (review.contact.groupId === review.groupId) {
        await tx.contact.update({
          where: { id: review.contactId },
          data: { groupId: nextGroupIds[0] ?? null },
        });
      }
    }

    const revokedAt = new Date();
    const updated = await tx.contactAccessReview.update({
      where: { id: review.id },
      data: {
        status: ContactAccessReviewStatus.REVOKED,
        revokedAt,
        revokedByUserId: userId,
        revokedByUserName: userName,
        reviewNote,
      },
      include: includeContactAccessReviewInboundEmailDetails,
    });

    await logFieldUpdate(
      review.contactId,
      "groupIds",
      oldGroupIds,
      nextGroupIds,
      userId,
      userName,
      tx,
      {
        source: "INBOUND_EMAIL_ACCESS_REVIEW_REVOKE",
        contactAccessReviewId: review.id,
        inboundEmailMessageId: message.id,
        emailInboxId: message.emailInboxId,
        groupId: review.groupId,
        removedGroupAccess: Boolean(canRemoveMembership),
      },
    );

    return {
      ...mapPendingContactAccessReview(updated),
      revokedAt: toIso(revokedAt),
      status: updated.status,
      removedGroupAccess: Boolean(canRemoveMembership),
    };
  });

const claimInbox = async (
  inboxId: string,
  workerId: string,
  staleLockMs: number,
  teamId?: string,
) => {
  const staleBefore = new Date(Date.now() - staleLockMs);
  const claimed = await prisma.emailInbox.updateMany({
    where: {
      id: inboxId,
      teamId,
      isEnabled: true,
      OR: [{ syncLockedAt: null }, { syncLockedAt: { lt: staleBefore } }],
    },
    data: {
      syncLockedAt: new Date(),
      syncLockedBy: workerId,
    },
  });

  return claimed.count === 1;
};

const releaseInbox = async (
  inboxId: string,
  workerId: string,
  data: Prisma.EmailInboxUpdateInput,
) => {
  await prisma.emailInbox.updateMany({
    where: { id: inboxId, syncLockedBy: workerId },
    data: {
      ...data,
      syncLockedAt: null,
      syncLockedBy: null,
    },
  });
};

export const syncEmailInbox = async (
  inboxId: string,
  options: {
    workerId?: string;
    limit?: number;
    staleLockMs?: number;
    teamId?: string;
  } = {},
) => {
  const workerId = options.workerId ?? `manual-${process.pid}`;
  const limit = options.limit ?? DEFAULT_INBOX_SYNC_LIMIT;
  const staleLockMs = options.staleLockMs ?? DEFAULT_INBOX_LOCK_MS;

  if (!(await claimInbox(inboxId, workerId, staleLockMs, options.teamId))) {
    return { skipped: true, imported: 0, unmatched: 0, lastUid: null };
  }

  const inbox = await prisma.emailInbox.findUniqueOrThrow({
    where: { id: inboxId },
  });

  const client = getClient(inbox);
  let imported = 0;
  let unmatched = 0;
  let lastUid = inbox.lastUid;

  try {
    await client.connect();
    const lock = await client.getMailboxLock(inbox.mailbox);
    try {
      const mailbox = client.mailbox;
      if (!mailbox) {
        throw new Error(`Unable to open mailbox ${inbox.mailbox}.`);
      }

      const uidValidity = mailbox.uidValidity;
      const startUid =
        inbox.uidValidity === uidValidity && inbox.lastUid
          ? inbox.lastUid + BigInt(1)
          : BigInt(1);
      const range = `${startUid.toString()}:*`;

      let fetched = 0;
      for await (const message of client.fetch(
        range,
        { source: true, uid: true, internalDate: true },
        { uid: true },
      )) {
        if (fetched >= limit) {
          break;
        }

        if (!message.source) {
          continue;
        }

        fetched += 1;
        const uid = BigInt(message.uid);
        const parsed = await simpleParser(message.source);
        const result = await importMessage({
          inbox,
          uid,
          uidValidity,
          parsed,
        });

        if (result.imported) {
          imported += 1;
          if (!result.contactId) {
            unmatched += 1;
          }
        }

        lastUid = uid;
      }

      await releaseInbox(inbox.id, workerId, {
        lastSyncedAt: new Date(),
        uidValidity,
        lastUid,
        lastSyncError: null,
      });
    } finally {
      lock.release();
    }

    return {
      skipped: false,
      imported,
      unmatched,
      lastUid: bigintToString(lastUid),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await releaseInbox(inbox.id, workerId, {
      lastSyncError: message,
    });
    throw error;
  } finally {
    await client.logout().catch((error: unknown) => {
      logger.debug({ inboxId, error }, "[InboundEmail] IMAP logout failed");
    });
  }
};

export const syncDueEmailInboxes = async (
  workerId: string,
  options: {
    limit?: number;
    staleLockMs?: number;
  } = {},
) => {
  const inboxes = await prisma.emailInbox.findMany({
    where: { isEnabled: true },
    orderBy: { updatedAt: "asc" },
    select: { id: true, teamId: true },
  });

  const results = [];
  for (const inbox of inboxes) {
    try {
      const result = await syncEmailInbox(inbox.id, {
        workerId,
        limit: options.limit,
        staleLockMs: options.staleLockMs,
      });
      results.push({ inboxId: inbox.id, teamId: inbox.teamId, ...result });
    } catch (error) {
      logger.error(
        { inboxId: inbox.id, teamId: inbox.teamId, error },
        "[InboundEmail] Inbox sync failed",
      );
      results.push({
        inboxId: inbox.id,
        teamId: inbox.teamId,
        skipped: false,
        imported: 0,
        unmatched: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
};
