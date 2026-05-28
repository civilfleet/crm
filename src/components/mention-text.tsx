import Link from "next/link";
import type { ReactNode } from "react";

type MentionUser = {
  id: string;
  name?: string | null;
  email: string;
};

const MENTION_EMAIL_REGEX =
  /(?:^|[\s(])@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?=$|[\s).,;:!?])/g;

interface MentionTextProps {
  text: string;
  teamId: string;
  usersByEmail: Map<string, MentionUser>;
}

export default function MentionText({
  text,
  teamId,
  usersByEmail,
}: MentionTextProps) {
  const segments: ReactNode[] = [];
  let lastIndex = 0;
  let match = MENTION_EMAIL_REGEX.exec(text);

  while (match !== null) {
    const matchedText = match[0] ?? "";
    const mentionedEmail = match[1] ?? "";
    const mentionStart = match.index + matchedText.lastIndexOf("@");
    const mentionEnd = mentionStart + mentionedEmail.length + 1;

    if (mentionStart > lastIndex) {
      segments.push(text.slice(lastIndex, mentionStart));
    }

    const normalizedEmail = mentionedEmail.toLowerCase();
    const mentionedUser = usersByEmail.get(normalizedEmail);

    if (mentionedUser) {
      segments.push(
        <Link
          key={`${mentionStart}-${mentionEnd}`}
          href={`/teams/${teamId}/users/${mentionedUser.id}`}
          className="font-medium text-foreground underline underline-offset-2 hover:text-foreground"
          title={mentionedUser.email}
        >
          @{mentionedUser.name?.trim() || mentionedUser.email}
        </Link>,
      );
    } else {
      segments.push(
        <span
          key={`${mentionStart}-${mentionEnd}`}
          className="text-muted-foreground"
          title="Mentioned user is not available"
        >
          @{mentionedEmail}
        </span>,
      );
    }

    lastIndex = mentionEnd;
    match = MENTION_EMAIL_REGEX.exec(text);
  }

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex));
  }

  return <>{segments}</>;
}