"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format, isSameDay, isSameYear } from "date-fns";
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Eye,
  List,
  MapPin,
  Shapes,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  ChipList,
  DateCell,
  RecordChip,
  RecordIcon,
  RecordNameCell,
  TextCell,
} from "@/components/records/record-cells";
import { cn } from "@/lib/utils";

export type EventRow = {
  id: string;
  teamId: string;
  eventType?: {
    id: string;
    name: string;
    color?: string;
  };
  title: string;
  slug?: string;
  description?: string;
  location?: string;
  isOnline?: boolean;
  expectedGuests?: number;
  hasRemuneration?: boolean;
  address?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  timeZone?: string;
  merchNeeded?: boolean;
  startDate: string | Date;
  endDate?: string | Date;
  isPublic: boolean;
  registrationCount: number;
  contacts: Array<{
    id: string;
    name: string;
    email?: string;
    phone?: string;
    roles: Array<{
      id: string;
      name: string;
      color?: string;
    }>;
  }>;
  lists?: Array<{ id: string; name: string }>;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const toDate = (value?: string | Date | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * "28 Dec 2026, 10:00", "23 Oct 2026, 19:00–21:00",
 * "28 Dec, 10:00 – 31 Dec 2026, 10:00": always one line.
 */
export const formatEventWhen = (
  startValue: string | Date,
  endValue?: string | Date | null,
) => {
  const start = toDate(startValue);
  if (!start) return "";
  const end = toDate(endValue);
  if (!end || end.getTime() === start.getTime()) {
    return format(start, "d MMM yyyy, HH:mm");
  }
  if (isSameDay(start, end)) {
    return `${format(start, "d MMM yyyy, HH:mm")}–${format(end, "HH:mm")}`;
  }
  if (isSameYear(start, end)) {
    return `${format(start, "d MMM, HH:mm")} – ${format(end, "d MMM yyyy, HH:mm")}`;
  }
  return `${format(start, "d MMM yyyy, HH:mm")} – ${format(end, "d MMM yyyy, HH:mm")}`;
};

export const eventPlace = (event: EventRow) =>
  event.isOnline
    ? event.location || "Online"
    : event.location || [event.city, event.state].filter(Boolean).join(", ");

export const eventHref = (event: EventRow) =>
  `/teams/${event.teamId}/crm/events/${event.id}`;

/** Columns that open hidden; the Columns menu brings them back. */
export const EVENT_COLUMN_DEFAULTS: Record<string, boolean> = {
  state: false,
  expectedGuests: false,
  lists: false,
  createdAt: false,
};

export const EventTypeChip = ({ type }: { type?: EventRow["eventType"] }) =>
  type ? (
    <RecordChip color={type.color} title={type.name}>
      {type.name}
    </RecordChip>
  ) : null;

const CountCell = ({ value }: { value?: number | null }) =>
  value === null || value === undefined ? null : (
    <span
      className={cn(
        "block tabular-nums",
        value === 0 && "text-muted-foreground",
      )}
    >
      {value.toLocaleString("en")}
    </span>
  );

type EventPerson = EventRow["contacts"][number];

const personLabel = (person: EventPerson) =>
  person.roles.length > 0
    ? `${person.name} (${person.roles.map((role) => role.name).join(", ")})`
    : person.name;

export const eventColumns: ColumnDef<EventRow, unknown>[] = [
  {
    id: "title",
    accessorKey: "title",
    meta: {
      label: "Event",
      icon: CalendarDays,
      sortField: "title",
      width: 280,
      pinned: true,
      alwaysVisible: true,
    },
    cell: ({ row }) => (
      <RecordNameCell
        kind="record"
        icon={CalendarDays}
        name={row.original.title}
        href={eventHref(row.original)}
      />
    ),
  },
  {
    id: "type",
    meta: { label: "Type", icon: Shapes, width: 170 },
    cell: ({ row }) => <EventTypeChip type={row.original.eventType} />,
  },
  {
    id: "when",
    meta: {
      label: "When",
      icon: CalendarClock,
      sortField: "startDate",
      width: 290,
    },
    cell: ({ row }) => (
      <TextCell
        value={formatEventWhen(row.original.startDate, row.original.endDate)}
        className="tabular-nums"
      />
    ),
  },
  {
    id: "location",
    meta: {
      label: "Location",
      icon: MapPin,
      sortField: "location",
      width: 200,
    },
    cell: ({ row }) => <TextCell value={eventPlace(row.original)} />,
  },
  {
    id: "state",
    accessorKey: "state",
    meta: { label: "State", icon: MapPin, width: 150 },
    cell: ({ row }) => <TextCell value={row.original.state} />,
  },
  {
    id: "registrations",
    meta: {
      label: "Registrations",
      icon: UserCheck,
      sortField: "registrationCount",
      width: 140,
    },
    cell: ({ row }) => <CountCell value={row.original.registrationCount} />,
  },
  {
    id: "expectedGuests",
    meta: { label: "Expected guests", icon: Users, width: 150 },
    cell: ({ row }) => <CountCell value={row.original.expectedGuests} />,
  },
  {
    id: "people",
    meta: { label: "People", icon: Users, width: 260 },
    cell: ({ row }) => (
      <ChipList
        items={row.original.contacts ?? []}
        getKey={(person) => person.id}
        getLabel={personLabel}
        max={1}
        renderChip={(person) => (
          <RecordChip
            title={personLabel(person)}
            avatar={{ name: person.name, kind: "person" }}
          >
            {person.name}
            {person.roles.length > 0 ? (
              <span className="text-muted-foreground">
                {" "}
                · {person.roles.map((role) => role.name).join(", ")}
              </span>
            ) : null}
          </RecordChip>
        )}
      />
    ),
  },
  {
    id: "visibility",
    meta: { label: "Visibility", icon: Eye, width: 120 },
    // Private is the normal case and stays blank; public is worth marking.
    cell: ({ row }) =>
      row.original.isPublic ? (
        <RecordChip title="Listed on the public events page">Public</RecordChip>
      ) : null,
  },
  {
    id: "lists",
    meta: { label: "Lists", icon: List, width: 200 },
    cell: ({ row }) => (
      <ChipList
        items={row.original.lists ?? []}
        getKey={(list) => list.id}
        getLabel={(list) => list.name}
        max={1}
        renderChip={(list) => (
          <RecordChip title={list.name}>{list.name}</RecordChip>
        )}
      />
    ),
  },
  {
    id: "createdAt",
    meta: {
      label: "Created",
      icon: CalendarPlus,
      sortField: "createdAt",
      width: 140,
    },
    cell: ({ row }) => <DateCell value={row.original.createdAt} />,
  },
];

export const renderEventCard = (event: EventRow) => {
  const place = eventPlace(event);
  const people = event.contacts.length;

  return (
    <Link
      key={event.id}
      href={eventHref(event)}
      className="block min-w-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
    >
      <div className="flex h-full min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground transition-colors hover:border-input hover:bg-accent/40">
        <div className="flex min-w-0 items-center gap-2.5">
          <RecordIcon icon={CalendarDays} className="size-8" />
          <div className="min-w-0">
            <p className="truncate font-medium" title={event.title}>
              {event.title}
            </p>
            <p className="truncate text-xs tabular-nums text-muted-foreground">
              {formatEventWhen(event.startDate, event.endDate)}
            </p>
          </div>
        </div>
        {event.eventType || event.isPublic ? (
          <div className="flex min-w-0 flex-wrap gap-1">
            <EventTypeChip type={event.eventType} />
            {event.isPublic ? <RecordChip>Public</RecordChip> : null}
          </div>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{place}</span>
          <span className="shrink-0 tabular-nums">
            {event.registrationCount > 0
              ? `${event.registrationCount} registered`
              : people > 0
                ? `${people} ${people === 1 ? "person" : "people"}`
                : null}
          </span>
        </div>
      </div>
    </Link>
  );
};
