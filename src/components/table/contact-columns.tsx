"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import {
  ContactAttributeType,
  type ContactEmail,
  type ContactEvent,
  type ContactGender,
  type ContactProfileAttribute,
  type ContactRequestPreference,
} from "@/types";

export type ContactRow = {
  id: string;
  teamId: string;
  name: string;
  pronouns?: string | null;
  gender?: ContactGender | null;
  genderRequestPreference?: ContactRequestPreference | null;
  isBipoc?: boolean | null;
  racismRequestPreference?: ContactRequestPreference | null;
  otherMargins?: string | null;
  onboardingDate?: string | Date | null;
  breakUntil?: string | Date | null;
  address?: string | null;
  postalCode?: string | null;
  state?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  email?: string | null;
  additionalEmails?: ContactEmail[];
  phone?: string | null;
  signal?: string | null;
  website?: string | null;
  notes?: string | null;
  profileAttributes: ContactProfileAttribute[];
  events?: ContactEvent[];
  createdAt: string | Date;
  updatedAt: string | Date;
};

const formatDate = (value?: string | Date | null) => {
  if (!value) {
    return "-";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value instanceof Date ? value.toISOString() : value;
  }

  return format(parsed, "PP");
};

const getDateValue = (value: string | Date) => {
  const parsed = value instanceof Date ? value : new Date(value);
  const time = parsed.getTime();

  return Number.isNaN(time) ? 0 : time;
};

const formatAttributeValue = (attribute: ContactProfileAttribute) => {
  switch (attribute.type) {
    case ContactAttributeType.NUMBER:
      return attribute.value.toString();
    case ContactAttributeType.DATE:
      return formatDate(attribute.value);
    case ContactAttributeType.LOCATION: {
      const parts: string[] = [];
      if ("label" in attribute.value && attribute.value.label) {
        parts.push(attribute.value.label);
      }
      if (
        "latitude" in attribute.value &&
        typeof attribute.value.latitude === "number"
      ) {
        parts.push(`Lat: ${attribute.value.latitude}`);
      }
      if (
        "longitude" in attribute.value &&
        typeof attribute.value.longitude === "number"
      ) {
        parts.push(`Lng: ${attribute.value.longitude}`);
      }

      return parts.length > 0 ? parts.join(" | ") : "-";
    }
    default:
      return attribute.value || "-";
  }
};

const renderAttributes = (attributes: ContactProfileAttribute[] = []) => {
  if (!attributes.length) {
    return <span className="text-muted-foreground">No attributes</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {attributes.slice(0, 4).map((attribute) => (
        <Badge
          key={`${attribute.key}-${attribute.type}`}
          variant="secondary"
          className="text-xs font-normal"
        >
          <span className="font-medium">{attribute.key}:</span>{" "}
          <span className="ml-1">{formatAttributeValue(attribute)}</span>
        </Badge>
      ))}
    </div>
  );
};

const ContactNameCell = ({ contact }: { contact: ContactRow }) => {
  const params = useParams();
  const teamId = params.teamId as string;

  return (
    <Link
      href={`/teams/${teamId}/crm/contacts/${contact.id}`}
      className="font-medium hover:underline"
    >
      <div className="flex flex-col gap-1">
        <span>{contact.name}</span>
        {contact.pronouns && (
          <span className="text-xs text-muted-foreground">
            {contact.pronouns}
          </span>
        )}
      </div>
    </Link>
  );
};

const ContactEmailCell = ({ contact }: { contact: ContactRow }) => {
  const additionalCount = contact.additionalEmails?.length ?? 0;

  return (
    <div className="flex max-w-[260px] flex-col gap-1">
      <span className="break-all">{contact.email || "-"}</span>
      {additionalCount > 0 ? (
        <span className="text-xs text-muted-foreground">
          +{additionalCount} additional
        </span>
      ) : null}
    </div>
  );
};

export const contactColumns: ColumnDef<ContactRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => <ContactNameCell contact={row.original} />,
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ row }) => <ContactEmailCell contact={row.original} />,
  },
  {
    accessorKey: "phone",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Phone" />
    ),
    cell: ({ row }) => <span>{row.original.phone || "-"}</span>,
  },
  {
    accessorKey: "signal",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Signal" />
    ),
    cell: ({ row }) => <span>{row.original.signal || "-"}</span>,
  },
  {
    accessorKey: "website",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Website" />
    ),
    cell: ({ row }) => {
      const website = row.original.website;
      if (!website) {
        return <span>-</span>;
      }
      return (
        <a
          href={website}
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          {website}
        </a>
      );
    },
  },
  {
    accessorKey: "city",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="City" />
    ),
    cell: ({ row }) => <span>{row.original.city || "-"}</span>,
  },
  {
    accessorKey: "address",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Address" />
    ),
    cell: ({ row }) => {
      const parts = [
        row.original.address,
        row.original.postalCode,
        row.original.city,
        row.original.state,
        row.original.country,
      ].filter(Boolean);
      return <span>{parts.length ? parts.join(", ") : "-"}</span>;
    },
  },
  {
    accessorKey: "profileAttributes",
    enableSorting: false,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Attributes" />
    ),
    cell: ({ row }) => renderAttributes(row.original.profileAttributes),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => <span>{formatDate(row.original.createdAt)}</span>,
    sortingFn: (rowA, rowB) =>
      getDateValue(rowA.original.createdAt) -
      getDateValue(rowB.original.createdAt),
  },
];

export const renderContactCard = (contact: ContactRow, teamId: string) => {
  return (
    <Link href={`/teams/${teamId}/crm/contacts/${contact.id}`}>
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-3 hover:bg-accent transition-colors cursor-pointer">
        <div>
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">{contact.name}</h3>
            {contact.pronouns && (
              <p className="text-xs text-muted-foreground">
                {contact.pronouns}
              </p>
            )}
            {(contact.email ||
              contact.phone ||
              contact.signal ||
              contact.website ||
              contact.city ||
              contact.address ||
              contact.postalCode ||
              contact.state ||
              contact.country) && (
              <p className="text-xs text-muted-foreground">
                {[
                  contact.email,
                  ...(contact.additionalEmails?.map((entry) => entry.email) ??
                    []),
                  contact.phone,
                  contact.signal,
                  contact.website,
                  contact.address,
                  contact.postalCode,
                  contact.city,
                  contact.state,
                  contact.country,
                ]
                  .filter(Boolean)
                  .join(" | ")}
              </p>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Attributes
          </p>
          {renderAttributes(contact.profileAttributes)}
        </div>
        <p className="text-xs text-muted-foreground">
          Added {formatDate(contact.createdAt)}
        </p>
      </div>
    </Link>
  );
};
