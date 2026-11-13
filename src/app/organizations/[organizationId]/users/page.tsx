import { BookUser } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
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
    <RecordsPage>
      <RecordsHeader
        icon={BookUser}
        title="Users"
        action={
          canManageUsers ? (
            <Button asChild size="sm">
              <Link href={`/organizations/${organizationId}/users/create`}>
                New user
              </Link>
            </Button>
          ) : null
        }
      />
      <UserTable
        teamId=""
        organizationId={organizationId}
        canManageUsers={canManageUsers}
        initialPageSize={initialPageSize}
      />
    </RecordsPage>
  );
}
