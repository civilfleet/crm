import EventsView from "@/components/events/events-view";
import PublicEventsLinkButton from "@/components/events/public-events-link-button";

interface EventsPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function EventsPage({ params }: EventsPageProps) {
  const { teamId } = await params;

  return (
    <div className="p-4 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-sm text-muted-foreground">
            Manage events and track contact participation for your team.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PublicEventsLinkButton teamId={teamId} />
        </div>
      </div>

      <EventsView teamId={teamId} />
    </div>
  );
}
