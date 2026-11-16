"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeftRight,
  Building2,
  CalendarClock,
  CalendarPlus,
  Download,
  FileArchive,
  File as FileIcon,
  FileImage,
  FilePenLine,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Link2,
  type LucideIcon,
  Shapes,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import {
  DateCell,
  formatRecordDate,
  RecordChip,
  RecordIcon,
  RecordNameCell,
  TextCell,
} from "@/components/records/record-cells";

/** CRM and Funding files of a team, or the files of one organization. */
export type FileListScope = "crm" | "funding" | "org";

export type FileRow = {
  id: string;
  name?: string | null;
  url: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  organizationId?: string | null;
  organization?: { id: string; teamId?: string | null; name?: string | null };
  FundingRequest?: { id: string; name?: string | null } | null;
  donationAgreement?: Array<{
    id: string;
    fundingRequest?: { name?: string | null } | null;
  }>;
  Transaction?: Array<{
    id: string;
    fundingRequest?: { name?: string | null } | null;
  }>;
  contact?: { id: string; teamId: string; name: string } | null;
  createdBy?: { email: string } | null;
  updatedBy?: { email: string } | null;
  downloadAudits?: Array<{ createdAt: string; user: { email: string } }>;
};

const FILE_TYPE_LABELS: Record<string, string> = {
  TAX_EXEMPTION_CERTIFICATE: "Tax certificate",
  ARTICLES_OF_ASSOCIATION: "Articles of association",
  REPORT: "Report",
  LOGO: "Logo",
  DONATION_AGREEMENT: "Donation agreement",
  DONATION_RECEIPT: "Donation receipt",
  STATEMENT: "Statement",
  TRANSACTION_RECEIPT: "Transaction receipt",
  "application/pdf": "PDF",
  "application/msword": "Word document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word document",
  "application/vnd.ms-excel": "Spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "Spreadsheet",
  "text/csv": "CSV",
  "text/plain": "Text",
  "application/zip": "ZIP archive",
};

/** "TAX_EXEMPTION_CERTIFICATE" → "Tax certificate", "image/png" → "Image". */
export const getFileTypeLabel = (type?: string | null) => {
  if (!type) return "";
  const known = FILE_TYPE_LABELS[type];
  if (known) return known;
  if (type.startsWith("image/")) return "Image";
  if (type.includes("/")) return "File";
  const words = type.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const getExtension = (file: Pick<FileRow, "name" | "url">) => {
  const source = file.url || file.name || "";
  const match = /\.([a-z0-9]{1,5})$/i.exec(source);
  return match?.[1]?.toLowerCase() ?? "";
};

const getFileKindIcon = (file: Pick<FileRow, "name" | "url" | "type">) => {
  const extension = getExtension(file);
  if (
    file.type.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)
  ) {
    return FileImage;
  }
  if (["xls", "xlsx", "csv", "ods"].includes(extension)) {
    return FileSpreadsheet;
  }
  if (["zip", "gz", "7z", "rar"].includes(extension)) return FileArchive;
  if (["pdf", "doc", "docx", "odt", "txt", "md", "rtf"].includes(extension)) {
    return FileText;
  }
  return FileIcon;
};

export const getFileName = (file: Pick<FileRow, "name" | "url">) =>
  file.name?.trim() || file.url.split("/").pop() || file.url;

/**
 * Where a file row leads: its record in the CRM, or the file itself (shown
 * in the browser) where there is no record page.
 */
export const getFileHref = (
  file: Pick<FileRow, "id">,
  scope: FileListScope,
  teamId: string,
) =>
  scope === "crm"
    ? `/teams/${teamId}/crm/files/${file.id}`
    : `/api/files/${file.id}?preview=true`;

export const getFileDownloadHref = (file: Pick<FileRow, "id">) =>
  `/api/files/${file.id}`;

type LinkedRecord = {
  kind: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  person?: boolean;
};

/** The record a file belongs to: a person, a request, an agreement, a transaction. */
export const getLinkedRecord = (
  file: FileRow,
  scope: FileListScope,
  teamId: string,
  organizationId: string,
): LinkedRecord | null => {
  if (file.contact?.id) {
    return {
      kind: "Person",
      label: file.contact.name,
      href: `/teams/${file.contact.teamId}/crm/contacts/${file.contact.id}`,
      person: true,
    };
  }

  const basePath =
    scope === "org"
      ? `/organizations/${organizationId}`
      : `/teams/${teamId}/funding`;

  const agreement = file.donationAgreement?.[0];
  if (agreement?.id) {
    return {
      kind: "Donation agreement",
      icon: FilePenLine,
      label: agreement.fundingRequest?.name || "Donation agreement",
      href: `${basePath}/donation-agreements/${agreement.id}`,
    };
  }

  if (file.FundingRequest?.id) {
    return {
      kind: "Funding request",
      icon: HandCoins,
      label: file.FundingRequest.name || "Funding request",
      href: `${basePath}/funding-requests/${file.FundingRequest.id}`,
    };
  }

  const transaction = file.Transaction?.[0];
  if (transaction) {
    return {
      kind: "Transaction",
      icon: ArrowLeftRight,
      label: transaction.fundingRequest?.name || "Transaction",
      href: `${basePath}/transactions`,
    };
  }

  return null;
};

const chipLinkClass =
  "inline-flex max-w-full rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden hover:[&>span]:border-input hover:[&>span]:bg-accent";

/** Columns that open hidden; the Columns menu brings them back. */
export const getFileColumnDefaults = (
  scope: FileListScope,
): Record<string, boolean> => ({
  organization: scope === "funding",
  updatedAt: false,
  updatedBy: false,
  lastDownloadedBy: false,
});

export const getFileColumns = ({
  scope,
  teamId,
  organizationId,
}: {
  scope: FileListScope;
  teamId: string;
  organizationId: string;
}): ColumnDef<FileRow, unknown>[] => [
  {
    id: "name",
    accessorKey: "name",
    meta: {
      label: "File",
      icon: FileIcon,
      sortField: "name",
      width: 320,
      pinned: true,
      alwaysVisible: true,
    },
    cell: ({ row }) => (
      <RecordNameCell
        kind="record"
        icon={getFileKindIcon(row.original)}
        name={getFileName(row.original)}
        href={getFileHref(row.original, scope, teamId)}
      />
    ),
  },
  {
    id: "type",
    accessorKey: "type",
    meta: { label: "Type", icon: Shapes, sortField: "type", width: 190 },
    cell: ({ row }) => {
      const label = getFileTypeLabel(row.original.type);
      return label ? <RecordChip title={label}>{label}</RecordChip> : null;
    },
  },
  {
    id: "linkedTo",
    meta: { label: "Belongs to", icon: Link2, width: 240 },
    cell: ({ row }) => {
      const linked = getLinkedRecord(
        row.original,
        scope,
        teamId,
        organizationId,
      );
      if (!linked) return null;
      return (
        <Link
          href={linked.href}
          title={`${linked.kind}: ${linked.label}`}
          className={chipLinkClass}
        >
          <RecordChip
            avatar={
              linked.person ? { name: linked.label, kind: "person" } : undefined
            }
            icon={linked.icon}
          >
            {linked.label}
          </RecordChip>
        </Link>
      );
    },
  },
  {
    id: "organization",
    meta: {
      sortField: "organization",
      label: "Organization",
      icon: Building2,
      width: 220,
    },
    cell: ({ row }) => {
      const organization = row.original.organization;
      const name = organization?.name?.trim();
      if (!organization || !name) return null;
      const chip = (
        <RecordChip title={name} avatar={{ name, kind: "organization" }}>
          {name}
        </RecordChip>
      );
      if (scope === "org") return chip;
      return (
        <Link
          href={`/teams/${teamId}/${scope}/organizations/${organization.id}`}
          className={chipLinkClass}
        >
          {chip}
        </Link>
      );
    },
  },
  {
    id: "createdAt",
    accessorKey: "createdAt",
    meta: {
      label: "Added",
      icon: CalendarPlus,
      sortField: "createdAt",
      width: 130,
    },
    cell: ({ row }) => <DateCell value={row.original.createdAt} />,
  },
  {
    id: "createdBy",
    meta: {
      sortField: "createdBy",
      label: "Added by",
      icon: UserRound,
      width: 220,
    },
    cell: ({ row }) => <TextCell value={row.original.createdBy?.email} />,
  },
  {
    id: "updatedAt",
    accessorKey: "updatedAt",
    meta: {
      label: "Updated",
      icon: CalendarClock,
      sortField: "updatedAt",
      width: 130,
    },
    cell: ({ row }) => <DateCell value={row.original.updatedAt} />,
  },
  {
    id: "updatedBy",
    meta: {
      sortField: "updatedBy",
      label: "Updated by",
      icon: UserRound,
      width: 220,
    },
    cell: ({ row }) => <TextCell value={row.original.updatedBy?.email} />,
  },
  {
    id: "lastDownloadedAt",
    meta: { label: "Last download", icon: Download, width: 140 },
    cell: ({ row }) => (
      <DateCell value={row.original.downloadAudits?.[0]?.createdAt} />
    ),
  },
  {
    id: "lastDownloadedBy",
    meta: { label: "Last downloaded by", icon: UserRound, width: 220 },
    cell: ({ row }) => (
      <TextCell value={row.original.downloadAudits?.[0]?.user.email} />
    ),
  },
];

export const renderFileCard = (
  file: FileRow,
  {
    scope,
    teamId,
    organizationId,
  }: { scope: FileListScope; teamId: string; organizationId: string },
) => {
  const name = getFileName(file);
  const href = getFileHref(file, scope, teamId);
  const typeLabel = getFileTypeLabel(file.type);
  const linked = getLinkedRecord(file, scope, teamId, organizationId);
  const className =
    "block min-w-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden";
  const content = (
    <div className="flex h-full min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground transition-colors hover:border-input hover:bg-accent/40">
      <div className="flex min-w-0 items-center gap-2.5">
        <RecordIcon icon={getFileKindIcon(file)} className="size-8" />
        <div className="min-w-0">
          <p className="truncate font-medium" title={name}>
            {name}
          </p>
          {linked ? (
            <p className="truncate text-xs text-muted-foreground">
              {linked.kind} · {linked.label}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-auto flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
        {typeLabel ? <RecordChip>{typeLabel}</RecordChip> : <span />}
        <span className="shrink-0">{formatRecordDate(file.createdAt)}</span>
      </div>
    </div>
  );

  return href.startsWith("/api/") ? (
    <a key={file.id} href={href} className={className}>
      {content}
    </a>
  ) : (
    <Link key={file.id} href={href} className={className}>
      {content}
    </Link>
  );
};
