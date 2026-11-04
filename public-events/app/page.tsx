import { snapshot } from "../snapshot";
import EventsPage from "../events-page";

export default function Home() {
  const { teams, version } = snapshot();
  if (teams.length === 1)
    return <EventsPage team={teams[0]} version={version} />;
  return (
    <main className="events-page">
      <header className="events-header">
        <span className="public-badge">Public Events</span>
        <h1>Find the next action near you</h1>
        <p className="intro">
          Browse public workshops, talks, and actions from our community.
        </p>
      </header>
      <div className="cards">
        {teams.map((team) => (
          <a className="card" key={team.id} href={`/public/${team.id}/events/`}>
            <p className="eyebrow">PUBLIC EVENTS</p>
            <h2>{team.name}</h2>
            <span>Explore events →</span>
          </a>
        ))}
      </div>
      {!teams.length && <p>New events will appear here soon.</p>}
    </main>
  );
}
