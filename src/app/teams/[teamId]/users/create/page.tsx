import { BookUser } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import UserForm from "@/components/forms/user";
import { RecordTopBar } from "@/components/records/record-page";
import { getTeamAdminAccess } from "@/services/teams/access";

export default async function Page({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
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
    <>
      <RecordTopBar
        list={{
          href: `/teams/${teamId}/users`,
          label: "Users",
          icon: BookUser,
        }}
        title="New user"
      />
      <div className="flex flex-col w-2/3 p-4">
        <UserForm teamId={teamId} organizationId={""} />
      </div>
    </>
  );
}
