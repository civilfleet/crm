import type { PublicEvent, PublicTeam } from "../public-events/types";

export const SCHEMA_VERSION = 1;
export const PAGE_SIZE = 12;
export type Digests = Record<string, string>;
export type EventDescriptor = { hash: string; path: string; scope: string };
export type ScopeState = {
  hash: string;
  manifest: string;
  count: number;
  files: Digests;
};
export type TeamState = {
  profile: PublicTeam;
  events: Record<string, EventDescriptor>;
  scopes: Record<string, ScopeState>;
  files: Digests;
};
export type FeedState = {
  schemaVersion: number;
  producer: string;
  version: string;
  generatedAt: string;
  teams: Record<string, TeamState>;
  referenceFiles: Digests;
  postalManifest: string | null;
  files: Digests;
};
export type TeamSnapshot = { team: PublicTeam; events: PublicEvent[] };
export type SourceSnapshot = {
  complete: boolean;
  teamIds: string[];
  teams: TeamSnapshot[];
  postal?: Record<string, Record<string, [number, number]>>;
};
export type SearchRecord = { event: PublicEvent; detail: string };
export type SearchIndexer = (
  records: SearchRecord[],
) => Promise<{ path: string; content: Uint8Array }[]>;

export type FeedManifest = {
  schemaVersion: number;
  version: string;
  generatedAt: string;
  registrationApi: string;
  teams: {
    count: number;
    pages: number;
    pageSize: number;
    pageUrlTemplate: string;
  };
  postal: string | null;
};
export type TeamManifest = {
  schemaVersion: number;
  teamId: string;
  version: string;
  team: string;
  eventLookupUrlTemplate: string;
  scopes: Record<string, { manifest: string; count: number }>;
};
export type EventLookupManifest = {
  schemaVersion: number;
  teamId: string;
  eventId: string;
  detailUrl: string;
};
export type ScopeManifest = {
  schemaVersion: number;
  teamId: string;
  scope: string;
  version: string;
  count: number;
  pages: number;
  pageSize: number;
  pageUrlTemplate: string;
  search: { engine: "pagefind"; language: string; moduleUrl: string } | null;
  geo: string;
  filters: { types: string[]; states: string[]; countries: string[] };
};
export type PublicEventSummary = Omit<
  PublicEvent,
  "description" | "latitude" | "longitude" | "excerpt"
> & { excerpt: string; detailUrl: string };
export type ListingPage = {
  schemaVersion: number;
  teamId: string;
  scope: string;
  version: string;
  page: number;
  pageSize: number;
  total: number;
  items: PublicEventSummary[];
};
