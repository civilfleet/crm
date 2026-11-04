import EventsPage from "../events-page";
import { snapshot } from "../snapshot";

export default function Home() {
  const { teams, version } = snapshot();
  if (teams.length === 1)
    return <EventsPage team={teams[0]} version={version} />;
  return (
    <main id="main-content" className="events-page">
      <header className="events-header">
        <div className="site-container">
          <h1>Find the next action near you</h1>
          <p className="intro">
            Browse public workshops, talks, and actions from our community.
          </p>
        </div>
      </header>
      <div className="site-container events-content">
        <div className="cards">
          {teams.map((team) => (
            <a
              className="card"
              key={team.id}
              href={`/public/${team.id}/events/`}
            >
              <h2>{team.name}</h2>
              <span>Explore events →</span>
            </a>
          ))}
        </div>
        {!teams.length && (
          <p className="empty">New events will appear here soon.</p>
        )}
      </div>
    </main>
  );
}
