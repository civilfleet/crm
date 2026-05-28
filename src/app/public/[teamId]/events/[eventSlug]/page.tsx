import { format } from "date-fns";
import { notFound } from "next/navigation";
import EventRegistrationForm from "@/components/forms/event-registration";
import { getPublicEventBySlug } from "@/services/events";

interface PublicEventPageProps {
  params: Promise<{ teamId: string; eventSlug: string }>;
}

export default async function PublicEventPage({
  params,
}: PublicEventPageProps) {
  const { teamId, eventSlug } = await params;

  const event = await getPublicEventBySlug(teamId, eventSlug);

  if (!event) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Event Header */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h1 className="text-3xl font-bold text-gray-900">{event.title}</h1>
            {event.team && (
              <p className="mt-2 text-sm text-gray-600">
                Hosted by <span className="font-medium">{event.team.name}</span>
              </p>
            )}
          </div>

          {/* Event Details */}
          <div className="space-y-3 border-t border-gray-200 pt-4">
            <div className="flex items-start gap-2">
              <svg
                className="h-5 w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <title>Event date</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <div>
                <p className="font-medium text-gray-900">
                  {format(new Date(event.startDate), "EEEE, MMMM d, yyyy")}
                </p>
                <p className="text-sm text-gray-600">
                  {format(new Date(event.startDate), "h:mm a")}
                  {event.endDate &&
                    ` - ${format(new Date(event.endDate), "h:mm a")}`}
                </p>
              </div>
            </div>

            {event.location && (
              <div className="flex items-start gap-2">
                <svg
                  className="h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <title>Event location</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <p className="text-gray-900">{event.location}</p>
              </div>
            )}
          </div>

          {event.description && (
            <div className="mt-6 border-t border-gray-200 pt-6">
              <h2 className="mb-2 text-lg font-semibold text-gray-900">
                About this event
              </h2>
              <p className="whitespace-pre-wrap text-gray-700">
                {event.description}
              </p>
            </div>
          )}
        </div>

        {/* Registration Form */}
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">
            Register for this event
          </h2>
          <EventRegistrationForm eventId={event.id} />
        </div>

        {/* Footer */}
        {event.team && (
          <div className="mt-8 text-center text-sm text-gray-600">
            <p>
              Questions? Contact us at{" "}
              <a
                href={`mailto:${event.team.email}`}
                className="text-blue-600 hover:underline"
              >
                {event.team.email}
              </a>
            </p>
            {event.team.website && (
              <p className="mt-1">
                <a
                  href={event.team.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Visit our website
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
