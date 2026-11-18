import { z } from "zod";

/*
  Who a form's confirmation e-mail comes from. Editors set it in Strapi next
  to the e-mail text; the published form file carries it
  (confirmation.senderName, senderLocalPart, replyTo). Only the part before
  the @ comes from the file: the domain is always the one verified in the
  team's Scaleway integration, so a form cannot send as another domain.
  Anything missing or invalid falls back to the team's sender, and the
  e-mail still goes out. docs/PUBLIC_FORMS_INTAKE.md, "Confirmation".
*/

/** Letters, digits, ".", "_", "+", "-"; not starting or ending with "." */
export const SENDER_LOCAL_PART = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;

export type FormSenderFields = {
  senderName?: string;
  senderLocalPart?: string;
  replyTo?: string;
};

export type TeamSender = { email: string; name?: string };

export type ResolvedSender = {
  from: { email: string; name?: string };
  replyTo?: string;
};

const validName = (value?: string) => {
  const name = value?.trim();
  return name && name.length <= 100 && !/[<>"\r\n]/.test(name)
    ? name
    : undefined;
};

const validLocalPart = (value?: string) => {
  const part = value?.trim().toLowerCase();
  return part && SENDER_LOCAL_PART.test(part) ? part : undefined;
};

const validReplyTo = (value?: string) => {
  const address = value?.trim().toLowerCase();
  return address &&
    address.length <= 255 &&
    z.email().safeParse(address).success
    ? address
    : undefined;
};

/**
 * The sender for a form's confirmation e-mail: the form's own, on the
 * team's verified domain, or the team's sender where the form sets none.
 */
export const resolveFormSender = (
  team: TeamSender,
  form: FormSenderFields | null | undefined,
): ResolvedSender => {
  const domain = team.email.split("@").at(-1);
  const localPart = validLocalPart(form?.senderLocalPart);
  return {
    from: {
      email: localPart && domain ? `${localPart}@${domain}` : team.email,
      name: validName(form?.senderName) ?? team.name,
    },
    replyTo: validReplyTo(form?.replyTo),
  };
};
