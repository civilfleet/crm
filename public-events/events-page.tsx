import type { PublicTeam } from "../src/lib/public-events/types";
import Explorer from "./explorer";

export default function EventsPage({
  team,
  version,
}: {
  team: PublicTeam;
  version: string;
}) {
  return (
    <main id="main-content" className="events-page">
      <header className="events-header">
        <div className="site-container">
          <h1>Find the next action near you</h1>
          <p className="intro">
            Browse public workshops, talks, and actions. Filter by place, type,
            or distance to discover events that match your interests.
          </p>
          <p className="team-name">{team.name} · Public Events</p>
        </div>
      </header>
      <div className="site-container events-content">
        <Explorer teamId={team.id} version={version} />
      </div>
    </main>
  );
}
