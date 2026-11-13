import { Building2 } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
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
    <RecordsPage>
      <RecordsHeader
        icon={Building2}
        title="Organizations"
        action={
          <Button asChild size="sm">
            <Link href={"/admin/organizations/create"}>New organization</Link>
          </Button>
        }
      />
      <OrganizationTable initialPageSize={initialPageSize} />
    </RecordsPage>
  );
}
