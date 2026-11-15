import { cookies } from "next/headers";
import PublicEventsLinkButton from "@/components/events/public-events-link-button";
import EventTable from "@/components/table/event-table";
import {
  parseTablePageSize,
  RECORDS_PAGE_SIZE,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";

interface EventsPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function EventsPage({ params }: EventsPageProps) {
  const [{ teamId }, cookieStore] = await Promise.all([params, cookies()]);
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
    RECORDS_PAGE_SIZE,
  );

  return (
    <EventTable
      teamId={teamId}
      initialPageSize={initialPageSize}
      headerActions={<PublicEventsLinkButton teamId={teamId} />}
    />
  );
}
