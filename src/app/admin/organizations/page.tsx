import { cookies } from "next/headers";
import OrganizationTable from "@/components/table/organization-table";
import {
  parseTablePageSize,
  RECORDS_PAGE_SIZE,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationsPage() {
  const cookieStore = await cookies();
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
    RECORDS_PAGE_SIZE,
  );

  return (
    <OrganizationTable
      scope="admin"
      // Each organization opens in its own area: admin has no record pages.
      basePath="/organizations"
      initialPageSize={initialPageSize}
    />
  );
}
