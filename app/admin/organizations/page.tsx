import Link from "next/link";
import OrganizationTable from "@/components/table/organization-table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationsPage() {
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Organizations Management</h1>
        <Link href="/admin/organizations/create">
          <Button>Create New Organization</Button>
        </Link>
      </div>
      <OrganizationTable />
    </div>
  );
}
