import logger from "@/lib/logger";
import { sendEmail } from "@/lib/nodemailer";
import prisma from "@/lib/prisma";
import { getAppUrl } from "@/lib/utils";

const EMAIL_MENTION_REGEX =
  /(?:^|[\s(])@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?=$|[\s).,;:!?])/g;

type MentionNotificationInput = {
  teamId: string;
  text?: string | null;
  actorUserId?: string;
  actorName?: string | null;
  itemLabel: string;
  itemPath: string;
};

const truncate = (value: string, maxLength = 220) => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
};

const toAbsoluteUrl = (pathOrUrl: string) => {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const baseUrl = getAppUrl();
  if (!baseUrl) {
    return pathOrUrl;
  }

  return `${baseUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
};

const extractMentionedEmails = (text?: string | null): string[] => {
  if (!text?.trim()) {
    return [];
  }

  EMAIL_MENTION_REGEX.lastIndex = 0;
  const matches = text.matchAll(EMAIL_MENTION_REGEX);
  const emails = new Set<string>();

  for (const match of matches) {
    const email = match[1]?.trim().toLowerCase();
    if (email) {
      emails.add(email);
    }
  }

  return Array.from(emails);
};

const sendTagMentionNotifications = async ({
  teamId,
  text,
  actorUserId,
  actorName,
  itemLabel,
  itemPath,
}: MentionNotificationInput): Promise<number> => {
  const mentionedEmails = extractMentionedEmails(text);
  logger.info(
    {
      teamId,
      actorUserId,
      itemLabel,
      mentionCount: mentionedEmails.length,
      mentionedEmails,
    },
    "Processing mention notifications",
  );

  if (mentionedEmails.length === 0) {
    logger.info(
      {
        teamId,
        itemLabel,
      },
      "No mention notifications to send",
    );
    return 0;
  }

  const mentionedUsers = await prisma.user.findMany({
    where: {
      email: {
        in: mentionedEmails,
      },
      teams: {
        some: {
          id: teamId,
        },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  const recipients = mentionedUsers.filter((user) => user.id !== actorUserId);
  logger.info(
    {
      teamId,
      itemLabel,
      matchedUserCount: mentionedUsers.length,
      recipientCount: recipients.length,
      recipientEmails: recipients.map((recipient) => recipient.email),
    },
    "Resolved mention notification recipients",
  );

  if (recipients.length === 0) {
    logger.warn(
      {
        teamId,
        actorUserId,
        mentionedEmails,
      },
      "Mentions found but no eligible recipients",
    );
    return 0;
  }

  const actorDisplayName = actorName?.trim() || "A teammate";
  const previewText = text ? truncate(text.replace(/\s+/g, " ").trim()) : "";
  const itemUrl = toAbsoluteUrl(itemPath);

  const results = await Promise.allSettled(
    recipients.map((recipient) =>
      sendEmail(
        {
          to: recipient.email,
          subject: `${actorDisplayName} tagged you`,
          template: "tagged-user-notification",
        },
        {
          recipientName: recipient.name || recipient.email,
          actorName: actorDisplayName,
          itemLabel,
          itemUrl,
          previewText,
        },
      ),
    ),
  );

  let sentCount = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      sentCount += 1;
      return;
    }

    logger.error(
      {
        error: result.reason,
        teamId,
        recipientEmail: recipients[index]?.email,
        itemLabel,
      },
      "Failed to send mention notification email",
    );
  });

  logger.info(
    {
      teamId,
      itemLabel,
      attemptedCount: recipients.length,
      sentCount,
      failedCount: recipients.length - sentCount,
    },
    "Completed mention notification processing",
  );

  return sentCount;
};

export { extractMentionedEmails, sendTagMentionNotifications };
