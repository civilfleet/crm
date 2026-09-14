import { normalizeCountryCode } from "@/lib/countries";

export const CONTACT_PASTE_FIELDS = {
  name: "Full name",
  pronouns: "Pronouns",
  email: "Email",
  phone: "Phone",
  signal: "Signal",
  website: "Website",
  address: "Street address",
  postalCode: "Postal code",
  city: "City",
  state: "State / region",
  country: "Country",
} as const;

export type ContactPasteField = keyof typeof CONTACT_PASTE_FIELDS;
export type ContactPasteValues = Partial<Record<ContactPasteField, string>>;
export const CONTACT_PASTE_MAX_LENGTH = 4000;

const labels: Record<string, ContactPasteField> = {
  name: "name",
  pronouns: "pronouns",
  pronomen: "pronouns",
  "full name": "name",
  "vollständiger name": "name",
  email: "email",
  "e-mail": "email",
  mail: "email",
  phone: "phone",
  telephone: "phone",
  tel: "phone",
  telefon: "phone",
  mobile: "phone",
  mobil: "phone",
  signal: "signal",
  website: "website",
  web: "website",
  homepage: "website",
  internet: "website",
  address: "address",
  adresse: "address",
  street: "address",
  straße: "address",
  strasse: "address",
  "postal code": "postalCode",
  postcode: "postalCode",
  zip: "postalCode",
  plz: "postalCode",
  city: "city",
  stadt: "city",
  ort: "city",
  state: "state",
  region: "state",
  bundesland: "state",
  country: "country",
  land: "country",
};

function normalizeWebsite(value: string) {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return /^https?:$/.test(url.protocol) &&
      url.hostname.includes(".") &&
      !url.username &&
      !url.password
      ? candidate
      : undefined;
  } catch {
    return undefined;
  }
}

function isContactChannelLine(line: string) {
  const value = line.replace(
    /^(?:e-?mail|mail|phone|telephone|tel\.?|telefon|mobile|mobil|signal|website|web|homepage|t|m|e|w)(?:\s*:\s*|\s+)/i,
    "",
  );
  if (/^[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+$/u.test(value))
    return true;
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(value))
    return Boolean(normalizeWebsite(value));
  return (
    /^(?:\+\d|\(\+?\d|0\d)[\d\s()./-]+\d$/.test(value) &&
    (value.match(/\d/g)?.length ?? 0) >= 7
  );
}

const germanStreetPattern =
  /^[\p{L} .’'-]+(?:straße|strasse|str\.|weg|platz|allee)\s+\d+[a-z]?(?:\s*[-/]\s*\d+)?$/iu;
const postalCityPattern = /^(?:D-)?(\d{5})\s+([\p{L}][\p{L}\s.'’-]+)$/u;

function parseAddressLine(line: string): ContactPasteValues | undefined {
  const postalCity = line.match(postalCityPattern);
  if (postalCity) return { postalCode: postalCity[1], city: postalCity[2] };
  if (germanStreetPattern.test(line)) return { address: line };
  const combined = line.match(/^(.+?)(?:,\s*|\s+)((?:D-)?\d{5}\s+.+)$/u);
  const locality = combined?.[2].match(postalCityPattern);
  if (combined && locality && germanStreetPattern.test(combined[1].trim())) {
    return {
      address: combined[1].trim(),
      postalCode: locality[1],
      city: locality[2],
    };
  }
  return undefined;
}

function emailSupportsName(name: string, email?: string) {
  if (!email) return false;
  const emailParts = email
    .split("@")[0]
    .toLowerCase()
    .split(/[._+-]+/);
  // Accept common German email spellings without changing the displayed name.
  const spellings = [
    name,
    name.replace(/ä/gi, "ae").replace(/ö/gi, "oe").replace(/ü/gi, "ue"),
  ];
  return spellings.some((spelling) => {
    const nameParts = spelling
      .toLowerCase()
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    return (
      nameParts.every((part, index) => part === emailParts[index]) ||
      nameParts.join("") === emailParts[0]
    );
  });
}

export function parseContactPaste(text: string): ContactPasteValues {
  const values: ContactPasteValues = {};
  const lines = text
    .slice(0, CONTACT_PASTE_MAX_LENGTH)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const labelled = line.match(/^([^:]{1,30}):\s*(.+)$/);
    const label = labelled?.[1].trim().toLowerCase().replace(/\.$/, "");
    const field =
      label && Object.hasOwn(labels, label) ? labels[label] : undefined;
    if (field && labelled && !values[field]) values[field] = labelled[2].trim();
  }
  const source = lines.join("\n");
  const email = source.match(/[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/);
  if (email) values.email = email[0];
  const websiteSource = lines
    .filter(
      (line) =>
        !/^(?:instagram|twitter|facebook|linkedin|mastodon|bluesky)\s*:/i.test(
          line,
        ),
    )
    .join("\n");
  const website = websiteSource
    .match(/(?:https?:\/\/|www\.)[^\s<>"]+/i)?.[0]
    .replace(/[.,;!?)]+$/, "");
  if (values.website || website)
    values.website = normalizeWebsite(values.website || website || "");
  if (!values.phone) {
    for (const line of lines) {
      // Require a phone-like prefix; do not mistake dates or postal codes for phones.
      const match = line.match(
        /(?:^|\s)((?:\+\d|\(\+?\d|0\d)[\d\s()./-]{5,}\d)(?:$|\s)/,
      );
      if (match && (match[1].match(/\d/g)?.length ?? 0) >= 7) {
        values.phone = match[1].trim();
        break;
      }
    }
  }
  for (const line of lines) {
    const address = parseAddressLine(line);
    if (address) {
      if (address.address) values.address ||= address.address;
      if (address.postalCode) values.postalCode ||= address.postalCode;
      if (address.city) values.city ||= address.city;
    }
    if (!values.country && normalizeCountryCode(line)) values.country = line;
  }
  // Use independent evidence: a matching email or a structured address block.
  // Matching email names remain useful across job titles and company details.
  // Email, phone and website lines can appear anywhere within the address block.
  // Keep other text so a second person or an unrelated paragraph stays ambiguous.
  const firstLine = values.name || lines[0] || "";
  const explicitPronouns = firstLine.match(
    /\(\s*((?:she|he|they|her|him|them|sie|ihr|er|ihm|hen|dey)(?:\s*\/\s*(?:she|he|they|her|him|them|sie|ihr|er|ihm|hen|dey)){1,2})\s*\)/i,
  );
  let candidate = firstLine;
  if (explicitPronouns) {
    values.pronouns ||= explicitPronouns[1].replace(/\s*\/\s*/g, "/");
    candidate = candidate
      .replace(explicitPronouns[0], "")
      .replace(/\(\s*what[’']s this\?\s*\)/gi, "")
      .trim();
    if (values.name) values.name = candidate;
  }
  const untitledName = candidate.replace(
    /^(?:(?:Dr\.|Prof\.|med\.|dent\.|rer\.|nat\.|Mr\.|Mrs\.|Ms\.)\s+)+/i,
    "",
  );
  const hasTitle = untitledName !== candidate;

  const addressLines = lines
    .slice(1)
    .filter((line) => !isContactChannelLine(line));
  const firstAddress = parseAddressLine(addressLines[0] ?? "");
  const followingAddress = parseAddressLine(addressLines[1] ?? "");
  const hasAddressBlock = Boolean(
    firstAddress?.address &&
      (firstAddress.postalCode || followingAddress?.postalCode),
  );
  if (
    !values.name &&
    candidate &&
    (hasAddressBlock ||
      emailSupportsName(untitledName, values.email) ||
      (hasTitle &&
        Boolean(values.email) &&
        values.email?.split("@")[0].toLowerCase() ===
          untitledName.split(/\s+/)[0].toLowerCase())) &&
    /^[\p{L}\p{M}][\p{L}\p{M}'’.-]*(?:\s+[\p{L}\p{M}][\p{L}\p{M}'’.-]*){1,5}$/u.test(
      untitledName,
    ) &&
    !/\b(?:contact|kontakt|address|adresse|impressum|team|office|service|support|gmbh|ltd|inc|llc|company|verein|stiftung|sales|manager|director|marketing|vertrieb|and|und)\b|\be\.?\s*v\.?$/i.test(
      candidate,
    )
  ) {
    values.name = candidate;
  }
  return values;
}

export type ContactEntityToken = {
  entity: string;
  word: string;
  score: number;
  index: number;
};

// Align all tokens (including O) with the original text to preserve spelling and casing.
export function extractContactName(
  text: string,
  tokens: ContactEntityToken[],
): string | undefined {
  const offsets: number[] = [];
  let normalized = "";
  for (let index = 0; index < text.length; index++) {
    const letters = text[index]
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase();
    normalized += letters;
    for (const _letter of letters) offsets.push(index);
  }
  let cursor = 0;
  let scores: number[] = [];
  let start = -1;
  let end = -1;
  let previousIndex = -1;
  const names: string[] = [];
  const flush = () => {
    if (
      start >= 0 &&
      scores.every((score) => score >= 0.7) &&
      scores.reduce((sum, score) => sum + score, 0) / scores.length >= 0.75
    ) {
      names.push(text.slice(start, end));
    }
    start = -1;
    scores = [];
  };
  for (const token of tokens) {
    const word = token.word.replace(/^##/, "");
    if (!word || word.startsWith("[")) {
      flush();
      continue;
    }
    const position = normalized.indexOf(word.toLowerCase(), cursor);
    if (position < 0) {
      flush();
      continue;
    }
    cursor = position + word.length;
    const person = /^(?:B-|I-)?(?:PERSON|PER)$/.test(token.entity);
    if (!person) {
      flush();
      continue;
    }
    if (
      start >= 0 &&
      (token.index !== previousIndex + 1 ||
        (token.entity.startsWith("B-") && !token.word.startsWith("##")) ||
        /\n/.test(text.slice(end, offsets[position])))
    )
      flush();
    if (start < 0) {
      if (token.entity.startsWith("I-")) continue;
      start = offsets[position];
    }
    end = offsets[cursor - 1] + 1;
    scores.push(token.score);
    previousIndex = token.index;
  }
  flush();
  // Multiple people in one paste are ambiguous; let the user choose a name manually.
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  return unique.length === 1 ? unique[0] : undefined;
}

export type ContactPasteWorkerMessage =
  | { type: "status"; message: string }
  | { type: "result"; name?: string }
  | { type: "error" };
