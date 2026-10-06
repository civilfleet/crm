import type { Prisma } from "@prisma/client";
import type { ContactSubmodule } from "@/constants/contact-submodules";
import prisma from "@/lib/prisma";
import { resolveInboundRecipientEmail } from "@/services/contact-engagements/recipient";
import type {
  ContactEngagement,
  EngagementDirection,
  EngagementSource,
  TodoStatus,
} from "@/types";

type CreateEngagementInput = {
  contactId: string;
  teamId: string;
  direction: EngagementDirection;
  source: EngagementSource;
  subject?: string;
  message: string;
  userId?: string;
  userName?: string;
  assignedToUserId?: string;
  assignedToUserName?: string;
  todoStatus?: TodoStatus;
  dueDate?: Date;
  engagedAt: Date;
  externalId?: string;
  externalSource?: string;
  restrictedToSubmodule?: ContactSubmodule;
};

type UpdateEngagementInput = {
  id: string;
  teamId: string;
  subject?: string;
  message?: string;
  assignedToUserId?: string;
  assignedToUserName?: string;
  todoStatus?: TodoStatus;
  dueDate?: Date;
  restrictedToSubmodule?: ContactSubmodule | null;
};

const engagementInclude = {
  emailInbox: {
    select: {
      id: true,
      name: true,
      replyFromEmail: true,
      outboundMode: true,
    },
  },
  emailAttachments: true,
  inboundEmailMessages: {
    take: 1,
    select: {
      id: true,
      emailInboxId: true,
      mailbox: true,
      fromEmail: true,
      fromName: true,
      replyToEmail: true,
      replyToName: true,
      rawHeaders: true,
      messageId: true,
      uid: true,
      attachments: true,
      emailInbox: {
        select: {
          name: true,
          groupId: true,
          username: true,
          replyFromEmail: true,
          outboundMode: true,
        },
      },
    },
  },
} satisfies Prisma.ContactEngagementInclude;

type ContactEngagementWithDefaults = Prisma.ContactEngagementGetPayload<{
  include: typeof engagementInclude;
}>;

const mapAttachment = (
  attachment: ContactEngagementWithDefaults["emailAttachments"][number],
) => ({
  id: attachment.id,
  fileName: attachment.fileName,
  contentType: attachment.contentType,
  sizeBytes: attachment.sizeBytes,
  status: attachment.status,
  direction: attachment.direction,
  inline: false,
});

const renderInlineAttachments = (
  message: string,
  teamId: string,
  attachments: ContactEngagementWithDefaults["inboundEmailMessages"][number]["attachments"],
) => {
  let rendered = message;
  for (const attachment of attachments) {
    if (
      attachment.status !== "AVAILABLE" ||
      !attachment.contentId ||
      !["image/gif", "image/jpeg", "image/png", "image/webp"].includes(
        attachment.contentType,
      )
    )
      continue;
    const escaped = attachment.contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rendered = rendered.replace(
      new RegExp(`cid:${escaped}`, "gi"),
      `/api/teams/${teamId}/email-attachments/${attachment.id}/content?inline=true`,
    );
  }
  return rendered;
};

const mapEngagement = (
  engagement: ContactEngagementWithDefaults,
  replyInboxIds: Set<string> = new Set(),
): ContactEngagement => ({
  id: engagement.id,
  contactId: engagement.contactId,
  teamId: engagement.teamId,
  direction: engagement.direction as EngagementDirection,
  source: engagement.source as EngagementSource,
  subject: engagement.subject ?? undefined,
  message: engagement.inboundEmailMessages[0]
    ? renderInlineAttachments(
        engagement.message,
        engagement.teamId,
        engagement.inboundEmailMessages[0].attachments,
      )
    : engagement.message,
  userId: engagement.userId ?? undefined,
  userName: engagement.userName ?? undefined,
  externalId: engagement.externalId ?? undefined,
  externalSource: engagement.externalSource ?? undefined,
  emailInbox: engagement.emailInbox
    ? {
        id: engagement.emailInbox.id,
        name: engagement.emailInbox.name,
        replyFromEmail: engagement.emailInbox.replyFromEmail ?? undefined,
        outboundMode: engagement.emailInbox.outboundMode,
      }
    : undefined,
  replyToEngagementId: engagement.replyToEngagementId ?? undefined,
  attachments: [
    ...engagement.emailAttachments.map(mapAttachment),
    ...(engagement.inboundEmailMessages[0]?.attachments ?? []).map(
      (attachment) => ({
        ...mapAttachment(attachment),
        inline: Boolean(
          attachment.contentId &&
            ["image/gif", "image/jpeg", "image/png", "image/webp"].includes(
              attachment.contentType,
            ),
        ),
      }),
    ),
  ],
  inboundEmail: engagement.inboundEmailMessages[0]
    ? {
        id: engagement.inboundEmailMessages[0].id,
        emailInboxId: engagement.inboundEmailMessages[0].emailInboxId,
        emailInboxName: engagement.inboundEmailMessages[0].emailInbox.name,
        replyFromEmail:
          engagement.inboundEmailMessages[0].emailInbox.replyFromEmail ??
          undefined,
        outboundMode:
          engagement.inboundEmailMessages[0].emailInbox.outboundMode,
        canReply:
          engagement.inboundEmailMessages[0].emailInbox.outboundMode !==
            "DISABLED" &&
          Boolean(
            engagement.inboundEmailMessages[0].emailInbox.replyFromEmail,
          ) &&
          replyInboxIds.has(engagement.inboundEmailMessages[0].emailInboxId),
        mailbox: engagement.inboundEmailMessages[0].mailbox,
        fromEmail: engagement.inboundEmailMessages[0].fromEmail,
        fromName: engagement.inboundEmailMessages[0].fromName ?? undefined,
        replyToEmail:
          engagement.inboundEmailMessages[0].replyToEmail ?? undefined,
        replyToName:
          engagement.inboundEmailMessages[0].replyToName ?? undefined,
        receivedAtEmail: resolveInboundRecipientEmail({
          rawHeaders: engagement.inboundEmailMessages[0].rawHeaders,
          inboxUsername: engagement.inboundEmailMessages[0].emailInbox.username,
          replyFromEmail:
            engagement.inboundEmailMessages[0].emailInbox.replyFromEmail,
        }),
        messageId: engagement.inboundEmailMessages[0].messageId ?? undefined,
        uid: engagement.inboundEmailMessages[0].uid.toString(),
      }
    : undefined,
  restrictedToSubmodule: engagement.restrictedToSubmodule ?? undefined,
  assignedToUserId: engagement.assignedToUserId ?? undefined,
  assignedToUserName: engagement.assignedToUserName ?? undefined,
  todoStatus: engagement.todoStatus
    ? (engagement.todoStatus as TodoStatus)
    : undefined,
  dueDate: engagement.dueDate ?? undefined,
  engagedAt: engagement.engagedAt,
  createdAt: engagement.createdAt,
  updatedAt: engagement.updatedAt,
  tags: engagement.tags,
});

const getContactEngagements = async (
  contactId: string,
  teamId: string,
  allowedSubmodules?: ContactSubmodule[],
  replyAccess?: { userId: string; isAdmin: boolean },
) => {
  const submoduleFilters: Prisma.ContactEngagementWhereInput[] = [
    { restrictedToSubmodule: null },
  ];

  if (allowedSubmodules && allowedSubmodules.length > 0) {
    submoduleFilters.push({
      restrictedToSubmodule: { in: allowedSubmodules },
    });
  }

  const engagementsPromise = prisma.contactEngagement.findMany({
    where: {
      contactId,
      teamId,
      OR: submoduleFilters,
    },
    orderBy: {
      engagedAt: "desc",
    },
    include: engagementInclude,
  });

  const replyInboxesPromise = replyAccess
    ? prisma.emailInbox.findMany({
        where: {
          teamId,
          outboundMode: { not: "DISABLED" },
          ...(replyAccess.isAdmin
            ? {}
            : { group: { users: { some: { userId: replyAccess.userId } } } }),
        },
        select: { id: true },
      })
    : Promise.resolve([]);

  const [engagements, replyInboxes] = await Promise.all([
    engagementsPromise,
    replyInboxesPromise,
  ]);
  const replyInboxIds = new Set(replyInboxes.map((inbox) => inbox.id));

  return engagements.map((engagement) =>
    mapEngagement(engagement, replyInboxIds),
  );
};

const createEngagement = async (input: CreateEngagementInput) => {
  const engagement = await prisma.contactEngagement.create({
    data: {
      contactId: input.contactId,
      teamId: input.teamId,
      direction: input.direction,
      source: input.source,
      subject: input.subject,
      message: input.message,
      userId: input.userId,
      userName: input.userName,
      externalId: input.externalId,
      externalSource: input.externalSource,
      restrictedToSubmodule: input.restrictedToSubmodule,
      assignedToUserId: input.assignedToUserId,
      assignedToUserName: input.assignedToUserName,
      todoStatus: input.todoStatus,
      dueDate: input.dueDate,
      engagedAt: input.engagedAt,
    },
    include: engagementInclude,
  });

  return mapEngagement(engagement);
};

const updateEngagement = async (input: UpdateEngagementInput) => {
  const { id, teamId, ...updateData } = input;

  const engagement = await prisma.contactEngagement.update({
    where: {
      id,
      teamId,
    },
    data: updateData,
    include: engagementInclude,
  });

  return mapEngagement(engagement);
};

const deleteEngagement = async (id: string, teamId: string) => {
  await prisma.contactEngagement.delete({
    where: {
      id,
      teamId,
    },
  });
};

export {
  createEngagement,
  deleteEngagement,
  getContactEngagements,
  mapEngagement,
  updateEngagement,
};
