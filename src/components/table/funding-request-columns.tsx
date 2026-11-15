"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  Building2,
  CalendarCheck,
  CalendarPlus,
  CircleDot,
  CircleUserRound,
  Coins,
  HandCoins,
  PiggyBank,
  Wallet,
} from "lucide-react";
import {
  AmountCell,
  OrganizationCell,
} from "@/components/funding/funding-cells";
import { FundingStatusChip } from "@/components/funding/funding-status";
import {
  DateCell,
  RecordNameCell,
  TextCell,
} from "@/components/records/record-cells";
import type { FundingStatus } from "@/types";

/** A funding request as the list API sends it (decimals arrive as strings). */
export type FundingRequestRow = {
  id: string;
  name: string;
  status: FundingStatus;
  amountRequested?: string | number | null;
  amountAgreed?: string | number | null;
  remainingAmount?: string | number | null;
  expectedCompletionDate?: string | null;
  createdAt: string;
  organization?: { id: string; name?: string | null } | null;
  submittedBy?: { name?: string | null; email?: string | null } | null;
};

export const FUNDING_REQUEST_COLUMN_DEFAULTS: Record<string, boolean> = {
  submittedBy: false,
};

export const fundingRequestName = (request: FundingRequestRow) =>
  request.name?.trim() || "Untitled funding request";

export const getFundingRequestColumns = ({
  getHref,
  getOrganizationHref,
  showOrganization,
}: {
  getHref: (request: FundingRequestRow) => string;
  getOrganizationHref?: (organizationId: string) => string;
  /** An organization's own list is all theirs; no need to say so per row. */
  showOrganization: boolean;
}): ColumnDef<FundingRequestRow, unknown>[] => [
  {
    id: "name",
    meta: {
      label: "Funding request",
      icon: HandCoins,
      sortField: "name",
      width: 280,
      pinned: true,
      alwaysVisible: true,
    },
    cell: ({ row }) => (
      <RecordNameCell
        kind="record"
        icon={HandCoins}
        name={fundingRequestName(row.original)}
        href={getHref(row.original)}
      />
    ),
  },
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
        } satisfies ColumnDef<FundingRequestRow, unknown>,
      ]
    : []),
  {
    id: "status",
    meta: {
      label: "Status",
      icon: CircleDot,
      sortField: "status",
      width: 180,
    },
    cell: ({ row }) => <FundingStatusChip status={row.original.status} />,
  },
  {
    id: "amountRequested",
    meta: {
      label: "Requested",
      icon: Coins,
      sortField: "amountRequested",
      width: 140,
      align: "right",
    },
    cell: ({ row }) => <AmountCell value={row.original.amountRequested} />,
  },
  {
    id: "amountAgreed",
    meta: {
      label: "Agreed",
      icon: PiggyBank,
      sortField: "amountAgreed",
      width: 140,
      align: "right",
    },
    cell: ({ row }) => <AmountCell value={row.original.amountAgreed} />,
  },
  {
    id: "remainingAmount",
    meta: {
      label: "Remaining",
      icon: Wallet,
      sortField: "remainingAmount",
      width: 140,
      align: "right",
    },
    cell: ({ row }) => <AmountCell value={row.original.remainingAmount} />,
  },
  {
    id: "expectedCompletionDate",
    meta: {
      label: "Expected completion",
      icon: CalendarCheck,
      sortField: "expectedCompletionDate",
      width: 180,
    },
    cell: ({ row }) => <DateCell value={row.original.expectedCompletionDate} />,
  },
  {
    id: "submittedBy",
    meta: { label: "Submitted by", icon: CircleUserRound, width: 220 },
    cell: ({ row }) => {
      const person = row.original.submittedBy;
      return <TextCell value={person?.name || person?.email} />;
    },
  },
  {
    id: "createdAt",
    meta: {
      label: "Created",
      icon: CalendarPlus,
      sortField: "createdAt",
      width: 140,
    },
    cell: ({ row }) => <DateCell value={row.original.createdAt} />,
  },
];
