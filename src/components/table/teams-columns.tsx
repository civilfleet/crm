"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  Blocks,
  Building2,
  CalendarPlus,
  CircleUserRound,
  Globe,
  KeyRound,
  Link2,
  Mail,
  MapPin,
  Phone,
  Users,
} from "lucide-react";
import {
  ChipList,
  DateCell,
  EmailCell,
  LinkCell,
  LocationCell,
  RecordChip,
  RecordNameCell,
  TextCell,
} from "@/components/records/record-cells";

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
  loginDomain?: string | null;
  emailLoginEnabled?: boolean;
  oidcLoginEnabled?: boolean;
  modules?: string[];
  owner?: { id: string; name?: string | null; email: string } | null;
  _count?: { users: number; organizations: number };
  createdAt: string;
  updatedAt: string;
};

export const TEAM_MODULE_LABELS: Record<string, string> = {
  CRM: "CRM",
  FUNDING: "Funding",
  ADMIN: "Admin",
};

const getSignInLabel = (team: TeamRow) =>
  [team.emailLoginEnabled ? "Email" : "", team.oidcLoginEnabled ? "SSO" : ""]
    .filter(Boolean)
    .join(" and ");

/** Columns that open hidden; the Columns menu brings them back. */
export const TEAM_COLUMN_DEFAULTS: Record<string, boolean> = {
  phone: false,
  website: false,
  loginDomain: false,
};

export const getTeamHref = (team: Pick<TeamRow, "id">) =>
  `/admin/teams/${team.id}/edit`;

const CountCell = ({ value }: { value?: number }) =>
  value ? (
    <span className="block text-right tabular-nums">
      {value.toLocaleString()}
    </span>
  ) : null;

export const getTeamColumns = (): ColumnDef<TeamRow, unknown>[] => [
  {
    id: "name",
    accessorKey: "name",
    meta: {
      label: "Team",
      icon: Users,
      sortField: "name",
      width: 240,
      pinned: true,
      alwaysVisible: true,
    },
    cell: ({ row }) => (
      <RecordNameCell
        kind="organization"
        name={row.original.name}
        href={getTeamHref(row.original)}
      />
    ),
  },
  {
    id: "email",
    accessorKey: "email",
    meta: { label: "Email", icon: Mail, sortField: "email", width: 240 },
    cell: ({ row }) => <EmailCell email={row.original.email} />,
  },
  {
    id: "modules",
    meta: { label: "Modules", icon: Blocks, width: 210 },
    cell: ({ row }) => (
      <ChipList
        items={row.original.modules ?? []}
        getKey={(module) => module}
        getLabel={(module) => TEAM_MODULE_LABELS[module] ?? module}
        max={3}
        renderChip={(module) => (
          <RecordChip>{TEAM_MODULE_LABELS[module] ?? module}</RecordChip>
        )}
      />
    ),
  },
  {
    id: "owner",
    meta: {
      sortField: "owner",
      label: "Owner",
      icon: CircleUserRound,
      width: 200,
    },
    cell: ({ row }) => {
      const owner = row.original.owner;
      const name = owner?.name?.trim() || owner?.email;
      return name ? (
        <RecordChip title={owner?.email} avatar={{ name, kind: "person" }}>
          {name}
        </RecordChip>
      ) : null;
    },
  },
  {
    id: "users",
    meta: { sortField: "users", label: "Users", icon: Users, width: 100 },
    cell: ({ row }) => <CountCell value={row.original._count?.users} />,
  },
  {
    id: "organizations",
    meta: {
      sortField: "organizations",
      label: "Organizations",
      icon: Building2,
      width: 130,
    },
    cell: ({ row }) => <CountCell value={row.original._count?.organizations} />,
  },
  {
    id: "signIn",
    meta: { label: "Sign-in", icon: KeyRound, width: 140 },
    cell: ({ row }) => <TextCell value={getSignInLabel(row.original)} />,
  },
  {
    id: "loginDomain",
    accessorKey: "loginDomain",
    meta: {
      sortField: "loginDomain",
      label: "Login domain",
      icon: Globe,
      width: 180,
    },
    cell: ({ row }) => <TextCell value={row.original.loginDomain} />,
  },
  {
    id: "location",
    meta: { label: "Location", icon: MapPin, sortField: "city", width: 180 },
    cell: ({ row }) => (
      <LocationCell city={row.original.city} country={row.original.country} />
    ),
  },
  {
    id: "website",
    accessorKey: "website",
    meta: { sortField: "website", label: "Website", icon: Link2, width: 180 },
    cell: ({ row }) => <LinkCell url={row.original.website} />,
  },
  {
    id: "phone",
    accessorKey: "phone",
    meta: { sortField: "phone", label: "Phone", icon: Phone, width: 160 },
    cell: ({ row }) => <TextCell value={row.original.phone} />,
  },
  {
    id: "createdAt",
    accessorKey: "createdAt",
    meta: {
      label: "Created",
      icon: CalendarPlus,
      sortField: "createdAt",
      width: 130,
    },
    cell: ({ row }) => <DateCell value={row.original.createdAt} />,
  },
];
