/*
  Languages a contact speaks or an organization works in, stored as ISO
  639-1 codes ("ar", "de") so that spelling and filters stay consistent.
  Names come from the browser's or Node's own data (Intl.DisplayNames), in
  English like the rest of the CRM. docs/DATA_RULES.md, "Languages".
*/

/** Every ISO 639-1 code. */
export const LANGUAGE_CODES = [
  "aa", "ab", "ae", "af", "ak", "am", "an", "ar", "as", "av", "ay", "az",
  "ba", "be", "bg", "bi", "bm", "bn", "bo", "br", "bs", "ca", "ce", "ch",
  "co", "cr", "cs", "cu", "cv", "cy", "da", "de", "dv", "dz", "ee", "el",
  "en", "eo", "es", "et", "eu", "fa", "ff", "fi", "fj", "fo", "fr", "fy",
  "ga", "gd", "gl", "gn", "gu", "gv", "ha", "he", "hi", "ho", "hr", "ht",
  "hu", "hy", "hz", "ia", "id", "ie", "ig", "ii", "ik", "io", "is", "it",
  "iu", "ja", "jv", "ka", "kg", "ki", "kj", "kk", "kl", "km", "kn", "ko",
  "kr", "ks", "ku", "kv", "kw", "ky", "la", "lb", "lg", "li", "ln", "lo",
  "lt", "lu", "lv", "mg", "mh", "mi", "mk", "ml", "mn", "mr", "ms", "mt",
  "my", "na", "nb", "nd", "ne", "ng", "nl", "nn", "no", "nr", "nv", "ny",
  "oc", "oj", "om", "or", "os", "pa", "pi", "pl", "ps", "pt", "qu", "rm",
  "rn", "ro", "ru", "rw", "sa", "sc", "sd", "se", "sg", "si", "sk", "sl",
  "sm", "sn", "so", "sq", "sr", "ss", "st", "su", "sv", "sw", "ta", "te",
  "tg", "th", "ti", "tk", "tl", "tn", "to", "tr", "ts", "tt", "tw", "ty",
  "ug", "uk", "ur", "uz", "ve", "vi", "vo", "wa", "wo", "xh", "yi", "yo",
  "za", "zh", "zu",
] as const;

const CODES = new Set<string>(LANGUAGE_CODES);

export const isLanguageCode = (value: string) => CODES.has(value);

const names = new Intl.DisplayNames(["en"], { type: "language" });

/** "ar" → "Arabic"; an unknown code is shown as it is. */
export const languageName = (code: string) => {
  if (!isLanguageCode(code)) return code;
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
};

/** Every language with its name, by name: for pickers. */
export const LANGUAGE_OPTIONS = LANGUAGE_CODES.map((code) => ({
  value: code,
  label: languageName(code),
})).sort((a, b) => a.label.localeCompare(b.label));

/** How well a contact speaks a language, lowest first. */
export const LANGUAGE_LEVELS = [
  "BASIC",
  "CONVERSATIONAL",
  "FLUENT",
  "NATIVE",
] as const;

export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];

export const LANGUAGE_LEVEL_LABELS: Record<LanguageLevel, string> = {
  BASIC: "Basic",
  CONVERSATIONAL: "Conversational",
  FLUENT: "Fluent",
  NATIVE: "Native",
};

/** The levels at or above this one (for "speaks at least …"). */
export const levelsFrom = (level: LanguageLevel) =>
  LANGUAGE_LEVELS.slice(LANGUAGE_LEVELS.indexOf(level));

/** The higher of two levels; a known level beats none. */
export const higherLevel = (
  a: LanguageLevel | null | undefined,
  b: LanguageLevel | null | undefined,
) => {
  if (!a) return b ?? null;
  if (!b) return a;
  return LANGUAGE_LEVELS.indexOf(a) >= LANGUAGE_LEVELS.indexOf(b) ? a : b;
};

export type SpokenLanguage = {
  language: string;
  level?: LanguageLevel | null;
};

/**
 * Lowercased known codes, one entry per language (the higher level wins),
 * in the order given.
 */
export const normalizeSpokenLanguages = (
  languages: SpokenLanguage[] | null | undefined,
): Array<{ language: string; level: LanguageLevel | null }> => {
  const byCode = new Map<string, LanguageLevel | null>();
  for (const entry of languages ?? []) {
    const code = entry.language.trim().toLowerCase();
    if (!isLanguageCode(code)) continue;
    byCode.set(code, higherLevel(byCode.get(code), entry.level));
  }
  return [...byCode].map(([language, level]) => ({ language, level }));
};

/** Lowercased known codes, each once, in the order given. */
export const normalizeLanguageCodes = (codes: string[] | null | undefined) => [
  ...new Set(
    (codes ?? [])
      .map((code) => code.trim().toLowerCase())
      .filter(isLanguageCode),
  ),
];

/** "Arabic (Native), English" */
export const formatSpokenLanguages = (languages: SpokenLanguage[]) =>
  languages
    .map(({ language, level }) =>
      level
        ? `${languageName(language)} (${LANGUAGE_LEVEL_LABELS[level]})`
        : languageName(language),
    )
    .join(", ");

/** "Arabic, English" */
export const formatLanguageCodes = (codes: string[]) =>
  codes.map(languageName).join(", ");
