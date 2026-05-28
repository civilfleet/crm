import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import formatCurrency from "@/components/helper/format-currency";
import {
  DonationAgreementStatusBadge,
  DonationPayoutStatusBadge,
  getDonationPayoutStatus,
} from "@/components/helper/status-badge";
import { Button } from "@/components/ui/button";
import type { DonationAgreement } from "@/types";

const truncateText = (value?: string, maxLength = 20) => {
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
};

export const columns: ColumnDef<DonationAgreement>[] = [
  {
    id: "actions",
    header: () => <div className="text-left">Actions</div>,
    cell: ({ row }) => {
      const request = row.original;

      return (
        <div className="text-left">
          <Button asChild variant="outline" size="sm">
            <Link href={`donation-agreements/${request.id}`}>View</Link>
          </Button>
        </div>
      );
    },
  },
  {
    accessorKey: "fundingRequest",
    header: () => <div className="text-left w-36">Funding Request</div>,
    cell: ({ row }) => (
      <div className="text-left">
        {truncateText(row.original?.fundingRequest?.name, 20) || "N/A"}
      </div>
    ),
  },

  {
    accessorKey: "status",
    header: () => <div className="text-left w-36">Status</div>,
    cell: ({ row }) => {
      const signed = row.original.userSignatures.every((user) => user.signedAt);

      return (
        <div className="text-left">
          <DonationAgreementStatusBadge
            status={signed ? "completed" : "pending"}
          />
        </div>
      );
    },
  },
  {
    id: "amountAgreed",
    header: () => <div className="text-left w-36">Agreed Amount</div>,
    cell: ({ row }) => {
      const amountAgreed = row.original.fundingRequest?.amountAgreed;
      return (
        <div className="text-left w-36">
          {amountAgreed !== undefined && amountAgreed !== null
            ? formatCurrency(Number(amountAgreed))
            : "Not set"}
        </div>
      );
    },
  },
  {
    id: "payoutStatus",
    header: () => <div className="text-left w-44">Payout</div>,
    cell: ({ row }) => {
      const fundingRequest = row.original.fundingRequest;
      const payoutStatus = getDonationPayoutStatus({
        fundingStatus: fundingRequest?.status,
        amountAgreed:
          fundingRequest?.amountAgreed !== undefined &&
          fundingRequest?.amountAgreed !== null
            ? Number(fundingRequest.amountAgreed)
            : null,
        remainingAmount:
          fundingRequest?.remainingAmount !== undefined &&
          fundingRequest?.remainingAmount !== null
            ? Number(fundingRequest.remainingAmount)
            : null,
      });

      return (
        <div className="text-left w-44">
          <DonationPayoutStatusBadge status={payoutStatus} />
        </div>
      );
    },
  },
  {
    accessorKey: "createdBy",
    header: () => <div className="text-left w-36">Created By</div>,
    cell: ({ row }) => (
      <div className="text-left">{row.original?.createdBy.email || "N/A"}</div>
    ),
  },
  {
    accessorKey: "createdAt",
    header: () => <div className="text-left w-36">Created At</div>,
    cell: ({ row }) => (
      <div className="text-left">
        {row.original?.createdAt
          ? new Date(row.original.createdAt).toLocaleString()
          : "N/A"}
      </div>
    ),
  },
];