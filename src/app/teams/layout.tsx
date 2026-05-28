import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getAdminUser, getUserCurrent } from "@/services/users";
import { Roles } from "@/types";

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  if (!session) return redirect("/login");

  const userId = session.user?.userId;
  if (!userId) {
    return redirect("/login");
  }

  const userData = session.user?.roles?.includes(Roles.Admin)
    ? await getAdminUser(userId)
    : await getUserCurrent(userId);

  // Serialize data to ensure consistency between server and client
  const teams = userData?.teams
    ? JSON.parse(JSON.stringify(userData.teams))
    : [];
  const organizations = userData?.organizations
    ? JSON.parse(JSON.stringify(userData.organizations))
    : [];

  return (
    <div>
      <SidebarProvider>
        <AppSidebar
          navItems={"team"}
          teams={teams}
          organizations={organizations}
          user={session.user}
        />
        <SidebarInset>
          <div className="flex min-h-svh min-w-0 flex-1 flex-col">
            <header className="flex items-center gap-2 border-b bg-background px-4 py-3 md:hidden">
              <SidebarTrigger className="-ml-1" />
              <span className="text-sm font-semibold">Team Navigation</span>
            </header>
            <div className="flex-1">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
