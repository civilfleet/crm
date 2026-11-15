"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeftRight,
  Building2,
  CalendarPlus,
  Coins,
  PiggyBank,
  Receipt,
  Upload,
  Wallet,
} from "lucide-react";
import {
  AmountCell,
  OrganizationCell,
} from "@/components/funding/funding-cells";
import { DateCell, RecordNameCell } from "@/components/records/record-cells";

/** A transaction as the list API sends it (decimals arrive as strings). */
export type TransactionRow = {
  id: string;
  amount: string | number;
  totalAmount?: string | number | null;
  remainingAmount?: string | number | null;
  transactionReciept?: string | null;
  createdAt: string;
  fundingRequest?: { id: string; name?: string | null } | null;
  organization?: { id: string; name?: string | null } | null;
};

export const TRANSACTION_COLUMN_DEFAULTS: Record<string, boolean> = {};

type ReceiptCellProps = {
  transaction: TransactionRow;
  onUpload: (transaction: TransactionRow) => void;
};

/** The receipt, or the way to add the missing one. */
const ReceiptCell = ({ transaction, onUpload }: ReceiptCellProps) => {
  if (transaction.transactionReciept) {
    return (
      <a
        href={`/api/files/${transaction.transactionReciept}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-full items-center gap-1.5 truncate rounded-sm text-interactive hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
      >
        <Receipt aria-hidden="true" className="size-3.5 shrink-0" />
        View receipt
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onUpload(transaction)}
      className="inline-flex h-6 items-center gap-1.5 rounded-md border border-dashed px-1.5 text-xs text-muted-foreground transition-colors hover:border-input hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
    >
      <Upload aria-hidden="true" className="size-3.5" />
      Upload receipt
    </button>
  );
};

export const getTransactionColumns = ({
  getFundingRequestHref,
  getOrganizationHref,
  showFundingRequest,
  showOrganization,
  onUploadReceipt,
}: {
  getFundingRequestHref?: (fundingRequestId: string) => string;
  getOrganizationHref?: (organizationId: string) => string;
  /** Inside a funding request, every row is that request's. */
  showFundingRequest: boolean;
  showOrganization: boolean;
  onUploadReceipt: (transaction: TransactionRow) => void;
}): ColumnDef<TransactionRow, unknown>[] => [
  ...(showFundingRequest
    ? [
        {
          id: "fundingRequest",
          meta: {
            label: "Funding request",
            icon: ArrowLeftRight,
            sortField: "fundingRequest",
            width: 280,
            pinned: true,
            alwaysVisible: true,
          },
          cell: ({ row }) => {
            const request = row.original.fundingRequest;
            if (!request) return null;
            return (
              <RecordNameCell
                kind="record"
                icon={ArrowLeftRight}
                name={request.name?.trim() || "Untitled funding request"}
                href={getFundingRequestHref?.(request.id)}
              />
            );
          },
        } satisfies ColumnDef<TransactionRow, unknown>,
      ]
    : []),
  ...(showOrganization
    ? [
        {
          id: "organization",
          meta: {
            label: "Organization",
            icon: Building2,
            sortField: "organization",
            width: 220,
          },
          cell: ({ row }) => {
            const organization = row.original.organization;
            return (
              <OrganizationCell
                organization={organization}
                href={
                  organization && getOrganizationHref
                    ? getOrganizationHref(organization.id)
                    : undefined
                }
              />
            );
          },
        } satisfies ColumnDef<TransactionRow, unknown>,
      ]
    : []),
  {
    id: "amount",
    meta: {
      label: "Amount",
      icon: Coins,
      sortField: "amount",
      width: 140,
      align: "right",
    },
    cell: ({ row }) => <AmountCell value={row.original.amount} />,
  },
  {
    id: "totalAmount",
    meta: {
      label: "Agreed total",
      icon: PiggyBank,
      sortField: "totalAmount",
      width: 140,
      align: "right",
    },
    cell: ({ row }) => <AmountCell value={row.original.totalAmount} />,
  },
  {
    id: "remainingAmount",
    meta: {
      label: "Remaining after",
      icon: Wallet,
      sortField: "remainingAmount",
      width: 150,
      align: "right",
    },
    cell: ({ row }) => <AmountCell value={row.original.remainingAmount} />,
  },
  {
    id: "receipt",
    meta: { label: "Receipt", icon: Receipt, width: 160 },
    cell: ({ row }) => (
      <ReceiptCell transaction={row.original} onUpload={onUploadReceipt} />
    ),
  },
  {
    id: "createdAt",
    meta: {
      label: "Date",
      icon: CalendarPlus,
      sortField: "createdAt",
      width: 140,
      // Without a funding request column, the date is what tells rows apart.
      alwaysVisible: !showFundingRequest,
    },
    cell: ({ row }) => <DateCell value={row.original.createdAt} />,
  },
];
