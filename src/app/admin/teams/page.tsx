import { Users } from "lucide-react";
import Link from "next/link";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
import TeamsTable from "@/components/table/teams-table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminTeamsPage() {
  return (
    <RecordsPage>
      <RecordsHeader
        icon={Users}
        title="Teams"
        action={
          <Button asChild size="sm">
            <Link href={"/admin/teams/create"}>New team</Link>
          </Button>
        }
      />
      <TeamsTable />
    </RecordsPage>
  );
}
