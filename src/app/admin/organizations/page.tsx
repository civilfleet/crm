import { cookies } from "next/headers";
import Link from "next/link";
import OrganizationTable from "@/components/table/organization-table";
import { Button } from "@/components/ui/button";
import {
  parseTablePageSize,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationsPage() {
  const cookieStore = await cookies();
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
  );

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Organizations Management</h1>
        <Link href="/admin/organizations/create">
          <Button>Create New Organization</Button>
        </Link>
      </div>
      <OrganizationTable initialPageSize={initialPageSize} />
    </div>
  );
}
