"use client";

import { format } from "date-fns";
import { Calendar, MapPin, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
import { EUROPEAN_COUNTRY_OPTIONS } from "@/lib/countries";
import type { EventType } from "@/types";

type PublicEvent = {
  id: string;
  teamId: string;
  title: string;
  slug?: string;
  description?: string;
  location?: string;
  isOnline?: boolean;
  expectedGuests?: number;
  hasRemuneration?: boolean;
  address?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  timeZone?: string;
  merchNeeded?: boolean;
  startDate: string | Date;
  endDate?: string | Date;
  eventType?: {
    id: string;
    name: string;
    color?: string;
  };
};

type PublicEventsResponse = {
  data: PublicEvent[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
};

const PAGE_SIZE = 12;
const fetcher = (url: string) => fetch(url).then((res) => res.json());

const formatEventDate = (event: PublicEvent) => {
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : null;

  if (end && start.toDateString() === end.toDateString()) {
    return `${format(start, "EEE, MMM d")} · ${format(start, "HH:mm")}–${format(end, "HH:mm")}`;
  }

  if (end) {
    return `${format(start, "EEE, MMM d")} → ${format(end, "EEE, MMM d")}`;
  }

  return `${format(start, "EEE, MMM d")} · ${format(start, "HH:mm")}`;
};

const buildLocationLabel = (event: PublicEvent) => {
  if (event.isOnline) {
    return "Online";
  }

  const parts = [
    event.location,
    event.address,
    event.postalCode,
    event.city,
    event.state,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "Location TBD";
};

export default function PublicEventsExplorer({ teamId }: { teamId: string }) {
  const [query, setQuery] = useState("");
  const [eventTypeId, setEventTypeId] = useState("all");
  const [stateFilter, setStateFilter] = useState("");
  const [isOnline, setIsOnline] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [countryCode, setCountryCode] = useState("DE");
  const [radiusKm, setRadiusKm] = useState("50");
  const [page, setPage] = useState(1);

  const debouncedQuery = useDebounce(query, 300);

  const filtersKey = useMemo(
    () =>
      [
        debouncedQuery,
        eventTypeId,
        stateFilter,
        isOnline,
        fromDate,
        toDate,
        postalCode,
        countryCode,
        radiusKm,
      ].join("|"),
    [
      debouncedQuery,
      eventTypeId,
      stateFilter,
      isOnline,
      fromDate,
      toDate,
      postalCode,
      countryCode,
      radiusKm,
    ],
  );

  useEffect(() => {
    setPage(1);
  }, [filtersKey]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) {
      params.set("query", debouncedQuery.trim());
    }
    if (eventTypeId !== "all") {
      params.set("eventTypeId", eventTypeId);
    }
    if (stateFilter.trim()) {
      params.set("state", stateFilter.trim());
    }
    if (isOnline !== "all") {
      params.set("isOnline", isOnline);
    }
    if (fromDate) {
      params.set("from", fromDate);
    }
    if (toDate) {
      params.set("to", toDate);
    }
    if (postalCode.trim() && countryCode.trim() && radiusKm.trim()) {
      params.set("postalCode", postalCode.trim());
      params.set("countryCode", countryCode.trim());
      params.set("radiusKm", radiusKm.trim());
    }
    params.set("page", page.toString());
    params.set("pageSize", PAGE_SIZE.toString());
    return params.toString();
  }, [
    debouncedQuery,
    eventTypeId,
    stateFilter,
    isOnline,
    fromDate,
    toDate,
    postalCode,
    countryCode,
    radiusKm,
    page,
  ]);

  const { data: eventsData, isLoading } = useSWR<PublicEventsResponse>(
    `/api/public/events/${teamId}?${queryString}`,
    fetcher,
  );

  const { data: eventTypesData } = useSWR(
    `/api/event-types?teamId=${teamId}`,
    fetcher,
  );

  const { data: teamData } = useSWR(`/api/public/teams/${teamId}`, fetcher);

  const eventTypes: EventType[] = eventTypesData?.data || [];
  const events = eventsData?.data || [];
  const meta = eventsData?.meta;
  const totalPages = meta?.totalPages || 1;

  const handleClearFilters = () => {
    setQuery("");
    setEventTypeId("all");
    setStateFilter("");
    setIsOnline("all");
    setFromDate("");
    setToDate("");
    setPostalCode("");
    setCountryCode("DE");
    setRadiusKm("50");
  };

  return (
    <div className="px-4 pb-16 pt-10 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
            >
              Public Events
            </Badge>
            <span className="text-xs uppercase tracking-[0.3em] text-emerald-950/70">
              {teamData?.name || "Community"}
            </span>
          </div>
          <h1 className="text-4xl font-semibold leading-tight text-emerald-950 sm:text-5xl font-[var(--font-display)]">
            Find the next action near you
          </h1>
          <p className="max-w-2xl text-sm text-emerald-950/70 sm:text-base">
            Browse public workshops, talks, and actions. Filter by place, type,
            or distance to discover events that match your interests.
          </p>
        </header>

        <section className="rounded-3xl border border-emerald-900/10 bg-white/70 p-5 shadow-[0_20px_60px_rgba(16,24,40,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-emerald-900/50" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title, place, or keyword"
                className="pl-9"
              />
            </div>
            <div className="min-w-[180px]">
              <Select value={eventTypeId} onValueChange={setEventTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Event type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {eventTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Select value={isOnline} onValueChange={setIsOnline}>
                <SelectTrigger>
                  <SelectValue placeholder="Format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Online + Offline</SelectItem>
                  <SelectItem value="true">Online only</SelectItem>
                  <SelectItem value="false">Offline only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Input
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
                placeholder="State"
              />
            </div>
            <div className="min-w-[150px]">
              <Input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                placeholder="From"
              />
            </div>
            <div className="min-w-[150px]">
              <Input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                placeholder="To"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[160px]">
              <Input
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
                placeholder="Postal code"
              />
            </div>
            <div className="min-w-[180px]">
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent>
                  {EUROPEAN_COUNTRY_OPTIONS.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px]">
              <Input
                type="number"
                min={1}
                value={radiusKm}
                onChange={(event) => setRadiusKm(event.target.value)}
                placeholder="Radius (km)"
              />
            </div>
            <Button variant="ghost" onClick={handleClearFilters}>
              Reset filters
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm text-emerald-950/70">
            <span>
              {meta?.total ?? 0} public event
              {(meta?.total ?? 0) === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              Updated daily
            </span>
          </div>

          {isLoading ? (
            <div className="rounded-2xl border border-emerald-900/10 bg-white/70 p-8 text-sm text-emerald-900/70">
              Loading events...
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-2xl border border-emerald-900/10 bg-white/70 p-8 text-center text-sm text-emerald-900/70">
              No events match these filters yet. Try adjusting the location or
              date range.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {events.map((event) => {
                const href = event.slug
                  ? `/public/${teamId}/events/${event.slug}`
                  : undefined;
                const location = buildLocationLabel(event);
                return (
                  <article
                    key={event.id}
                    className="group relative overflow-hidden rounded-2xl border border-emerald-900/10 bg-white/70 p-5 shadow-[0_18px_48px_rgba(16,24,40,0.08)] transition-transform duration-300 hover:-translate-y-1"
                  >
                    <div className="flex items-center justify-between">
                      {event.eventType && (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-100 text-emerald-800"
                        >
                          {event.eventType.name}
                        </Badge>
                      )}
                      {event.merchNeeded && (
                        <Badge className="bg-amber-100 text-amber-800">
                          Merch
                        </Badge>
                      )}
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-emerald-950">
                      {href ? (
                        <Link
                          href={href}
                          className="transition-colors hover:text-emerald-700"
                        >
                          {event.title}
                        </Link>
                      ) : (
                        event.title
                      )}
                    </h3>
                    <p className="mt-2 text-xs uppercase tracking-wide text-emerald-900/60">
                      {formatEventDate(event)}
                    </p>
                    <div className="mt-3 flex items-start gap-2 text-sm text-emerald-900/70">
                      <MapPin className="mt-0.5 h-4 w-4" />
                      <span>{location}</span>
                    </div>
                    {event.description && (
                      <p className="mt-3 max-h-16 overflow-hidden text-sm text-emerald-900/70">
                        {event.description}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-emerald-900/70">
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-900/10 px-2 py-1">
                        <Calendar className="h-3 w-3" />
                        {event.isOnline ? "Online" : "Offline"}
                      </span>
                      {event.expectedGuests && (
                        <span className="rounded-full border border-emerald-900/10 px-2 py-1">
                          {event.expectedGuests} guests
                        </span>
                      )}
                      {event.hasRemuneration && (
                        <span className="rounded-full border border-emerald-900/10 px-2 py-1">
                          Remuneration
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-emerald-950/70">
            Page {meta?.page || 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}