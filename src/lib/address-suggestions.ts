import { EUROPEAN_COUNTRY_OPTIONS } from "@/lib/countries";

export type AddressSuggestion = {
  id: string;
  label: string;
  address?: string;
  postalCode?: string;
  city?: string;
  state?: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
};

type PhotonProperties = {
  osm_type?: unknown;
  osm_id?: unknown;
  type?: unknown;
  name?: unknown;
  street?: unknown;
  housenumber?: unknown;
  postcode?: unknown;
  city?: unknown;
  town?: unknown;
  village?: unknown;
  locality?: unknown;
  municipality?: unknown;
  state?: unknown;
  country?: unknown;
  countrycode?: unknown;
};

type PhotonFeature = {
  properties?: PhotonProperties;
  geometry?: {
    type?: unknown;
    coordinates?: unknown;
  };
};

export type PhotonFeatureCollection = {
  features?: unknown;
};

const stringValue = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const canonicalCountryName = (code?: string, fallback?: string) => {
  if (!code) return fallback;
  return (
    EUROPEAN_COUNTRY_OPTIONS.find((option) => option.code === code)?.value ??
    fallback
  );
};

const formatStreetAddress = (properties: PhotonProperties) => {
  const street = stringValue(properties.street);
  const houseNumber = stringValue(properties.housenumber);
  if (street) return [street, houseNumber].filter(Boolean).join(" ");

  const type = stringValue(properties.type);
  if (type === "house" || type === "street") {
    return stringValue(properties.name);
  }
  return undefined;
};

const normalizeFeature = (
  feature: PhotonFeature,
  index: number,
): AddressSuggestion | null => {
  const properties = feature.properties ?? {};
  const address = formatStreetAddress(properties);
  if (!address) return null;

  const postalCode = stringValue(properties.postcode);
  const city =
    stringValue(properties.city) ??
    stringValue(properties.town) ??
    stringValue(properties.village) ??
    stringValue(properties.locality) ??
    stringValue(properties.municipality);
  const state = stringValue(properties.state);
  const countryCode = stringValue(properties.countrycode)?.toUpperCase();
  const country = canonicalCountryName(
    countryCode,
    stringValue(properties.country),
  );
  const name = stringValue(properties.name);
  const locality = [postalCode, city].filter(Boolean).join(" ");
  const labelParts = [
    name && name !== address ? name : undefined,
    address,
    locality || undefined,
    country,
  ].filter((part): part is string => Boolean(part));

  const coordinates = feature.geometry?.coordinates;
  const longitude =
    Array.isArray(coordinates) && typeof coordinates[0] === "number"
      ? coordinates[0]
      : undefined;
  const latitude =
    Array.isArray(coordinates) && typeof coordinates[1] === "number"
      ? coordinates[1]
      : undefined;
  const osmType = stringValue(properties.osm_type);
  const osmId =
    typeof properties.osm_id === "string" ||
    typeof properties.osm_id === "number"
      ? String(properties.osm_id)
      : undefined;

  return {
    id: osmType && osmId ? `${osmType}:${osmId}` : `result:${index}`,
    label: labelParts.join(", "),
    address,
    postalCode,
    city,
    state,
    country,
    countryCode,
    latitude,
    longitude,
  };
};

export const normalizePhotonResponse = (
  payload: PhotonFeatureCollection,
): AddressSuggestion[] => {
  if (!Array.isArray(payload.features)) return [];

  return payload.features
    .slice(0, 5)
    .map((feature, index) =>
      feature && typeof feature === "object"
        ? normalizeFeature(feature as PhotonFeature, index)
        : null,
    )
    .filter(
      (suggestion): suggestion is AddressSuggestion => suggestion !== null,
    );
};
