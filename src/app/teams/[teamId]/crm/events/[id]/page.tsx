import { Calendar } from "lucide-react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import EventForm from "@/components/forms/event";
import { RecordTopBar } from "@/components/records/record-page";
import EventRegistrationsTable from "@/components/table/event-registrations-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getEventById } from "@/services/events";

interface EventDetailPageProps {
  params: Promise<{ teamId: string; id: string }>;
}

export default async function EventDetailPage({
  params,
}: EventDetailPageProps) {
  const { teamId, id } = await params;

  const event = await getEventById(id, teamId);

  const headerList = await headers();
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const fallbackBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const publicBaseUrl = host ? `${protocol}://${host}` : fallbackBaseUrl;

  if (!event) {
    notFound();
  }

  return (
    <>
      <RecordTopBar
        list={{
          href: `/teams/${teamId}/crm/events`,
          label: "Events",
          icon: Calendar,
        }}
        title={event.title}
      />
      <div className="p-4">
        <div className="mx-auto w-full">
          <div className="grid w-full gap-x-6 gap-y-3 lg:grid-cols-12 lg:items-start">
            <EventForm
              teamId={teamId}
              event={event}
              publicBaseUrl={publicBaseUrl}
              rightRailAppend={
                <Card className="w-full shadow-sm lg:sticky lg:top-6">
                  <CardHeader className="border-b pb-3">
                    <CardTitle>
                      Registrations ({event.registrationCount})
                    </CardTitle>
                    <CardDescription>
                      Track everyone who registered for this event. Each entry
                      links to the CRM contact.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <EventRegistrationsTable teamId={teamId} eventId={id} />
                  </CardContent>
                </Card>
              }
            />
          </div>
        </div>
      </div>
    </>
  );
}
