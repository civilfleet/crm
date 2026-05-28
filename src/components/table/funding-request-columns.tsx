import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link"; // Import Link
// import { MoreHorizontal } from "lucide-react"; // No longer needed
import { Button } from "@/components/ui/button";
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuSeparator,
//   DropdownMenuTrigger,
// } from "@/components/ui/dropdown-menu"; // No longer needed
import type { FundingRequest } from "@/types";
import { StatusBadge } from "../helper/status-badge";

export const columns: ColumnDef<FundingRequest>[] = [
  {
    id: "actions",
    header: () => <div className="text-left">Actions</div>,
    cell: ({ row }) => {
      const request = row.original;
      return (
        <div className="text-left">
          <Button asChild variant="outline" size="sm">
            <Link href={`funding-requests/${request.id}`} passHref>
              View
            </Link>
          </Button>
        </div>
      );
    },
  },
  {
    accessorKey: "name",
    header: () => <div className="text-left w-36">Funding Request</div>,
    cell: ({ row }) => (
      <div className="text-left">{row.original?.name || "N/A"}</div>
    ),
  },
  {
    accessorKey: "organization.name",
    header: () => <div className="text-left w-36">Organization</div>,
    cell: ({ row }) => (
      <div className="text-left">
        {row.original?.organization?.name || "N/A"}
      </div>
    ),
  },

  {
    accessorKey: "amountAgreed",
    header: () => <div className="text-left w-32">Amount Agreed</div>,
    cell: ({ row }) => {
      const amount = row.getValue("amountAgreed");
      return (
        <div className="text-left">
          {amount ? `€ ${amount.toLocaleString()}` : "€ 0"}
        </div>
      );
    },
  },
  {
    accessorKey: "remainingAmount",
    header: () => <div className="text-left w-32">Remaining Amount</div>,
    cell: ({ row }) => {
      const remainingAmount = row.getValue("remainingAmount");
      return (
        <div className="text-left">
          {remainingAmount ? `€ ${remainingAmount.toLocaleString()}` : "€ 0"}
        </div>
      );
    },
  },
  {
    accessorKey: "expectedCompletionDate",
    header: () => <div className="text-left w-36">Completion Date</div>,
    cell: ({ row }) => (
      <div className="text-left">
        {new Date(row.getValue("expectedCompletionDate")).toLocaleDateString()}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: () => <div className="text-left w-24">Status</div>,
    cell: ({ row }) => (
      <div className="text-left font-medium">
        <StatusBadge status={row.getValue("status")} />
      </div>
    ),
  },
  {
    accessorKey: "createdAt",
    header: () => <div className="text-left w-32">Created At</div>,
    cell: ({ row }) => (
      <div className="text-left">
        {new Date(row.getValue("createdAt"))?.toLocaleDateString()}
      </div>
    ),
  },
];
