import { cookies } from "next/headers";
import Link from "next/link";
import UserTable from "@/components/table/user-table";
import { Button } from "@/components/ui/button";
import { verifyOrganizationAccess } from "@/lib/api-guard";
import {
  parseTablePageSize,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";

interface PageProps {
  params: Promise<{
    organizationId: string;
  }>;
}

export default async function Organization({ params }: PageProps) {
  const [{ organizationId }, cookieStore] = await Promise.all([
    params,
    cookies(),
  ]);
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
  );
  const access = await verifyOrganizationAccess(organizationId);
  const canManageUsers = access.isGlobalAdmin || access.isTeamAdmin;

  return (
    <div className="p-4 w-full">
      <div className="flex justify-between">
        <h1 className="text-2xl  my-2">Users</h1>
        {canManageUsers ? (
          <Link href="users/create">
            <Button type="button">Create New</Button>
          </Link>
        ) : null}
      </div>
      <UserTable
        teamId=""
        organizationId={organizationId}
        canManageUsers={canManageUsers}
        initialPageSize={initialPageSize}
      />
    </div>
  );
}
