import type { TaggableEntityType } from "@/types";

export const MAX_TAG_NAME_LENGTH = 64;

const canonicalizeTagText = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/^#+/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");

export const normalizeTagSearchQuery = (value: string) =>
  canonicalizeTagText(value).slice(0, MAX_TAG_NAME_LENGTH);

export const normalizeTagName = (value: string) => {
  const name = canonicalizeTagText(value);

  if (!name) {
    throw new Error("Tag name is required");
  }
  if (name.length > MAX_TAG_NAME_LENGTH) {
    throw new Error(
      `Tag names can be at most ${MAX_TAG_NAME_LENGTH} characters`,
    );
  }
  if (/\p{Cc}/u.test(name)) {
    throw new Error("Tag names cannot contain control characters");
  }

  return name;
};

export const normalizeTagNames = (values: string[]) =>
  [...new Set(values.map(normalizeTagName))].sort((left, right) =>
    left.localeCompare(right),
  );

export const TAG_ENTITY_LABELS: Record<TaggableEntityType, string> = {
  CONTACT: "Contact",
  ORGANIZATION: "Organization",
  CONTACT_LIST: "List",
  CONTACT_ENGAGEMENT: "Interaction",
  ORGANIZATION_ENGAGEMENT: "Interaction",
  EVENT: "Event",
  FILE: "File",
};
