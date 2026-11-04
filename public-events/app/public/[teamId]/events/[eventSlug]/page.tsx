import { notFound } from "next/navigation";
import { snapshot } from "../../../../../snapshot";
import Registration from "../../../../../registration";
import { isPast } from "../../../../../../src/lib/public-events/types";

export function generateStaticParams() {
  return snapshot().events.map((event) => ({
    teamId: event.teamId,
    eventSlug: event.slug,
  }));
}
export const dynamicParams = false;
export default async function EventPage({
  params,
}: {
  params: Promise<{ teamId: string; eventSlug: string }>;
}) {
  const { teamId, eventSlug } = await params;
  const data = snapshot();
  const event = data.events.find(
    (item) => item.teamId === teamId && item.slug === eventSlug,
  );
  if (!event) notFound();
  const team = data.teams.find((item) => item.id === teamId);
  const past = isPast(event, Date.parse(data.generatedAt));
  const format = (date: string) =>
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: event.timeZone,
    }).format(new Date(date));
  return (
    <div className="detail-background">
      <main className="event-detail">
        <a className="back" href={`/public/${teamId}/events/`}>
          ← All events
        </a>
        <article
          data-pagefind-body
          data-pagefind-sort={`date:${Date.parse(event.startDate)}`}
        >
          {Object.entries({
            team: teamId,
            status: past ? "past" : "upcoming",
            year: event.startDate.slice(0, 4),
            date: event.startDate.slice(0, 10),
            type: event.eventType,
            state: event.state,
            online: String(event.isOnline),
            event: event.id,
          }).map(([key, value]) => (
            <span
              key={key}
              hidden
              data-pagefind-ignore="index"
              data-pagefind-filter={key}
            >
              {value}
            </span>
          ))}
          <p className="eyebrow">
            {event.eventType || "EVENT"}
            {past ? " / PAST EVENT" : ""}
          </p>
          <h1 data-pagefind-meta="title">{event.title}</h1>
          {team && (
            <p className="event-host">
              Hosted by <strong>{team.name}</strong>
            </p>
          )}
          <div className="event-facts">
            <p>
              <strong>When</strong>
              {format(event.startDate)}
              {event.endDate && <> — {format(event.endDate)}</>} (
              {event.timeZone})
            </p>
            <p>
              <strong>Where</strong>
              {event.isOnline
                ? "Online"
                : [event.location, event.postalCode, event.city]
                    .filter(Boolean)
                    .join(", ") || "Location to be announced"}
            </p>
          </div>
          <p className="description">{event.description}</p>
          <span
            hidden
            data-pagefind-ignore="index"
            data-pagefind-meta="eventId"
          >
            {event.id}
          </span>
          <span hidden data-pagefind-ignore="index" data-pagefind-meta="date">
            {event.startDate}
          </span>
          <span
            hidden
            data-pagefind-ignore="index"
            data-pagefind-meta="location"
          >
            {event.isOnline ? "Online" : event.city || event.location}
          </span>
          <span hidden data-pagefind-ignore="index" data-pagefind-meta="type">
            {event.eventType}
          </span>
          <span
            hidden
            data-pagefind-ignore="index"
            data-pagefind-meta="description"
          >
            {event.description.slice(0, 180)}
          </span>
          <span hidden data-pagefind-ignore="index" data-pagefind-meta="format">
            {event.isOnline ? "Online" : "Offline"}
          </span>
          <span
            hidden
            data-pagefind-ignore="index"
            data-pagefind-meta="timeZone"
          >
            {event.timeZone}
          </span>
        </article>
        <section className="registration" data-pagefind-ignore>
          <h2>{past ? "This event has ended" : "Register for this event"}</h2>
          {past ? (
            <p>
              Browse upcoming events to find your next opportunity to join us.
            </p>
          ) : (
            <Registration
              eventId={event.id}
              endDate={event.endDate ?? event.startDate}
            />
          )}
        </section>
        {team && (
          <div className="event-contact">
            <p>
              Questions? Contact us at{" "}
              <a href={`mailto:${team.email}`}>{team.email}</a>
            </p>
            {team.website && (
              <p>
                <a
                  href={
                    /^https?:\/\//i.test(team.website)
                      ? team.website
                      : `https://${team.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Visit our website
                </a>
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
