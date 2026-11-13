import { Calendar } from "lucide-react";
import EventsView from "@/components/events/events-view";
import PublicEventsLinkButton from "@/components/events/public-events-link-button";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";

interface EventsPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function EventsPage({ params }: EventsPageProps) {
  const { teamId } = await params;

  return (
    <RecordsPage>
      <RecordsHeader
        icon={Calendar}
        title="Events"
        action={<PublicEventsLinkButton teamId={teamId} />}
      />
      <div className="px-4 py-3">
        <EventsView teamId={teamId} />
      </div>
    </RecordsPage>
  );
}
