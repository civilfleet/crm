"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  createdAt: string | Date;
  updatedAt: string | Date;
};

const _formatDate = (value?: string | Date | null) => {
  if (!value) {
    return "—";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value instanceof Date ? value.toISOString() : value;
  }

  return format(parsed, "PP");
};

const formatDateTime = (value?: string | Date | null) => {
  if (!value) {
    return "—";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value instanceof Date ? value.toISOString() : value;
  }

  return format(parsed, "PPp");
};

const renderContacts = (contacts: EventRow["contacts"] = []) => {
  if (!contacts.length) {
    return <span className="text-muted-foreground">No contacts</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {contacts.slice(0, 3).map((contact) => (
        <div key={contact.id} className="flex flex-col gap-0.5">
          <Badge variant="secondary" className="text-xs font-normal">
            {contact.name}
          </Badge>
          {contact.roles.length > 0 && (
            <div className="flex flex-wrap gap-0.5">
              {contact.roles.map((role) => (
                <Badge
                  key={role.id}
                  variant="outline"
                  className="text-[10px] px-1 py-0"
                  style={
                    role.color
                      ? { borderColor: role.color, color: role.color }
                      : {}
                  }
                >
                  {role.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ))}
      {contacts.length > 3 && (
        <Badge variant="secondary" className="text-xs font-normal">
          +{contacts.length - 3} more
        </Badge>
      )}
    </div>
  );
};

const EventTitleCell = ({ event }: { event: EventRow }) => {
  const params = useParams();
  const teamId = params.teamId as string;

  return (
    <Link
      href={`/teams/${teamId}/crm/events/${event.id}`}
      className="font-medium hover:underline"
    >
      {event.title}
    </Link>
  );
};

const CopyPublicLinkButton = ({ event }: { event: EventRow }) => {
  const [copied, setCopied] = useState(false);

  const copyPublicLink = () => {
    if (!event.isPublic || !event.slug) {
      return;
    }

    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const publicUrl = `${baseUrl}/public/${event.teamId}/events/${event.slug}`;

    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!event.isPublic || !event.slug) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={copyPublicLink}
      className="gap-2"
      title="Copy public registration link"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-green-600" />
          <span className="text-green-600">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          <span>Copy Link</span>
        </>
      )}
    </Button>
  );
};

const CopyContactsButton = ({ event }: { event: EventRow }) => {
  const [copied, setCopied] = useState(false);

  const copyContactsToClipboard = () => {
    if (event.contacts.length === 0) {
      return;
    }

    // Format contacts with names, emails, phones, and roles
    const contactsText = event.contacts
      .map((contact) => {
        const parts = [contact.name];
        if (contact.email) parts.push(contact.email);
        if (contact.phone) parts.push(contact.phone);
        if (contact.roles.length > 0) {
          parts.push(`(${contact.roles.map((r) => r.name).join(", ")})`);
        }
        return parts.join(" - ");
      })
      .join("\n");

    navigator.clipboard.writeText(contactsText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (event.contacts.length === 0) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={copyContactsToClipboard}
      className="gap-2"
      title="Copy contacts to clipboard"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-green-600" />
          <span className="text-green-600">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          <span>Copy Contacts</span>
        </>
      )}
    </Button>
  );
};

export const eventColumns: ColumnDef<EventRow>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => <EventTitleCell event={row.original} />,
  },
  {
    accessorKey: "eventType",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const type = row.original.eventType;
      if (!type) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <Badge
          variant="outline"
          className="text-xs"
          style={
            type.color ? { borderColor: type.color, color: type.color } : {}
          }
        >
          {type.color && (
            <span
              className="mr-1 inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: type.color }}
            />
          )}
          {type.name}
        </Badge>
      );
    },
  },
  {
    accessorKey: "location",
    header: "Location",
    cell: ({ row }) => <span>{row.original.location || "—"}</span>,
  },
  {
    accessorKey: "startDate",
    header: "Start Date",
    cell: ({ row }) => <span>{formatDateTime(row.original.startDate)}</span>,
  },
  {
    accessorKey: "endDate",
    header: "End Date",
    cell: ({ row }) => <span>{formatDateTime(row.original.endDate)}</span>,
  },
  {
    accessorKey: "contacts",
    header: "Contacts",
    cell: ({ row }) => renderContacts(row.original.contacts),
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <CopyPublicLinkButton event={row.original} />
        <CopyContactsButton event={row.original} />
      </div>
    ),
  },
];

export const renderEventCard = (event: EventRow) => {
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-3">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold">{event.title}</h3>
          {event.isPublic && (
            <Badge variant="secondary" className="text-xs">
              Public
            </Badge>
          )}
        </div>
        {event.eventType && (
          <Badge
            variant="outline"
            className="mt-2 text-xs"
            style={
              event.eventType.color
                ? {
                    borderColor: event.eventType.color,
                    color: event.eventType.color,
                  }
                : {}
            }
          >
            {event.eventType.color && (
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: event.eventType.color }}
              />
            )}
            {event.eventType.name}
          </Badge>
        )}
        {event.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {event.description}
          </p>
        )}
      </div>

      <div className="space-y-1 text-sm">
        {event.location && (
          <p className="text-muted-foreground">
            <span className="font-medium">Location:</span> {event.location}
          </p>
        )}
        {!event.isOnline &&
          (event.address || event.city || event.postalCode) && (
            <p className="text-muted-foreground">
              <span className="font-medium">Address:</span>{" "}
              {[event.address, event.postalCode, event.city, event.state]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
        <p className="text-muted-foreground">
          <span className="font-medium">Start:</span>{" "}
          {formatDateTime(event.startDate)}
        </p>
        {event.endDate && (
          <p className="text-muted-foreground">
            <span className="font-medium">End:</span>{" "}
            {formatDateTime(event.endDate)}
          </p>
        )}
      </div>

      {event.contacts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Contacts
          </p>
          {renderContacts(event.contacts)}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
        <CopyPublicLinkButton event={event} />
        <CopyContactsButton event={event} />
      </div>
    </div>
  );
};