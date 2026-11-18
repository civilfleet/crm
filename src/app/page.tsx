import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandHomeLink, BrandPanel } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { getPublicLoginOptions } from "@/lib/auth-routing";
import { getUserCurrent } from "@/services/users";
import { Roles } from "@/types";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const [session, loginOptions] = await Promise.all([
    auth(),
    getPublicLoginOptions(),
  ]);

  if (session?.user?.userId) {
    if (session.user.roles?.includes(Roles.Admin)) {
      return redirect("/admin");
    } else if (session.user.roles?.includes(Roles.Organization)) {
      const userData = await getUserCurrent(session.user.userId);
      if (userData?.organizations && userData.organizations.length > 0) {
        return redirect(
          `/organizations/${userData.organizations[0].id}/profile`,
        );
      }
      return redirect("/organizations");
    } else if (session.user.roles?.includes(Roles.Team)) {
      const userData = await getUserCurrent(session.user.userId);
      if (userData?.teams && userData.teams.length > 0) {
        const [primaryTeam] = userData.teams;
        const modules = primaryTeam?.modules ?? [];

        if (modules.includes("FUNDING")) {
          return redirect(`/teams/${primaryTeam.id}/funding/organizations`);
        }

        if (modules.includes("CRM")) {
          return redirect(`/teams/${primaryTeam.id}/crm/contacts`);
        }

        return redirect(`/teams/${primaryTeam.id}`);
      }
      return redirect("/teams");
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex min-h-svh min-w-0 flex-col gap-4 px-4 py-5 sm:px-8 sm:py-7 lg:p-10">
        <div className="flex justify-center gap-2 sm:justify-start">
          <BrandHomeLink />
        </div>
        <div className="flex flex-1 items-center justify-center py-6 sm:py-10">
          <div className="w-full min-w-0 max-w-sm rounded-xl border bg-card/95 p-5 shadow-sm sm:p-8">
            <LoginForm loginOptions={loginOptions} />
          </div>
        </div>
      </div>
      <BrandPanel />
    </div>
  );
}
