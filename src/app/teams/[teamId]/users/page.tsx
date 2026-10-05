import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BulkInviteUsersDialog } from "@/components/forms/bulk-invite-users";
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
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl my-2">Users</h1>
        <div className="flex items-center gap-2">
          <Link href={`/teams/${teamId}/users/create`}>
            <Button type="button">Invite New User</Button>
          </Link>
          <BulkInviteUsersDialog teamId={teamId} />
        </div>
      </div>
      <UserTable
        teamId={teamId}
        organizationId=""
        initialPageSize={initialPageSize}
      />
    </div>
  );
}
