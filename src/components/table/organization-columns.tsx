"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  contacts?: Array<{
    id: string;
    teamId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  }>;
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

/*
  Delete moves an organization to the trash; from there it is restored or
  deleted for good (docs/DATA_RULES.md, "Organizations in the trash").
*/

export type OrganizationAction = "trash" | "restore" | "delete";

/** What each action says before it runs, and after. */
export const ORGANIZATION_ACTIONS: Record<
  OrganizationAction,
  { label: string; warning: string; done: string; destructive: boolean }
> = {
  trash: {
    label: "Move to trash",
    warning:
      "It leaves every list, and its users lose access, together with its funding requests, agreements and payments. Nothing is deleted: you can restore it from the trash.",
    done: "moved to the trash",
    destructive: true,
  },
  restore: {
    label: "Restore",
    warning:
      "It comes back as it was, with its funding requests, agreements, payments and users.",
    done: "restored",
    destructive: false,
  },
  delete: {
    label: "Delete permanently",
    warning:
      "Its funding requests, donation agreements and files are deleted with it. This cannot be undone.",
    done: "deleted permanently",
    destructive: true,
  },
};

export const requestOrganizationAction = (
  id: string,
  action: OrganizationAction,
) =>
  fetch(
    action === "trash"
      ? `/api/organizations/${id}`
      : `/api/organizations/${id}/trash`,
    { method: action === "restore" ? "PATCH" : "DELETE" },
  );

/** A button that asks before it runs an organization action. */
export const ConfirmOrganizationAction = ({
  action,
  title,
  trigger,
  onConfirm,
}: {
  action: OrganizationAction;
  title: string;
  trigger: ReactNode;
  onConfirm: () => void;
}) => {
  const { label, warning, destructive } = ORGANIZATION_ACTIONS[action];
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{warning}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
            onClick={onConfirm}
          >
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

function OrganizationActions({
  organization,
  mutate,
  basePath,
  inTrash,
}: {
  organization: OrganizationColumns;
  mutate: () => void;
  basePath: string;
  inTrash: boolean;
}) {
  const { toast } = useToast();
  const name = organization.name || organization.email || "this organization";

  const handleAction = async (action: OrganizationAction) => {
    try {
      const response = await requestOrganizationAction(organization.id, action);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "The organization could not be changed.");
      }
      toast({ title: `${name} ${ORGANIZATION_ACTIONS[action].done}` });
      mutate();
    } catch (error) {
      toast({
        title: `Unable to ${ORGANIZATION_ACTIONS[action].label.toLowerCase()}`,
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  if (inTrash) {
    return (
      <div className="flex gap-2">
        <ConfirmOrganizationAction
          action="restore"
          title={`Restore ${name}?`}
          trigger={
            <Button variant="outline" size="sm">
              Restore
            </Button>
          }
          onConfirm={() => handleAction("restore")}
        />
        <ConfirmOrganizationAction
          action="delete"
          title={`Delete ${name} permanently?`}
          trigger={
            <Button variant="destructive" size="sm">
              Delete
            </Button>
          }
          onConfirm={() => handleAction("delete")}
        />
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Link href={`${basePath}/${organization.id}`}>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </Link>
      <ConfirmOrganizationAction
        action="trash"
        title={`Move ${name} to the trash?`}
        trigger={
          <Button variant="destructive" size="sm">
            Delete
          </Button>
        }
        onConfirm={() => handleAction("trash")}
      />
    </div>
  );
}

export const columns = (
  mutate: () => void,
  basePath: string,
  inTrash = false,
): ColumnDef<OrganizationColumns, unknown>[] => [
  {
    accessorKey: "name",
    meta: {
      label: "Name",
      sortField: "name",
      width: 260,
      pinned: true,
      alwaysVisible: true,
    },
    cell: ({ row }) => {
      const organization = row.original;
      return (
        <Link
          href={`${basePath}/${organization.id}`}
          className="font-medium hover:underline"
        >
          {organization.name || "N/A"}
        </Link>
      );
    },
  },
  {
    accessorKey: "email",
    meta: { label: "Email", sortField: "email", width: 220 },
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
    meta: { sortField: "team", label: "Team", width: 160 },
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
    meta: { sortField: "type", label: "Type", width: 150 },
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
    meta: { sortField: "contactPerson", label: "Contact person", width: 180 },
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
    meta: { sortField: "phone", label: "Phone", width: 150 },
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
    meta: {
      sortField: "isFilledByOrg",
      label: "Registration Type",
      width: 170,
    },
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
    meta: { label: "Country", sortField: "country", width: 140 },
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
    meta: { sortField: "website", label: "Website", width: 200 },
    cell: ({ row }) => {
      const website = row.getValue("website") as string;
      const websiteUrl =
        website && !website.startsWith("http") ? `https://${website}` : website;

      return (
        <div className="text-left text-info">
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
    meta: { sortField: "taxID", label: "Tax ID", width: 140 },
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
    meta: { sortField: "bankName", label: "Bank Name", width: 160 },
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
    meta: { label: "Created At", sortField: "createdAt", width: 150 },
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
    meta: { label: "Actions", width: 170, alwaysVisible: true },
    cell: ({ row }) => {
      return (
        <OrganizationActions
          organization={row.original}
          mutate={mutate}
          basePath={basePath}
          inTrash={inTrash}
        />
      );
    },
  },
];
