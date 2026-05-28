import { redirect } from "next/navigation";
import { auth } from "@/auth";
import TeamForm from "@/components/forms/team";
import prisma from "@/lib/prisma";
import { Roles } from "@/types";

export default async function EditTeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const session = await auth();
  const { teamId } = await params;

  if (!session?.user?.roles?.includes(Roles.Admin)) {
    return redirect("/");
  }
  const team = await prisma.teams.findUnique({
    where: {
      id: teamId,
    },
    include: {
      bankDetails: true,
      users: true,
    },
  });
  if (!team) {
    return redirect("/admin/teams");
  }
  return (
    <div className="m-2 w-full">
      <TeamForm team={team} />
    </div>
  );
}