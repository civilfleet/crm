import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Crown, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import type { User } from "@/types";

const userDetailPath = (id: string) => `users/${id}`;

type UserLoginAccount = {
  provider: string;
};

type UserRow = User & {
  isOwner?: boolean;
  accounts?: UserLoginAccount[];
};

const NavigableCell = ({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) => (
  <Link
    href={userDetailPath(id)}
    className={cn(
      "block text-left cursor-pointer hover:text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
      className,
    )}
  >
    {children}
  </Link>
);

const toLoginMethodLabel = (accounts?: UserLoginAccount[]) => {
  if (!accounts?.length) {
    return "Unknown";
  }

  const methods = new Set<string>();

  for (const account of accounts) {
    const provider = account.provider?.trim();
    if (!provider) {
      continue;
    }

    if (provider === "nodemailer") {
      methods.add("Email");
      continue;
    }

    if (provider.startsWith("oidc-")) {
      methods.add("SSO");
      continue;
    }

    methods.add(`Other (${provider})`);
  }

  if (!methods.size) {
    return "Unknown";
  }

  if (methods.size === 1) {
    return Array.from(methods)[0];
  }

  return "Mixed";
};

export const columns: ColumnDef<UserRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <NavigableCell id={row.original.id} className="flex items-center gap-2">
        <span>{row.original?.name || "N/A"}</span>
        {row.original.isOwner ? (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Crown className="h-3 w-3" />
            Owner
          </Badge>
        ) : null}
      </NavigableCell>
    ),
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ row }) => (
      <NavigableCell id={row.original.id}>
        {row.original?.email || "N/A"}
      </NavigableCell>
    ),
  },
  {
    id: "loginMethod",
    accessorFn: (row) => toLoginMethodLabel(row.accounts),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Login method" />
    ),
    cell: ({ row }) => (
      <NavigableCell id={row.original.id}>
        {toLoginMethodLabel(row.original.accounts)}
      </NavigableCell>
    ),
  },
  {
    accessorKey: "phone",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Phone" />
    ),
    cell: ({ row }) => (
      <NavigableCell id={row.original.id}>
        {row.original?.phone || "N/A"}
      </NavigableCell>
    ),
  },
  {
    accessorKey: "city",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="City" />
    ),
    cell: ({ row }) => (
      <NavigableCell id={row.original.id}>
        {row.original?.city || "N/A"}
      </NavigableCell>
    ),
  },
  {
    accessorKey: "country",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Country" />
    ),
    cell: ({ row }) => (
      <NavigableCell id={row.original.id}>
        {row.original?.country || "N/A"}
      </NavigableCell>
    ),
  },
  {
    accessorKey: "roles",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Roles" />
    ),
    cell: ({ row }) => (
      <NavigableCell id={row.original.id}>
        {Array.isArray(row.original?.roles)
          ? row.original.roles.join(", ")
          : row.original?.roles || "N/A"}
      </NavigableCell>
    ),
  },
  {
    accessorKey: "groups",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Groups" />
    ),
    cell: ({ row }) => {
      const groups = row.original?.groups;
      if (!groups || groups.length === 0) {
        return <NavigableCell id={row.original.id}>No groups</NavigableCell>;
      }
      return (
        <NavigableCell id={row.original.id} className="flex flex-wrap gap-1">
          {groups.map(
            (userGroup: {
              groupId: string;
              group: { id: string; name: string };
            }) => (
              <Badge
                key={userGroup.groupId}
                variant="secondary"
                className="text-xs"
              >
                {userGroup.group.name}
              </Badge>
            ),
          )}
        </NavigableCell>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created At" />
    ),
    cell: ({ row }) => (
      <NavigableCell id={row.original.id}>
        {row.original?.createdAt
          ? format(new Date(row.original.createdAt), "PP")
          : "N/A"}
      </NavigableCell>
    ),
  },
  {
    accessorKey: "updatedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Updated At" />
    ),
    cell: ({ row }) => (
      <NavigableCell id={row.original.id}>
        {row.original?.updatedAt
          ? format(new Date(row.original.updatedAt), "PP")
          : "N/A"}
      </NavigableCell>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const user = row.original;
      return <UserActions user={user} />;
    },
  },
];

const UserActions = ({ user }: { user: UserRow }) => {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();

  const teamId = params?.teamId ? params?.teamId : "";
  const organizationId = params?.organizationId ? params.organizationId : "";

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ organizationId, teamId }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete user");
      }

      toast({
        title: "Success",
        description: "User has been removed successfully",
      });

      router.refresh();
    } catch (_error) {
      toast({
        title: "Error",
        description: "Failed to remove user",
        variant: "destructive",
      });
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleDelete}
      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
};