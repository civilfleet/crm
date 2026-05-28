import { Shield } from "lucide-react";
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
          navItems={"admin"}
          teams={teams}
          organizations={organizations}
          user={session.user}
        />
        <SidebarInset>
          <div className="flex items-center gap-2 border-b p-4">
            <SidebarTrigger className="-ml-1 md:hidden" />
            <Shield className="size-5 text-primary" />
            <h1 className="text-xl font-semibold">Admin Dashboard</h1>
          </div>
          <div>{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
