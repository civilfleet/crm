import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhotonResponse } from "../src/lib/address-suggestions";
import {
  AddressSuggestionProviderError,
  buildPhotonSearchUrl,
  searchAddressSuggestions,
} from "../src/services/address-suggestions";

test("builds a bounded Photon autocomplete request", () => {
  const url = buildPhotonSearchUrl("https://photon.example.test/root/", {
    query: "Pariser Platz 1",
    countryCode: "DE",
    latitude: 52.52,
    longitude: 13.405,
    language: "de",
  });

  assert.equal(url.pathname, "/root/api");
  assert.equal(url.searchParams.get("q"), "Pariser Platz 1");
  assert.equal(url.searchParams.get("limit"), "5");
  assert.deepEqual(url.searchParams.getAll("layer"), ["house", "street"]);
  assert.equal(url.searchParams.get("countrycode"), "DE");
  assert.equal(url.searchParams.get("lat"), "52.52");
  assert.equal(url.searchParams.get("lon"), "13.405");
  assert.equal(url.searchParams.get("location_bias_scale"), "0.4");
  assert.equal(url.searchParams.get("lang"), "de");
});

test("does not send the ChibiGeo secret to a self-hosted Photon URL", async () => {
  const originalBaseUrl = process.env.PHOTON_BASE_URL;
  const originalSecret = process.env.CHIBIGEO_SECRET;
  const originalFetch = globalThis.fetch;
  let requestHeaders: Headers | undefined;

  process.env.PHOTON_BASE_URL = "https://photon.internal.example";
  process.env.CHIBIGEO_SECRET = "must-not-leak";
  globalThis.fetch = async (_input, init) => {
    requestHeaders = new Headers(init?.headers);
    return Response.json({ features: [] });
  };

  try {
    await searchAddressSuggestions({ query: "Pariser Platz" });
    assert.equal(requestHeaders?.get("X-Api-Key"), null);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.PHOTON_BASE_URL;
    else process.env.PHOTON_BASE_URL = originalBaseUrl;
    if (originalSecret === undefined) delete process.env.CHIBIGEO_SECRET;
    else process.env.CHIBIGEO_SECRET = originalSecret;
  }
});

test("fails closed when ChibiGeo is missing its secret", async () => {
  const originalBaseUrl = process.env.PHOTON_BASE_URL;
  const originalSecret = process.env.CHIBIGEO_SECRET;
  process.env.PHOTON_BASE_URL = "https://app.chibigeo.com/v1/photon";
  delete process.env.CHIBIGEO_SECRET;

  try {
    await assert.rejects(
      searchAddressSuggestions({ query: "Pariser Platz" }),
      (error: unknown) =>
        error instanceof AddressSuggestionProviderError && error.status === 503,
    );
  } finally {
    if (originalBaseUrl === undefined) delete process.env.PHOTON_BASE_URL;
    else process.env.PHOTON_BASE_URL = originalBaseUrl;
    if (originalSecret === undefined) delete process.env.CHIBIGEO_SECRET;
    else process.env.CHIBIGEO_SECRET = originalSecret;
  }
});

test("normalizes a complete Photon house result", () => {
  const suggestions = normalizePhotonResponse({
    features: [
      {
        properties: {
          osm_type: "W",
          osm_id: 518071791,
          type: "house",
          name: "Brandenburger Tor",
          street: "Pariser Platz",
          housenumber: "1",
          postcode: "10117",
          city: "Berlin",
          state: "Berlin",
          country: "Deutschland",
          countrycode: "de",
        },
        geometry: {
          type: "Point",
          coordinates: [13.3777034, 52.5162699],
        },
      },
    ],
  });

  assert.deepEqual(suggestions, [
    {
      id: "W:518071791",
      label: "Brandenburger Tor, Pariser Platz 1, 10117 Berlin, Germany",
      address: "Pariser Platz 1",
      postalCode: "10117",
      city: "Berlin",
      state: "Berlin",
      country: "Germany",
      countryCode: "DE",
      latitude: 52.5162699,
      longitude: 13.3777034,
    },
  ]);
});

test("keeps street-only results and uses locality fallbacks", () => {
  const suggestions = normalizePhotonResponse({
    features: [
      {
        properties: {
          type: "street",
          name: "Rue de Rivoli",
          postcode: "75001",
          locality: "Paris",
          country: "France",
          countrycode: "FR",
        },
      },
    ],
  });

  assert.equal(suggestions[0]?.address, "Rue de Rivoli");
  assert.equal(suggestions[0]?.city, "Paris");
  assert.equal(suggestions[0]?.country, "France");
});

test("does not invent missing fields or accept non-address places", () => {
  const suggestions = normalizePhotonResponse({
    features: [
      {
        properties: {
          type: "house",
          street: "Via Roma",
          country: "Italia",
          countrycode: "IT",
        },
      },
      {
        properties: {
          type: "city",
          name: "Rome",
          country: "Italia",
          countrycode: "IT",
        },
      },
      null,
    ],
  });

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.address, "Via Roma");
  assert.equal(suggestions[0]?.postalCode, undefined);
  assert.equal(suggestions[0]?.city, undefined);
  assert.equal(suggestions[0]?.country, "Italy");
});

test("returns an empty list for malformed responses", () => {
  assert.deepEqual(normalizePhotonResponse({}), []);
  assert.deepEqual(normalizePhotonResponse({ features: "invalid" }), []);
});
