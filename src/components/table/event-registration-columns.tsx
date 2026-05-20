"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type EventRegistrationRow = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  createdAt: string;
  contactId: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
};

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return format(parsed, "PPP p");
};

const RegistrantCell = ({
  registration,
}: {
  registration: EventRegistrationRow;
}) => {
  const params = useParams();
  const teamId = params.teamId as string;
  const displayName = registration.contactName || registration.name;

  return (
    <div className="flex flex-col">
      <Link
        href={`/teams/${teamId}/crm/contacts/${registration.contactId}`}
        className="font-medium text-foreground underline underline-offset-2 hover:text-foreground"
      >
        {displayName}
      </Link>
      {registration.name && registration.name !== displayName && (
        <span className="text-xs text-muted-foreground">
          Registered as {registration.name}
        </span>
      )}
    </div>
  );
};

const EmailCell = ({ email }: { email: string }) => {
  if (!email) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <a
      href={`mailto:${email}`}
      className="break-all text-sm text-foreground underline underline-offset-2 hover:text-foreground"
    >
      {email}
    </a>
  );
};

const PhoneCell = ({ phone }: { phone?: string }) => {
  if (!phone) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <a
      href={`tel:${phone}`}
      className="text-sm text-foreground underline underline-offset-2 hover:text-foreground"
    >
      {phone}
    </a>
  );
};

const NotesCell = ({ notes }: { notes?: string }) => {
  if (!notes) {
    return <span className="text-muted-foreground">—</span>;
  }

  return <span className="line-clamp-2 text-sm text-foreground">{notes}</span>;
};

const RegisteredAtCell = ({ createdAt }: { createdAt: string }) => (
  <span className="text-sm text-muted-foreground">
    {formatDateTime(createdAt)}
  </span>
);

export const eventRegistrationColumns: ColumnDef<EventRegistrationRow>[] = [
  {
    header: "Registrant",
    accessorKey: "contactName",
    cell: ({ row }) => <RegistrantCell registration={row.original} />,
  },
  {
    header: "Email",
    accessorKey: "email",
    cell: ({ row }) => <EmailCell email={row.original.email} />,
  },
  {
    header: "Phone",
    accessorKey: "phone",
    cell: ({ row }) => <PhoneCell phone={row.original.phone} />,
  },
  {
    header: "Registered",
    accessorKey: "createdAt",
    cell: ({ row }) => <RegisteredAtCell createdAt={row.original.createdAt} />,
  },
  {
    header: "Notes",
    accessorKey: "notes",
    cell: ({ row }) => <NotesCell notes={row.original.notes} />,
  },
];

export const renderEventRegistrationCard = (
  registration: EventRegistrationRow,
) => (
  <Card key={registration.id} className="shadow-sm">
    <CardHeader className="pb-2">
      <CardTitle className="text-base">
        {registration.contactName || registration.name}
      </CardTitle>
      <p className="text-xs text-muted-foreground">
        {formatDateTime(registration.createdAt)}
      </p>
    </CardHeader>
    <CardContent className="space-y-2">
      <div className="text-sm">
        <span className="font-medium">Email: </span>
        {registration.email ? (
          <a
            href={`mailto:${registration.email}`}
            className="break-all text-foreground underline underline-offset-2 hover:text-foreground"
          >
            {registration.email}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div className="text-sm">
        <span className="font-medium">Phone: </span>
        {registration.phone ? (
          <a
            href={`tel:${registration.phone}`}
            className="text-foreground underline underline-offset-2 hover:text-foreground"
          >
            {registration.phone}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div className="text-sm">
        <span className="font-medium">Notes: </span>
        {registration.notes ? (
          <span>{registration.notes}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </CardContent>
  </Card>
);