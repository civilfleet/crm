import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { File } from "@/types";

const getBaseFundingPath = (teamId: string, organizationId: string) => {
  if (teamId) {
    return `/teams/${teamId}/funding`;
  }
  return `/organizations/${organizationId}`;
};

const getAssociatedResource = (
  file: File,
  teamId: string,
  organizationId: string,
) => {
  const basePath = getBaseFundingPath(teamId, organizationId);

  const donationAgreement = file.donationAgreement?.[0];
  if (donationAgreement?.id) {
    return {
      label: donationAgreement.fundingRequest?.name
        ? `Donation Agreement: ${donationAgreement.fundingRequest.name}`
        : "Donation Agreement",
      href: `${basePath}/donation-agreements/${donationAgreement.id}`,
    };
  }

  if (file.FundingRequest?.id) {
    return {
      label: file.FundingRequest.name
        ? `Funding Request: ${file.FundingRequest.name}`
        : "Funding Request",
      href: `${basePath}/funding-requests/${file.FundingRequest.id}`,
    };
  }

  const transaction = file.Transaction?.[0];
  if (transaction) {
    return {
      label: transaction.fundingRequest?.name
        ? `Transaction: ${transaction.fundingRequest.name}`
        : "Transaction",
      href: `${basePath}/transactions`,
    };
  }

  return null;
};

export const getFileColumns = (
  teamId: string,
  organizationId: string,
  includeContactFiles = false,
  onDelete?: (file: File) => void,
): ColumnDef<File>[] => [
  {
    id: "actions",
    header: () => <div className="text-left w-28">Actions</div>,
    cell: ({ row }) => (
      <div className="flex items-center gap-2 text-left">
        <Button asChild size="sm" variant="outline">
          <Link
            href={`${process.env.NEXT_PUBLIC_BASE_URL}/api/files/${row.original?.id}`}
          >
            Download
          </Link>
        </Button>
        {onDelete ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => onDelete(row.original)}
          >
            Delete
          </Button>
        ) : null}
      </div>
    ),
  },
  {
    id: "associatedResource",
    header: () => <div className="text-left w-64">Associated Resource</div>,
    cell: ({ row }) => {
      if (includeContactFiles && row.original.contact?.id) {
        return (
          <div className="text-left w-64">
            <Link
              className="text-blue-600 hover:underline"
              href={`/teams/${row.original.contact.teamId}/crm/contacts/${row.original.contact.id}`}
            >
              Contact: {row.original.contact.name}
            </Link>
          </div>
        );
      }

      const resource = getAssociatedResource(
        row.original,
        teamId,
        organizationId,
      );
      if (!resource) {
        return <div className="text-left w-64">N/A</div>;
      }

      return (
        <div className="text-left w-64">
          <Link className="text-blue-600 hover:underline" href={resource.href}>
            {resource.label}
          </Link>
        </div>
      );
    },
  },
  ...(includeContactFiles
    ? [
        {
          id: "contact",
          header: () => <div className="text-left w-44">Contact</div>,
          cell: ({ row }) => (
            <div className="text-left w-44">
              {row.original.contact?.id ? (
                <Link
                  className="text-blue-600 hover:underline"
                  href={`/teams/${row.original.contact.teamId}/crm/contacts/${row.original.contact.id}`}
                >
                  {row.original.contact.name}
                </Link>
              ) : (
                "N/A"
              )}
            </div>
          ),
        } satisfies ColumnDef<File>,
      ]
    : []),
  {
    accessorKey: "organization",
    header: () => <div className="text-left w-36">Organization</div>,
    cell: ({ row }) => (
      <div className="text-left">
        {row.original?.organization?.name || "N/A"}
      </div>
    ),
  },
  {
    accessorKey: "type",
    header: () => <div className="text-left w-36">Type</div>,
    cell: ({ row }) => (
      <div className="text-left">{row.original?.type || "N/A"}</div>
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
  {
    accessorKey: "updatedAt",
    header: () => <div className="text-left w-36">Updated At</div>,
    cell: ({ row }) => (
      <div className="text-left">
        {row.original?.updatedAt
          ? new Date(row.original.updatedAt).toLocaleString()
          : "N/A"}
      </div>
    ),
  },
  {
    accessorKey: "url",
    header: () => <div className="text-left w-36">File</div>,
    cell: ({ row }) => (
      <div className="text-left text-blue-500">
        <Link
          href={`${process.env.NEXT_PUBLIC_BASE_URL}/api/files/${row.original?.id}`}
        >
          {row.original?.name || row.original?.url || "N/A"}
        </Link>
      </div>
    ),
  },
  {
    accessorKey: "createdBy",
    header: () => <div className="text-left w-36">Created By</div>,
    cell: ({ row }) => (
      <div className="text-left">{row.original?.createdBy?.email || "N/A"}</div>
    ),
  },
  {
    accessorKey: "updatedBy",
    header: () => <div className="text-left w-36">Updated By</div>,
    cell: ({ row }) => (
      <div className="text-left">{row.original?.updatedBy?.email || "N/A"}</div>
    ),
  },
  {
    id: "lastDownloadedBy",
    header: () => <div className="text-left w-40">Last Downloaded By</div>,
    cell: ({ row }) => (
      <div className="text-left">
        {row.original.downloadAudits?.[0]?.user?.email || "Never"}
      </div>
    ),
  },
  {
    id: "lastDownloadedAt",
    header: () => <div className="text-left w-44">Last Downloaded At</div>,
    cell: ({ row }) => (
      <div className="text-left">
        {row.original.downloadAudits?.[0]?.createdAt
          ? new Date(row.original.downloadAudits[0].createdAt).toLocaleString()
          : "Never"}
      </div>
    ),
  },
];
