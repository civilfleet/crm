import type { ColumnDef, Row } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import formatCurrency from "@/components/helper/format-currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Transaction } from "@/types";
import { UploadReceiptModal } from "../upload-receipt-modal";

const ActionsCell = ({ row }: { row: Row<Transaction> }) => {
  const transaction = row.original;
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setIsUploadModalOpen(true)}>
            Upload Receipt
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </DropdownMenuContent>
      </DropdownMenu>

      <UploadReceiptModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={(_fileUrl) => {
          // The table will automatically refresh due to the data being refetched
        }}
        transactionId={transaction.id}
      />
    </>
  );
};

export const columns: ColumnDef<Transaction>[] = [
  {
    id: "actions",
    cell: ActionsCell,
  },
  {
    accessorKey: "fundingRequest.name",
    header: () => <div className="text-left w-36">Funding Request</div>,
    cell: ({ row }) => (
      <div className="text-left">
        {row.original?.fundingRequest?.name || "N/A"}
      </div>
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
    accessorKey: "amount",
    header: () => <div className="text-left w-36">Amount</div>,
    cell: ({ row }) => (
      <div className="text-left font-medium">
        {formatCurrency(row.getValue("amount"))}
      </div>
    ),
  },
  {
    accessorKey: "totalAmount",
    header: () => <div className="text-left w-36">Total Amount</div>,
    cell: ({ row }) => (
      <div className="text-left font-medium">
        {formatCurrency(row.getValue("totalAmount"))}
      </div>
    ),
  },
  {
    accessorKey: "remainingAmount",
    header: () => <div className="text-left w-36">Remaining Amount</div>,
    cell: ({ row }) => (
      <div className="text-left font-medium">
        {formatCurrency(row.getValue("remainingAmount"))}
      </div>
    ),
  },
  {
    accessorKey: "transactionReciept",
    header: () => <div className="text-left w-36">Receipt</div>,
    cell: ({ row }) => (
      <div className="text-left">
        <Badge
          variant="secondary"
          className={
            row.getValue("transactionReciept") ? "bg-green-300" : "bg-red-300"
          }
        >
          {row.getValue("transactionReciept") ? (
            <a
              href={`${process.env.NEXT_PUBLIC_BASE_URL}/api/files/${row.getValue("transactionReciept")}`}
              target="_blank"
              rel="noopener"
            >
              View
            </a>
          ) : (
            "Pending"
          )}
        </Badge>
      </div>
    ),
  },
  {
    accessorKey: "createdAt",
    header: () => <div className="text-left w-36">Created At</div>,
    cell: ({ row }) => (
      <div className="text-left">
        {new Date(row.getValue("createdAt")).toLocaleString()}
      </div>
    ),
  },
];
