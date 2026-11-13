"use client";
import { usePathname } from "next/navigation";
import * as React from "react";
import useSWR from "swr";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarCollapseTrigger,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { filterNavItemsByModules } from "@/lib/navigation";
import { type AppModule, DEFAULT_TEAM_MODULES, type Roles } from "@/types";
import navigationItems from "./nav-items";

type NavigationKey = keyof typeof navigationItems;
type NavigationItem = (typeof navigationItems)[NavigationKey][number];
type NavigationList = NavigationItem[];

type AppSidebarProps = {
  navItems: "team" | "organization" | "admin";
  teams?: Array<{
    id: string;
    name: string;
    email: string;
    modules?: AppModule[];
  }>;
  organizations?: Array<{ id: string; name: string; email: string }>;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    roles?: Roles[];
  };
} & Omit<React.ComponentProps<typeof Sidebar>, "teams" | "organizations">;

export function AppSidebar({
  navItems,
  teams: initialTeams = [],
  organizations: initialOrganizations = [],
  user,
  ...sidebarProps
}: AppSidebarProps) {
  const pathname = usePathname();

  // Extract the active ID and type from the URL
  const pathSegments = pathname.split("/").filter(Boolean);
  const isProfilePage =
    pathSegments[0] === "teams" && pathSegments[1] === "profile";
  const activeType = isProfilePage
    ? null
    : pathSegments[0] === "teams"
      ? "team"
      : pathSegments[0] === "organizations"
        ? "organization"
        : pathSegments[0] === "admin"
          ? "admin"
          : null;
  const activeId =
    pathSegments[0] === "admin" ? "admin" : (pathSegments[1] ?? null);

  // Normalize teams to ensure modules are set
  const teams = React.useMemo(
    () =>
      initialTeams.map((team) => ({
        ...team,
        modules: team.modules ?? [...DEFAULT_TEAM_MODULES],
      })),
    [initialTeams],
  );

  const organizations = initialOrganizations;

  const activeTeam =
    activeType === "team" ? teams.find((item) => item.id === activeId) : null;
  const { data: activityCountData } = useSWR<{ data: { count: number } }>(
    activeTeam?.modules?.includes("CRM")
      ? `/api/teams/${activeTeam.id}/activity-inbox/count`
      : null,
    (url: string) => fetch(url).then((response) => response.json()),
    { refreshInterval: 60_000, revalidateOnFocus: true },
  );

  const allowedModules = React.useMemo(() => {
    if (activeTeam?.modules) {
      return activeTeam.modules;
    }

    return [...DEFAULT_TEAM_MODULES];
  }, [activeTeam?.modules]);

  const filterItems = React.useCallback(
    (items: NavigationList): NavigationList =>
      navItems === "team"
        ? filterNavItemsByModules(items, allowedModules)
        : items,
    [allowedModules, navItems],
  );

  const navItemsToRender = React.useMemo(() => {
    const items = navigationItems[navItems] as NavigationList;
    const count = activityCountData?.data.count ?? 0;
    return filterItems(
      items.map((item) =>
        "title" in item && item.title === "Activity Inbox" && count > 0
          ? { ...item, badge: count > 99 ? "99+" : count }
          : item,
      ),
    );
  }, [activityCountData?.data.count, filterItems, navItems]);

  return (
    <Sidebar collapsible="icon" {...sidebarProps}>
      <SidebarHeader className="flex-row items-center gap-1 group-data-[collapsible=icon]:flex-col">
        <TeamSwitcher
          organizations={organizations}
          teams={teams}
          activeId={activeId}
          activeType={activeType}
          userRoles={user?.roles}
        />
        <SidebarCollapseTrigger />
      </SidebarHeader>

      <SidebarContent className="gap-0 pb-2">
        <NavMain items={navItemsToRender} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <NavUser
          user={{
            name: user?.name || "",
            email: user?.email || "",
            image: user?.image || "",
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
