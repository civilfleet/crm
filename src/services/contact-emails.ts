import { ContactEmailKind } from "@/types";

type ContactEmailLike = {
  email: string;
  kind?: ContactEmailKind | "PRIMARY" | "ALIAS" | "SHARED";
};

type ContactWithEmails = {
  emails?: ContactEmailLike[];
};

const primaryContactEmailSelect = {
  where: { kind: ContactEmailKind.PRIMARY },
  take: 1,
  select: { email: true },
} as const;

const getPrimaryEmail = (contact?: ContactWithEmails | null) =>
  contact?.emails?.find(
    (entry) => !entry.kind || entry.kind === ContactEmailKind.PRIMARY,
  )?.email;

export { getPrimaryEmail, primaryContactEmailSelect };
