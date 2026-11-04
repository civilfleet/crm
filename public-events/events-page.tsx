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
    <main className="events-page">
      <header className="events-header">
        <div className="header-labels">
          <span className="public-badge">Public Events</span>
          <span className="team-name">{team.name}</span>
        </div>
        <h1>Find the next action near you</h1>
        <p className="intro">
          Browse public workshops, talks, and actions. Filter by place, type, or
          distance to discover events that match your interests.
        </p>
      </header>
      <Explorer teamId={team.id} version={version} />
    </main>
  );
}
