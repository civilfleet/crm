"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  Banknote,
  Building2,
  CalendarPlus,
  CircleUserRound,
  FilePenLine,
  PenLine,
  PiggyBank,
} from "lucide-react";
import {
  AmountCell,
  OrganizationCell,
} from "@/components/funding/funding-cells";
import { toAmount } from "@/components/funding/funding-format";
import {
  PayoutStatusChip,
  StatusChip,
} from "@/components/funding/funding-status";
import { getDonationPayoutStatus } from "@/components/helper/status-badge";
import {
  DateCell,
  RecordNameCell,
  TextCell,
} from "@/components/records/record-cells";
import type { FundingStatus } from "@/types";

/** A donation agreement as the list API sends it. */
export type DonationAgreementRow = {
  id: string;
  createdAt: string;
  userSignatures: Array<{
    signedAt?: string | null;
    user?: { name?: string | null; email?: string | null } | null;
  }>;
  createdBy?: { name?: string | null; email?: string | null } | null;
  organization?: { id: string; name?: string | null } | null;
  fundingRequest?: {
    id: string;
    name?: string | null;
    amountAgreed?: string | number | null;
    remainingAmount?: string | number | null;
    status?: FundingStatus | null;
  } | null;
};

export const DONATION_AGREEMENT_COLUMN_DEFAULTS: Record<string, boolean> = {
  createdBy: false,
};

export const donationAgreementName = (agreement: DonationAgreementRow) =>
  agreement.fundingRequest?.name?.trim() || "Untitled agreement";

const signerName = (
  signature: DonationAgreementRow["userSignatures"][number],
) => signature.user?.name || signature.user?.email || "Unknown signer";

const SignaturesChip = ({
  signatures,
}: {
  signatures: DonationAgreementRow["userSignatures"];
}) => {
  if (signatures.length === 0) return null;
  const pending = signatures.filter((signature) => !signature.signedAt);
  if (pending.length === 0) {
    return (
      <StatusChip
        label="Signed"
        tone="success"
        description={`Signed by ${signatures.map(signerName).join(", ")}`}
      />
    );
  }
  return (
    <StatusChip
      label={`${signatures.length - pending.length} of ${signatures.length} signed`}
      tone="warning"
      description={`Waiting for ${pending.map(signerName).join(", ")}`}
    />
  );
};

export const getDonationAgreementColumns = ({
  getHref,
  getOrganizationHref,
  showOrganization,
}: {
  getHref: (agreement: DonationAgreementRow) => string;
  getOrganizationHref?: (organizationId: string) => string;
  showOrganization: boolean;
}): ColumnDef<DonationAgreementRow, unknown>[] => [
  {
    id: "fundingRequest",
    meta: {
      label: "Funding request",
      icon: FilePenLine,
      sortField: "fundingRequest",
      width: 280,
      pinned: true,
      alwaysVisible: true,
    },
    cell: ({ row }) => (
      <RecordNameCell
        kind="record"
        icon={FilePenLine}
        name={donationAgreementName(row.original)}
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
        } satisfies ColumnDef<DonationAgreementRow, unknown>,
      ]
    : []),
  {
    id: "signatures",
    meta: { label: "Signatures", icon: PenLine, width: 160 },
    cell: ({ row }) => (
      <SignaturesChip signatures={row.original.userSignatures ?? []} />
    ),
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
    cell: ({ row }) => (
      <AmountCell value={row.original.fundingRequest?.amountAgreed} />
    ),
  },
  {
    id: "payout",
    meta: { label: "Payout", icon: Banknote, width: 180 },
    cell: ({ row }) => {
      const request = row.original.fundingRequest;
      if (!request) return null;
      return (
        <PayoutStatusChip
          status={getDonationPayoutStatus({
            fundingStatus: request.status ?? undefined,
            amountAgreed: toAmount(request.amountAgreed),
            remainingAmount: toAmount(request.remainingAmount),
          })}
        />
      );
    },
  },
  {
    id: "createdBy",
    meta: { label: "Created by", icon: CircleUserRound, width: 220 },
    cell: ({ row }) => {
      const person = row.original.createdBy;
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
