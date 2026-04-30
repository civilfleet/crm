import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserCurrent } from "@/services/users";
import { Roles } from "@/types";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();

  if (session?.user?.userId) {
    if (session.user.roles?.includes(Roles.Admin)) {
      return redirect("/admin");
    } else if (session.user.roles?.includes(Roles.Organization)) {
      const userData = await getUserCurrent(session.user.userId);
      if (userData?.organizations && userData.organizations.length > 0) {
        return redirect(`/organizations/${userData.organizations[0].id}`);
      }
      return redirect("/organizations");
    } else if (session.user.roles?.includes(Roles.Team)) {
      const userData = await getUserCurrent(session.user.userId);
      if (userData?.teams && userData.teams.length > 0) {
        return redirect(`/teams/${userData.teams[0].id}/funding/organizations`);
      }
      return redirect("/teams");
    }
  }
  return (
    <div className="px-3 py-2 text-sm text-muted-foreground">
      Please select a team or organization from the sidebar.
    </div>
  );
}
