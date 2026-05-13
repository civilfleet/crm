"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
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
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export type Team = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  website?: string;
  createdAt: string;
  updatedAt: string;
};

const ActionsCell = ({ team, mutate }: { team: Team; mutate: () => void }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/teams/${team.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete team");
      }

      toast({
        title: "Success",
        description: "Team deleted successfully",
      });

      // Revalidate the teams data
      mutate();
      setOpen(false);
    } catch (_error) {
      toast({
        title: "Error",
        description: "Failed to delete team",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex gap-2">
      <Link href={`/admin/teams/${team.id}/edit`}>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </Link>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm">
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              team &#34;{team.name}&#34; and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export const columns = (mutate: () => void): ColumnDef<Team>[] => [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
  },
  {
    accessorKey: "phone",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Phone" />
    ),
    cell: ({ row }) => row.original.phone || "-",
  },
  {
    accessorKey: "city",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="City" />
    ),
    cell: ({ row }) => row.original.city || "-",
  },
  {
    accessorKey: "country",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Country" />
    ),
    cell: ({ row }) => row.original.country || "-",
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created At" />
    ),
    cell: ({ row }) => {
      return format(new Date(row.getValue("createdAt")), "PP");
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <ActionsCell team={row.original} mutate={mutate} />,
  },
];