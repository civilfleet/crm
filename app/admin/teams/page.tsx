import Link from "next/link";
import TeamsTable from "@/components/table/teams-table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminTeamsPage() {
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Teams Management</h1>
        <Link href="/admin/teams/create">
          <Button>Create New Team</Button>
        </Link>
      </div>
      <TeamsTable />
    </div>
  );
}
