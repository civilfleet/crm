import type { VCard } from "@pipobscure/vcard";

export type VCardEmail = {
  email: string;
  label?: string;
};

export type VCardContact = {
  name: string;
  email?: string;
  additionalEmails: VCardEmail[];
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  state?: string;
  country?: string;
  website?: string;
  notes?: string;
  warnings: string[];
};

const preferredFirst = <T extends { pref?: number }>(values: T[]) =>
  values
    .map((value, index) => ({ value, index }))
    .sort(
      (left, right) =>
        (left.value.pref ?? Number.MAX_SAFE_INTEGER) -
          (right.value.pref ?? Number.MAX_SAFE_INTEGER) ||
        left.index - right.index,
    )
    .map(({ value }) => value);

const normalizeEmail = (email: string) =>
  email
    .trim()
    .replace(/^mailto:/i, "")
    .toLowerCase();

const normalizePhone = (phone: string) => {
  const trimmed = phone.trim();
  if (!trimmed.toLowerCase().startsWith("tel:")) {
    return trimmed;
  }

  try {
    return decodeURIComponent(trimmed.slice(4));
  } catch {
    return trimmed.slice(4);
  }
};

const buildStructuredName = (card: VCard) => {
  const name = card.n?.value;
  if (!name) {
    return "";
  }

  return [
    ...name.honorificPrefixes,
    ...name.givenNames,
    ...name.additionalNames,
    ...name.familyNames,
    ...name.honorificSuffixes,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
};

export const parseVCardContacts = async (
  text: string,
): Promise<VCardContact[]> => {
  // The package only exports an ESM entry; tsx also loads this file from CommonJS.
  const { VCard } = await import("@pipobscure/vcard");
  return VCard.parse(text.replace(/^\uFEFF/, "")).map((card) => {
    const emails = preferredFirst(card.email)
      .map((property) => ({
        email: normalizeEmail(property.value),
        label: property.type.length
          ? property.type.map((type) => type.toLowerCase()).join(", ")
          : undefined,
      }))
      .filter(({ email }) => Boolean(email))
      .filter(
        ({ email }, index, values) =>
          values.findIndex((value) => value.email === email) === index,
      );
    const phoneProperty = preferredFirst(card.tel)[0];
    const addressProperty = preferredFirst(card.adr)[0];
    const addressParts = addressProperty
      ? [
          addressProperty.value.streetAddress,
          addressProperty.value.extendedAddress,
          addressProperty.value.postOfficeBox,
        ]
          .map((part) => part.trim())
          .filter(Boolean)
      : [];

    return {
      name: (card.displayName || buildStructuredName(card)).trim(),
      email: emails[0]?.email,
      additionalEmails: emails.slice(1),
      phone: phoneProperty
        ? normalizePhone(phoneProperty.value) || undefined
        : undefined,
      address: addressParts.length ? addressParts.join(", ") : undefined,
      postalCode: addressProperty?.value.postalCode.trim() || undefined,
      city: addressProperty?.value.locality.trim() || undefined,
      state: addressProperty?.value.region.trim() || undefined,
      country: addressProperty?.value.countryName.trim() || undefined,
      website: preferredFirst(card.url)[0]?.value.trim() || undefined,
      notes:
        card.note
          .map((note) => note.value.trim())
          .filter(Boolean)
          .join("\n") || undefined,
      warnings: card.parseWarnings.map((warning) => warning.message),
    };
  });
};
