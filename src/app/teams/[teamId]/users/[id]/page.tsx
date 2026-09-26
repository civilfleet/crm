import { redirect } from "next/navigation";
import { auth } from "@/auth";
import UserDetails from "@/components/user-details";
import { getTeamAdminAccess } from "@/services/teams/access";

export default async function Page({
  params,
}: {
  params: Promise<{ teamId: string; id: string }>;
}) {
  const { teamId, id } = await params;
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

  return <UserDetails userId={id} teamId={teamId} />;
}
