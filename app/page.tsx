import { GalleryVerticalEnd } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";
import { getUserCurrent } from "@/services/users";
import { Roles } from "@/types";
import { APP_NAME } from "@/constants/app";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();

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
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="/" className="flex items-center gap-2 font-medium">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GalleryVerticalEnd className="size-4" />
            </div>
            {APP_NAME}
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
