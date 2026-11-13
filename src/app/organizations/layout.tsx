import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getSidebarDefaultOpen, getSidebarWidth } from "@/lib/sidebar-state";
import { getAdminUser, getUserCurrent } from "@/services/users";
import { Roles } from "@/types";

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  if (!session) return redirect("/");

  const userId = session.user?.userId;
  if (!userId) {
    return redirect("/");
  }

  const [userData, sidebarDefaultOpen, sidebarWidth] = await Promise.all([
    session.user?.roles?.includes(Roles.Admin)
      ? getAdminUser(userId)
      : getUserCurrent(userId),
    getSidebarDefaultOpen(),
    getSidebarWidth(),
  ]);

  // Serialize data to ensure consistency between server and client
  const teams = userData?.teams
    ? JSON.parse(JSON.stringify(userData.teams))
    : [];
  const organizations = userData?.organizations
    ? JSON.parse(JSON.stringify(userData.organizations))
    : [];

  return (
    <div>
      <SidebarProvider
        defaultOpen={sidebarDefaultOpen}
        defaultWidth={sidebarWidth}
      >
        <AppSidebar
          navItems={"organization"}
          teams={teams}
          organizations={organizations}
          user={session.user}
        />
        <SidebarInset>
          <div className="flex min-h-svh min-w-0 flex-1 flex-col">
            <header className="flex items-center gap-2 border-b bg-background px-4 py-3 md:hidden">
              <SidebarTrigger className="-ml-1" />
              <span className="text-sm font-semibold">
                Organization Navigation
              </span>
            </header>
            {/* Each page sets its own padding; lists and records sit flush. */}
            <div className="flex-1">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
