import { cookies } from "next/headers";
import UserTable from "@/components/table/user-table";
import { verifyOrganizationAccess } from "@/lib/api-guard";
import {
  parseTablePageSize,
  RECORDS_PAGE_SIZE,
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
    RECORDS_PAGE_SIZE,
  );
  const access = await verifyOrganizationAccess(organizationId);
  const canManageUsers = access.isGlobalAdmin || access.isTeamAdmin;

  return (
    <UserTable
      organizationId={organizationId}
      canManageUsers={canManageUsers}
      initialPageSize={initialPageSize}
    />
  );
}
