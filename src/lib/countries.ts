type CountryEntry = {
  code: string;
  names: string[];
};

export const EUROPEAN_COUNTRIES: CountryEntry[] = [
  { code: "AL", names: ["Albania", "Shqiperia", "Shqipëria"] },
  { code: "AD", names: ["Andorra"] },
  { code: "AT", names: ["Austria", "Oesterreich", "Österreich"] },
  { code: "BY", names: ["Belarus"] },
  { code: "BE", names: ["Belgium", "Belgie", "Belgique", "België"] },
  { code: "BA", names: ["Bosnia and Herzegovina", "Bosnia", "Herzegovina"] },
  { code: "BG", names: ["Bulgaria"] },
  { code: "HR", names: ["Croatia", "Hrvatska"] },
  { code: "CY", names: ["Cyprus"] },
  { code: "CZ", names: ["Czechia", "Czech Republic"] },
  { code: "DK", names: ["Denmark", "Danmark"] },
  { code: "EE", names: ["Estonia", "Eesti"] },
  { code: "FI", names: ["Finland", "Suomi"] },
  { code: "FR", names: ["France"] },
  { code: "DE", names: ["Germany", "Deutschland"] },
  { code: "GR", names: ["Greece", "Hellas", "Ελλάδα"] },
  { code: "HU", names: ["Hungary", "Magyarorszag", "Magyarország"] },
  { code: "IS", names: ["Iceland", "Island"] },
  { code: "IE", names: ["Ireland", "Eire", "Éire"] },
  { code: "IT", names: ["Italy", "Italia"] },
  { code: "XK", names: ["Kosovo"] },
  { code: "LV", names: ["Latvia", "Latvija"] },
  { code: "LI", names: ["Liechtenstein"] },
  { code: "LT", names: ["Lithuania", "Lietuva"] },
  { code: "LU", names: ["Luxembourg", "Luxemburg", "Luxembourg"] },
  { code: "MT", names: ["Malta"] },
  { code: "MD", names: ["Moldova", "Republic of Moldova"] },
  { code: "MC", names: ["Monaco"] },
  { code: "ME", names: ["Montenegro", "Crna Gora"] },
  {
    code: "NL",
    names: ["Netherlands", "Nederland", "The Netherlands", "Holland"],
  },
  { code: "MK", names: ["North Macedonia", "Macedonia", "Severna Makedonija"] },
  { code: "NO", names: ["Norway", "Norge", "Noreg"] },
  { code: "PL", names: ["Poland", "Polska"] },
  { code: "PT", names: ["Portugal"] },
  { code: "RO", names: ["Romania", "România"] },
  { code: "RU", names: ["Russia", "Russian Federation"] },
  { code: "SM", names: ["San Marino"] },
  { code: "RS", names: ["Serbia", "Srbija"] },
  { code: "SK", names: ["Slovakia", "Slovak Republic", "Slovensko"] },
  { code: "SI", names: ["Slovenia", "Slovenija"] },
  { code: "ES", names: ["Spain", "Espana", "España"] },
  { code: "SE", names: ["Sweden", "Sverige"] },
  { code: "CH", names: ["Switzerland", "Schweiz", "Suisse", "Svizzera"] },
  { code: "TR", names: ["Turkey", "Türkiye", "Turkiye"] },
  { code: "UA", names: ["Ukraine", "Ukraina", "Україна"] },
  { code: "GB", names: ["United Kingdom", "UK", "Great Britain", "Britain"] },
  { code: "VA", names: ["Vatican City", "Holy See"] },
];

const COUNTRY_CODE_SET = new Set(
  EUROPEAN_COUNTRIES.map((entry) => entry.code.toUpperCase()),
);

const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const COUNTRY_NAME_MAP = (() => {
  const map = new Map<string, string>();
  EUROPEAN_COUNTRIES.forEach((entry) => {
    map.set(entry.code.toLowerCase(), entry.code);
    map.set(entry.code.toUpperCase(), entry.code);
    entry.names.forEach((name) => {
      map.set(normalizeName(name), entry.code);
    });
  });
  return map;
})();

export const normalizeCountryCode = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && COUNTRY_CODE_SET.has(upper)) {
    return upper;
  }

  const normalized = normalizeName(trimmed);
  return COUNTRY_NAME_MAP.get(normalized);
};

export const EUROPEAN_COUNTRY_CODES = EUROPEAN_COUNTRIES.map(
  (entry) => entry.code,
);

export const EUROPEAN_COUNTRY_OPTIONS = EUROPEAN_COUNTRIES.map((entry) => ({
  value: entry.names[0] ?? entry.code,
  label: `${entry.names[0] ?? entry.code} (${entry.code})`,
  code: entry.code,
}));
