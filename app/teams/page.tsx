import { auth } from "auth";
import { redirect } from "next/navigation";
import { getAdminUser, getUserCurrent } from "@/services/users";
import { Roles } from "@/types";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const session = await auth();
  const userId = session?.user?.userId;

  if (!session || !userId) {
    return redirect("/login");
  }

  const data = session.user.roles?.includes(Roles.Admin)
    ? await getAdminUser(userId)
    : await getUserCurrent(userId);

  const { teams = [] } = data || {};

  if (teams?.length > 0) {
    return redirect(`/teams/${teams?.[0]?.id}`);
  }

  return (
    <div className="p-4 w-full">
      <div className="flex justify-between">
        <h1 className="text-2xl  my-2">
          Welcome to your Teams Page, please select a menu entry.
        </h1>
      </div>
    </div>
  );
}
