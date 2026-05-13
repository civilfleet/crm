"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import Link from "next/link";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

export type OrganizationColumns = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  website?: string;
  taxID?: string;
  isFilledByOrg: boolean;
  orgType?: {
    id: string;
    name: string;
    color?: string;
  };
  contactPerson?: {
    id: string;
    name?: string;
    email?: string;
  };
  user?: {
    email: string;
  };
  bankDetails?: {
    bankName: string;
  };
  team?: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
};

function OrganizationActions({
  organization,
  mutate,
  basePath,
}: {
  organization: OrganizationColumns;
  mutate: () => void;
  basePath: string;
}) {
  const { toast } = useToast();

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/organizations/${organization.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete organization");
      }

      toast({
        title: "Success",
        description: "Organization deleted successfully",
      });

      // Revalidate the organizations data
      mutate();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to delete organization",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex gap-2">
      <Link href={`${basePath}/${organization.id}`}>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </Link>
      <Button variant="destructive" size="sm" onClick={handleDelete}>
        Delete
      </Button>
    </div>
  );
}

export const columns = (
  mutate: () => void,
  basePath: string,
): ColumnDef<OrganizationColumns>[] => [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-left font-medium">
          {row.getValue("name") || "N/A"}
        </div>
      );
    },
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-left font-medium">
          {row.getValue("email") || "N/A"}
        </div>
      );
    },
  },
  {
    accessorKey: "team.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Team" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-left font-medium">
          {row.original.team?.name || "N/A"}
        </div>
      );
    },
  },
  {
    accessorKey: "orgType.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const type = row.original.orgType;
      if (!type) {
        return <div className="text-left text-muted-foreground">N/A</div>;
      }
      return (
        <div className="text-left">
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
        </div>
      );
    },
  },
  {
    accessorKey: "contactPerson",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Contact person" />
    ),
    cell: ({ row }) => {
      const contact = row.original.contactPerson;
      if (!contact) {
        return <div className="text-left text-muted-foreground">N/A</div>;
      }
      return (
        <div className="text-left font-medium">
          {contact.name || contact.email || "Unnamed"}
        </div>
      );
    },
  },
  {
    accessorKey: "phone",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Phone" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-left font-medium">
          {row.getValue("phone") || "N/A"}
        </div>
      );
    },
  },
  {
    accessorKey: "isFilledByOrg",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Registration Type" />
    ),
    cell: ({ row }) => {
      const isFilledByOrg = row.getValue("isFilledByOrg");
      return (
        <div className="text-left">
          <Badge variant={isFilledByOrg ? "default" : "secondary"}>
            {isFilledByOrg ? "Self-Registered" : "Admin-Registered"}
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: "country",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Country" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-left font-medium">
          {row.getValue("country") || "N/A"}
        </div>
      );
    },
  },
  {
    accessorKey: "website",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Website" />
    ),
    cell: ({ row }) => {
      const website = row.getValue("website") as string;
      const websiteUrl =
        website && !website.startsWith("http") ? `https://${website}` : website;

      return (
        <div className="text-left text-blue-500">
          {website ? (
            <Link
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {website}
            </Link>
          ) : (
            "N/A"
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "taxID",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tax ID" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-left font-medium">
          {row.getValue("taxID") || "N/A"}
        </div>
      );
    },
  },
  {
    accessorKey: "bankDetails.bankName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Bank Name" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-left font-medium">
          {row.original.bankDetails?.bankName || "N/A"}
        </div>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created At" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-left font-medium">
          {format(new Date(row.getValue("createdAt")), "PP")}
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      return (
        <OrganizationActions
          organization={row.original}
          mutate={mutate}
          basePath={basePath}
        />
      );
    },
  },
];