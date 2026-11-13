import { BookUser } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BulkInviteUsersDialog } from "@/components/forms/bulk-invite-users";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
import UserTable from "@/components/table/user-table";
import { Button } from "@/components/ui/button";
import {
  parseTablePageSize,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";
import { getTeamAdminAccess } from "@/services/teams/access";

interface PageProps {
  params: Promise<{
    teamId: string;
  }>;
}

export default async function Page({ params }: PageProps) {
  const [{ teamId }, cookieStore] = await Promise.all([params, cookies()]);
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
  );
  const session = await auth();
  if (!session?.user?.userId) {
    return redirect("/");
  }

  const access = await getTeamAdminAccess(
    session.user.userId,
    teamId,
    session.user.roles,
  );
  if (!access.allowed) {
    return redirect(`/teams/${teamId}`);
  }

  return (
    <RecordsPage>
      <RecordsHeader
        icon={BookUser}
        title="Users"
        action={
          <>
            <BulkInviteUsersDialog teamId={teamId} />
            <Button asChild size="sm">
              <Link href={`/teams/${teamId}/users/create`}>Invite user</Link>
            </Button>
          </>
        }
      />
      <UserTable
        teamId={teamId}
        organizationId=""
        initialPageSize={initialPageSize}
      />
    </RecordsPage>
  );
}
