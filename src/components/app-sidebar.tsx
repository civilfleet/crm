"use client";
import { usePathname } from "next/navigation";
import * as React from "react";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
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
  const activeType =
    isProfilePage
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

  const allowedModules = React.useMemo(() => {
    if (activeTeam?.modules) {
      return activeTeam.modules;
    }

    return [...DEFAULT_TEAM_MODULES];
  }, [activeTeam?.modules]);

  const filterNavItemsByModules = React.useCallback(
    (items: NavigationList): NavigationList => {
      if (navItems !== "team") {
        return items;
      }

      const modules = allowedModules;

      if (!modules) {
        return items;
      }

      if (modules.length === 0) {
        return [];
      }

      const filtered = items.filter((item) => {
        if (item?.module) {
          return modules.includes(item.module);
        }
        return true;
      });

      const cleaned: NavigationItem[] = [];

      const isSeparatorItem = (
        candidate: NavigationItem,
      ): candidate is Extract<NavigationItem, { type: "separator" }> =>
        "type" in candidate && candidate.type === "separator";

      for (let i = 0; i < filtered.length; i++) {
        const item = filtered[i];

        if (isSeparatorItem(item)) {
          // Always show separators with labels (module names)
          if (item.label) {
            cleaned.push(item);
            continue;
          }

          const hasPreviousContent =
            cleaned.length > 0 && !isSeparatorItem(cleaned[cleaned.length - 1]);
          let j = i + 1;
          while (j < filtered.length && isSeparatorItem(filtered[j])) {
            j++;
          }
          const hasNextContent = j < filtered.length;

          if (!hasPreviousContent || !hasNextContent) {
            continue;
          }
        }

        cleaned.push(item);
      }

      if (cleaned.length && isSeparatorItem(cleaned[cleaned.length - 1])) {
        cleaned.pop();
      }

      return cleaned;
    },
    [allowedModules, navItems],
  );

  const navItemsToRender = React.useMemo(() => {
    const items = navigationItems[navItems] as NavigationList;
    return filterNavItemsByModules([...items]);
  }, [filterNavItemsByModules, navItems]);

  return (
    <Sidebar collapsible="icon" {...sidebarProps}>
      <SidebarHeader>
        <TeamSwitcher
          organizations={organizations}
          teams={teams}
          activeId={activeId}
          activeType={activeType}
          userRoles={user?.roles}
        />
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={navItemsToRender} />
      </SidebarContent>
      <SidebarFooter>
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
