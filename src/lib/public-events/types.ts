export type PublicEvent = {
  id: string;
  teamId: string;
  slug: string;
  title: string;
  description: string;
  location: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string | null;
  isOnline: boolean;
  startDate: string;
  endDate: string | null;
  timeZone: string;
  eventType: string;
  latitude: number | null;
  longitude: number | null;
  excerpt?: string;
};

export type PublicTeam = {
  id: string;
  name: string;
  email: string;
  website: string | null;
};
export type PublicSnapshot = {
  version: string;
  generatedAt: string;
  teams: PublicTeam[];
  events: PublicEvent[];
};
export type GeoShard = {
  path: string;
  teamId: string;
  scope: string;
  bounds: [number, number, number, number];
};
export type GeoPoint = { id: string; latitude: number; longitude: number };
export type EventManifest = {
  version: string;
  generatedAt: string;
  years: string[];
  dates: string[];
  types: string[];
  states: string[];
  countries: string[];
  pages: Record<string, number>;
  counts: Record<string, number>;
  geoIndexes: Record<string, string>;
};

export const eventPath = (event: Pick<PublicEvent, "teamId" | "slug">) =>
  `/public/${encodeURIComponent(event.teamId)}/events/${encodeURIComponent(event.slug)}/`;
export const isPast = (
  event: Pick<PublicEvent, "startDate" | "endDate">,
  now = Date.now(),
) => Date.parse(event.endDate ?? event.startDate) < now;

export const normalizePostal = (postal: string) =>
  postal.trim().toUpperCase().replace(/\s+/g, " ");
export const postalShard = (country: string, postal: string) =>
  `${country.toUpperCase()}/${encodeURIComponent(normalizePostal(postal).slice(0, 2))}.json`;
