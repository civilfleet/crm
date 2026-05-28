import { redirect } from "next/navigation";
import { auth } from "@/auth";
import UserForm from "@/components/forms/user";
import { getTeamAdminAccess } from "@/services/teams/access";

export default async function Page({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user?.userId) {
    return redirect("/login");
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
    <div className="flex flex-col w-2/3 p-4">
      <UserForm teamId={teamId} organizationId={""} />
    </div>
  );
}
