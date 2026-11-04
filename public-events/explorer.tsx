"use client";
import { Calendar, MapPin, Search, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { distanceKm, intersectsRadius } from "../src/lib/public-events/geo";
import {
  eventPath,
  normalizePostal,
  postalShard,
  type EventManifest,
  type GeoPoint,
  type GeoShard,
  type PublicEvent,
} from "../src/lib/public-events/types";

type ResultData = { url: string; meta: Record<string, string> };
type Pagefind = {
  search: (
    query: string | null,
    options: {
      filters: Record<string, string | string[]>;
      sort: { date: string };
    },
  ) => Promise<{ results: { id: string; data: () => Promise<ResultData> }[] }>;
};
type Card = {
  id: string;
  title: string;
  url: string;
  date: string;
  location: string;
  type: string;
  description: string;
  format: string;
  timeZone: string;
};
const countryLabels = new Intl.DisplayNames(["en"], { type: "region" });
const loadJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "No data found for this selection."
        : "Unable to load events. Please try again.",
    );
  return response.json();
};

export default function Explorer({
  teamId,
  version,
}: {
  teamId: string;
  version: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  const [manifest, setManifest] = useState<EventManifest>();
  const [scope, setScope] = useState("upcoming");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    query: "",
    type: "",
    state: "",
    online: "",
    from: "",
    to: "",
    postal: "",
    country: "DE",
    radius: "50",
  });
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const pagefind = useRef<Promise<Pagefind> | undefined>(undefined);
  const base = `/data/${version}`;
  useEffect(() => {
    let active = true;
    loadJson<EventManifest>(`${base}/${teamId}/manifest.json`)
      .then((data) => {
        if (active) setManifest(data);
      })
      .catch((err: Error) => {
        if (active) {
          setError(err.message);
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [base, teamId]);
  useEffect(() => {
    if (!manifest) return;
    const currentManifest = manifest;
    let active = true;
    setBusy(true);
    setError("");
    async function run() {
      const searching = Object.entries(filters).some(
        ([key, value]) => !["country", "radius"].includes(key) && value,
      );
      if (!searching && scope !== "all") {
        const events = await loadJson<PublicEvent[]>(
          `${base}/${teamId}/${scope}/${page}.json`,
        );
        if (active) {
          setCards(
            events.map((e) => ({
              id: e.id,
              title: e.title,
              url: eventPath(e),
              date: e.startDate,
              location: e.isOnline ? "Online" : e.city || e.location,
              type: e.eventType,
              description: e.excerpt ?? "",
              format: e.isOnline ? "Online" : "Offline",
              timeZone: e.timeZone,
            })),
          );
          setPages(currentManifest.pages[scope] ?? 0);
          setTotal(currentManifest.counts[scope] ?? 0);
        }
        return;
      }
      const selected: Record<string, string | string[]> = { team: teamId };
      if (scope === "upcoming") selected.status = "upcoming";
      else if (scope !== "all") {
        selected.status = "past";
        selected.year = scope;
      }
      if (filters.type) selected.type = filters.type;
      if (filters.state) selected.state = filters.state;
      if (filters.online) selected.online = filters.online;
      if (filters.from || filters.to) {
        const dates = currentManifest.dates.filter(
          (date) =>
            (!filters.from || date >= filters.from) &&
            (!filters.to || date <= filters.to),
        );
        if (!dates.length) {
          if (active) {
            setCards([]);
            setTotal(0);
            setPages(0);
          }
          return;
        }
        selected.date = dates;
      }
      if (filters.postal) {
        const country = filters.country.toUpperCase();
        const lookup = await loadJson<Record<string, [number, number]>>(
          `${base}/postal/${postalShard(country, filters.postal)}`,
        );
        const origin = lookup[normalizePostal(filters.postal)];
        if (!origin)
          throw new Error(
            "This postal code is not in our location catalogue. Check the country and code.",
          );
        const radius = Number(filters.radius);
        if (!Number.isFinite(radius) || radius <= 0 || radius > 1000)
          throw new Error("Choose a radius between 1 and 1,000 km.");
        const intersects = (shard: GeoShard) =>
          intersectsRadius(shard.bounds, origin[0], origin[1], radius);
        const scopePaths = Object.entries(currentManifest.geoIndexes)
          .filter(([key]) => scope === "all" || key === scope)
          .map(([, path]) => path);
        async function loadArrays(paths: string[]) {
          const entries: GeoShard[] = [];
          for (let offset = 0; offset < paths.length; offset += 8) {
            const values = await Promise.all(
              paths
                .slice(offset, offset + 8)
                .map((path) => loadJson<GeoShard[]>(path)),
            );
            entries.push(...values.flat());
          }
          return entries;
        }
        const prefixes = (await loadArrays(scopePaths)).filter(intersects);
        const candidates = (
          await loadArrays(prefixes.map((entry) => entry.path))
        ).filter(intersects);
        const ids: string[] = [];
        // Bound concurrent shard requests when a wide radius covers many cells.
        for (let offset = 0; offset < candidates.length; offset += 8) {
          const batches = await Promise.all(
            candidates
              .slice(offset, offset + 8)
              .map((shard) => loadJson<GeoPoint[]>(shard.path)),
          );
          for (const points of batches)
            for (const point of points)
              if (
                distanceKm(
                  origin[0],
                  origin[1],
                  point.latitude,
                  point.longitude,
                ) <= radius
              )
                ids.push(point.id);
        }
        if (!ids.length) {
          if (active) {
            setCards([]);
            setTotal(0);
            setPages(0);
          }
          return;
        }
        selected.event = ids;
      }
      const moduleUrl = "/pagefind/pagefind.js";
      pagefind.current ??= import(
        /* webpackIgnore: true */ moduleUrl
      ) as Promise<Pagefind>;
      const engine = await pagefind.current;
      const result = await engine.search(filters.query || null, {
        filters: selected,
        sort: { date: scope === "upcoming" ? "asc" : "desc" },
      });
      const visible = await Promise.all(
        result.results
          .slice((page - 1) * 12, page * 12)
          .map((item) => item.data()),
      );
      if (active) {
        setCards(
          visible.map((item) => ({
            id: item.meta.eventId,
            title: item.meta.title,
            url: item.url,
            date: item.meta.date,
            location: item.meta.location,
            type: item.meta.type,
            description: item.meta.description ?? "",
            format: item.meta.format ?? "",
            timeZone: item.meta.timeZone || "Europe/Berlin",
          })),
        );
        setTotal(result.results.length);
        setPages(Math.ceil(result.results.length / 12));
      }
    }
    run()
      .catch((err: Error) => {
        if (active) {
          setCards([]);
          setPages(0);
          setError(err.message);
          pagefind.current = undefined;
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [manifest, scope, page, filters, base, teamId]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setFilters({
      query: String(data.get("query") ?? "").trim(),
      type: String(data.get("type") ?? ""),
      state: String(data.get("state") ?? ""),
      online: String(data.get("online") ?? ""),
      from: String(data.get("from") ?? ""),
      to: String(data.get("to") ?? ""),
      postal: String(data.get("postal") ?? ""),
      country: String(data.get("country") ?? "DE"),
      radius: String(data.get("radius") ?? "50"),
    });
    setPage(1);
  }
  return (
    <>
      <form
        ref={formRef}
        className="search-panel"
        onSubmit={submit}
        onChange={() => {
          clearTimeout(searchTimer.current);
          searchTimer.current = setTimeout(
            () => formRef.current?.requestSubmit(),
            300,
          );
        }}
        onReset={() => {
          clearTimeout(searchTimer.current);
          setFilters({
            query: "",
            type: "",
            state: "",
            online: "",
            from: "",
            to: "",
            postal: "",
            country: "DE",
            radius: "50",
          });
          setPage(1);
        }}
      >
        <div className="filter-row">
          <label className="search-input">
            <span className="sr-only">Search events</span>
            <Search aria-hidden="true" size={16} />
            <input
              type="search"
              name="query"
              placeholder="Search by title, place, or keyword"
            />
          </label>
          <label className="type-filter">
            <span className="sr-only">Event type</span>
            <select name="type">
              <option value="">All types</option>
              {manifest?.types.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Format</span>
            <select name="online">
              <option value="">Online + Offline</option>
              <option value="true">Online only</option>
              <option value="false">Offline only</option>
            </select>
          </label>
          <label>
            <span className="sr-only">State</span>
            <select name="state">
              <option value="">All states</option>
              {manifest?.states.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </label>
          <label className="date-filter">
            <span className="sr-only">From date</span>
            <input type="date" name="from" />
          </label>
          <label className="date-filter">
            <span className="sr-only">Until date</span>
            <input type="date" name="to" />
          </label>
        </div>
        <div className="filter-row location-filters">
          <label>
            <span className="sr-only">Postal code</span>
            <input
              name="postal"
              autoComplete="postal-code"
              placeholder="Postal code"
            />
          </label>
          <label className="country-filter">
            <span className="sr-only">Country</span>
            <select name="country" defaultValue="DE">
              {(manifest?.countries.length ? manifest.countries : ["DE"]).map(
                (country) => (
                  <option key={country} value={country}>
                    {`${countryLabels.of(country)} (${country})`}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="radius-filter">
            <span className="sr-only">Radius (km)</span>
            <input
              name="radius"
              type="number"
              defaultValue="50"
              min="1"
              max="1000"
              placeholder="Radius (km)"
            />
          </label>
          <button type="reset" className="ghost-button">
            Reset filters
          </button>
          <button type="submit" className="sr-only">
            Apply filters
          </button>
        </div>
      </form>
      <fieldset className="tabs" aria-label="Browse events">
        <button
          type="button"
          className={scope === "upcoming" ? "selected" : ""}
          onClick={() => {
            setScope("upcoming");
            setPage(1);
          }}
        >
          Upcoming
        </button>
        <button
          type="button"
          className={scope === "all" ? "selected" : ""}
          onClick={() => {
            setScope("all");
            setPage(1);
          }}
        >
          All events
        </button>
        <label>
          Archive
          <select
            value={/^\d{4}$/.test(scope) ? scope : ""}
            onChange={(e) => {
              if (e.target.value) {
                setScope(e.target.value);
                setPage(1);
              }
            }}
          >
            <option value="">Choose a year</option>
            {manifest?.years.map((year) => (
              <option key={year}>{year}</option>
            ))}
          </select>
        </label>
      </fieldset>
      <div className="results-heading">
        <span aria-live="polite">
          {busy
            ? "Loading events…"
            : `${total} public event${total === 1 ? "" : "s"}`}
        </span>
        <span className="updated-label">
          <Sparkles size={16} aria-hidden="true" />
          Updated daily
        </span>
      </div>
      {error && (
        <p className="empty" role="status" aria-live="polite">
          {error}
        </p>
      )}
      <div className="cards" aria-busy={busy}>
        {cards.map((card) => (
          <a className="card" href={card.url} key={card.id}>
            {card.type && <span className="event-badge">{card.type}</span>}
            <h3>{card.title}</h3>
            <time dateTime={card.date}>
              {new Intl.DateTimeFormat("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: card.timeZone,
              }).format(new Date(card.date))}
            </time>
            <p className="card-location">
              <MapPin size={16} aria-hidden="true" />
              <span>{card.location || "Location TBD"}</span>
            </p>
            {card.description && (
              <p className="card-description">{card.description}</p>
            )}
            <div className="card-tags">
              <span>
                <Calendar size={12} aria-hidden="true" />
                {card.format}
              </span>
            </div>
          </a>
        ))}
      </div>
      {!busy && !error && !cards.length && (
        <p className="empty">
          No events match these filters yet. Try adjusting the location or date
          range.
        </p>
      )}
      <nav className="pagination" aria-label="Event pages">
        <span>
          Page {pages ? page : 1} of {Math.max(pages, 1)}
        </span>
        <div>
          <button
            type="button"
            disabled={busy || page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={busy || page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </nav>
    </>
  );
}
