import {
  type AddressSuggestion,
  normalizePhotonResponse,
  type PhotonFeatureCollection,
} from "@/lib/address-suggestions";

const DEFAULT_PHOTON_BASE_URL = "https://app.chibigeo.com/v1/photon";
const REQUEST_TIMEOUT_MS = 5_000;

export class AddressSuggestionProviderError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AddressSuggestionProviderError";
  }
}

export type SearchAddressSuggestionsInput = {
  query: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  language?: string;
};

export const buildPhotonSearchUrl = (
  baseUrl: string,
  {
    query,
    countryCode,
    latitude,
    longitude,
    language,
  }: SearchAddressSuggestionsInput,
) => {
  let endpoint: URL;
  try {
    endpoint = new URL(`${baseUrl.replace(/\/$/, "")}/api`);
  } catch {
    throw new AddressSuggestionProviderError(
      503,
      "Address suggestions are not configured",
    );
  }
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
    throw new AddressSuggestionProviderError(
      503,
      "Address suggestions are not configured",
    );
  }

  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("limit", "5");
  endpoint.searchParams.append("layer", "house");
  endpoint.searchParams.append("layer", "street");
  if (countryCode) endpoint.searchParams.set("countrycode", countryCode);
  if (latitude !== undefined && longitude !== undefined) {
    endpoint.searchParams.set("lat", String(latitude));
    endpoint.searchParams.set("lon", String(longitude));
    endpoint.searchParams.set("location_bias_scale", "0.4");
  }
  if (language) endpoint.searchParams.set("lang", language);
  return endpoint;
};

export const searchAddressSuggestions = async ({
  query,
  countryCode,
  latitude,
  longitude,
  language,
}: SearchAddressSuggestionsInput): Promise<AddressSuggestion[]> => {
  const configuredBaseUrl = process.env.PHOTON_BASE_URL?.trim();
  const baseUrl = configuredBaseUrl || DEFAULT_PHOTON_BASE_URL;
  const secret = process.env.CHIBIGEO_SECRET?.trim();
  const endpoint = buildPhotonSearchUrl(baseUrl, {
    query,
    countryCode,
    latitude,
    longitude,
    language,
  });
  const isChibiGeo = endpoint.hostname === "app.chibigeo.com";
  if (isChibiGeo && !secret) {
    throw new AddressSuggestionProviderError(
      503,
      "Address suggestions are not configured",
    );
  }

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        ...(isChibiGeo && secret ? { "X-Api-Key": secret } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 429) {
      throw new AddressSuggestionProviderError(
        429,
        "Address suggestion limit reached. Enter the address manually.",
      );
    }
    if (!response.ok) {
      throw new AddressSuggestionProviderError(
        503,
        "Address suggestions are temporarily unavailable",
      );
    }

    const payload = (await response.json()) as PhotonFeatureCollection;
    return normalizePhotonResponse(payload);
  } catch (error) {
    if (error instanceof AddressSuggestionProviderError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new AddressSuggestionProviderError(
        504,
        "Address suggestions timed out. Enter the address manually.",
      );
    }
    throw new AddressSuggestionProviderError(
      503,
      "Address suggestions are temporarily unavailable",
    );
  }
};
