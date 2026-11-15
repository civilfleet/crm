"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  CalendarClock,
  CalendarPlus,
  CircleUserRound,
  KeyRound,
  LogIn,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import {
  ChipList,
  DateCell,
  EmailCell,
  formatRecordDate,
  LocationCell,
  RecordAvatar,
  RecordChip,
  RecordNameCell,
  TextCell,
} from "@/components/records/record-cells";

type UserLoginAccount = {
  provider: string;
};

export type UserRow = {
  id: string;
  name?: string | null;
  pronouns?: string | null;
  image?: string | null;
  email: string;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  roles?: string[];
  groups?: Array<{ groupId: string; group: { id: string; name: string } }>;
  accounts?: UserLoginAccount[];
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  isOwner?: boolean;
};

export const USER_ROLE_LABELS: Record<string, string> = {
  Admin: "Admin",
  Team: "Team member",
  Organization: "Organization member",
};

export const getUserName = (user: Pick<UserRow, "name" | "email">) =>
  user.name?.trim() || user.email;

const getLoginMethodLabel = (accounts?: UserLoginAccount[]) => {
  const methods = new Set<string>();
  for (const account of accounts ?? []) {
    const provider = account.provider?.trim();
    if (!provider) continue;
    if (provider === "nodemailer") {
      methods.add("Email");
    } else if (provider.startsWith("oidc-")) {
      methods.add("SSO");
    } else {
      methods.add(provider);
    }
  }
  if (methods.size === 0) return "";
  if (methods.size === 1) return Array.from(methods)[0];
  return "Email and SSO";
};

/** Columns that open hidden; the Columns menu brings them back. */
export const USER_COLUMN_DEFAULTS: Record<string, boolean> = {
  loginMethod: false,
  phone: false,
  location: false,
  updatedAt: false,
};

export const getUserColumns = ({
  basePath,
  showGroups,
}: {
  basePath: string;
  /** Groups belong to teams; an organization's users have none. */
  showGroups: boolean;
}): ColumnDef<UserRow, unknown>[] => [
  {
    id: "name",
    accessorKey: "name",
    meta: {
      label: "Name",
      icon: CircleUserRound,
      sortField: "name",
      width: 260,
      pinned: true,
      alwaysVisible: true,
    },
    cell: ({ row }) => (
      <RecordNameCell
        kind="person"
        name={getUserName(row.original)}
        imageSrc={row.original.image}
        href={`${basePath}/${row.original.id}`}
        meta={
          [row.original.pronouns, row.original.isOwner ? "Owner" : null]
            .filter(Boolean)
            .join(" · ") || null
        }
      />
    ),
  },
  {
    id: "email",
    accessorKey: "email",
    meta: { label: "Email", icon: Mail, sortField: "email", width: 260 },
    cell: ({ row }) => <EmailCell email={row.original.email} />,
  },
  {
    id: "roles",
    meta: { label: "Role", icon: ShieldCheck, width: 200 },
    cell: ({ row }) => (
      <ChipList
        items={row.original.roles ?? []}
        getKey={(role) => role}
        getLabel={(role) => USER_ROLE_LABELS[role] ?? role}
        renderChip={(role) => (
          <RecordChip>{USER_ROLE_LABELS[role] ?? role}</RecordChip>
        )}
      />
    ),
  },
  ...(showGroups
    ? [
        {
          id: "groups",
          meta: { label: "Groups", icon: UsersRound, width: 220 },
          cell: ({ row }) => (
            <ChipList
              items={row.original.groups ?? []}
              getKey={(membership) => membership.groupId}
              getLabel={(membership) => membership.group.name}
              renderChip={(membership) => (
                <RecordChip title={membership.group.name}>
                  {membership.group.name}
                </RecordChip>
              )}
            />
          ),
        } satisfies ColumnDef<UserRow, unknown>,
      ]
    : []),
  {
    id: "loginMethod",
    meta: { label: "Signs in with", icon: KeyRound, width: 140 },
    cell: ({ row }) => (
      <TextCell value={getLoginMethodLabel(row.original.accounts)} />
    ),
  },
  {
    id: "lastLoginAt",
    accessorKey: "lastLoginAt",
    meta: {
      label: "Last sign-in",
      icon: LogIn,
      sortField: "lastLoginAt",
      width: 140,
    },
    cell: ({ row }) => <DateCell value={row.original.lastLoginAt} />,
  },
  {
    id: "phone",
    accessorKey: "phone",
    meta: { label: "Phone", icon: Phone, width: 160 },
    cell: ({ row }) => <TextCell value={row.original.phone} />,
  },
  {
    id: "location",
    meta: { label: "Location", icon: MapPin, sortField: "city", width: 180 },
    cell: ({ row }) => (
      <LocationCell city={row.original.city} country={row.original.country} />
    ),
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
    id: "updatedAt",
    accessorKey: "updatedAt",
    meta: { label: "Updated", icon: CalendarClock, width: 130 },
    cell: ({ row }) => <DateCell value={row.original.updatedAt} />,
  },
];

export const renderUserCard = (user: UserRow, basePath: string) => {
  const name = getUserName(user);
  const lastLogin = formatRecordDate(user.lastLoginAt);

  return (
    <Link
      key={user.id}
      href={`${basePath}/${user.id}`}
      className="block min-w-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
    >
      <div className="flex h-full min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground transition-colors hover:border-input hover:bg-accent/40">
        <div className="flex min-w-0 items-center gap-2.5">
          <RecordAvatar
            name={name}
            kind="person"
            imageSrc={user.image}
            className="size-8 text-xs"
          />
          <div className="min-w-0">
            <p className="truncate font-medium" title={name}>
              {name}
              {user.isOwner ? (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  Owner
                </span>
              ) : null}
            </p>
            {user.name?.trim() ? (
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            ) : null}
          </div>
        </div>
        {user.roles?.length || user.groups?.length ? (
          <div className="flex min-w-0 flex-wrap gap-1">
            {(user.roles ?? []).map((role) => (
              <RecordChip key={role}>
                {USER_ROLE_LABELS[role] ?? role}
              </RecordChip>
            ))}
            {(user.groups ?? []).map((membership) => (
              <RecordChip key={membership.groupId}>
                {membership.group.name}
              </RecordChip>
            ))}
          </div>
        ) : null}
        <div className="mt-auto text-xs text-muted-foreground">
          {lastLogin ? `Last sign-in ${lastLogin}` : "Not signed in yet"}
        </div>
      </div>
    </Link>
  );
};
