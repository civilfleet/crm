"use client";

import { ChevronsUpDown, GalleryVerticalEnd, Shield } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Roles } from "@/types";

type SwitcherItem = {
  id: string;
  name: string;
  roleName?: string;
  email: string;
};

export function TeamSwitcher({
  organizations,
  teams,
  activeId,
  activeType,
  userRoles,
}: {
  organizations: SwitcherItem[];
  teams: SwitcherItem[];
  activeId: string | null;
  activeType: "team" | "organization" | "admin" | null;
  userRoles?: Roles[];
}) {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const isAdmin = userRoles?.includes(Roles.Admin);

  const activeItem =
    activeType === "team"
      ? teams.find((item) => item.id === activeId)
      : activeType === "organization"
        ? organizations.find((item) => item.id === activeId)
        : activeType === "admin"
          ? { name: "Admin Dashboard", id: "admin" }
          : null;

  const setItem = (_item: SwitcherItem, subUrl: string, id: string) => {
    if (subUrl === "teams") {
      router.push(`/${subUrl}/${id}`); // Team dashboard
    } else if (subUrl === "admin") {
      router.push("/admin"); // Admin dashboard
    } else {
      router.push(`/${subUrl}/${id}`); // Organization dashboard
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <GalleryVerticalEnd className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {activeItem?.name || "Select team or organization"}
                </span>
                <span className="truncate text-xs">
                  {activeType === "team"
                    ? "Team"
                    : activeType === "organization"
                      ? "Organization"
                      : activeType === "admin"
                        ? "Admin"
                        : ""}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            {isAdmin && (
              <>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Admin
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() =>
                    setItem(
                      { id: "admin", name: "Admin Dashboard", email: "" },
                      "admin",
                      "admin",
                    )
                  }
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-sm border">
                    <Shield className="size-4 shrink-0" />
                  </div>
                  Admin Dashboard
                  <DropdownMenuShortcut>⌘A</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {teams.length > 0 ? (
              <>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Teams
                </DropdownMenuLabel>
                {teams.map((item, index) => (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => setItem(item, "teams", item.id)}
                    className="gap-2 p-2"
                  >
                    <div className="flex size-6 items-center justify-center rounded-sm border">
                      <GalleryVerticalEnd className="size-4 shrink-0" />
                    </div>
                    {item.name}
                    <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </>
            ) : (
              <DropdownMenuItem className="text-muted-foreground">
                No teams available
              </DropdownMenuItem>
            )}
            {organizations.length > 0 ? (
              <>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Organizations
                </DropdownMenuLabel>
                {organizations.map((item, index) => (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => setItem(item, "organizations", item.id)}
                    className="gap-2 p-2"
                  >
                    <div className="flex size-6 items-center justify-center rounded-sm border">
                      <GalleryVerticalEnd className="size-4 shrink-0" />
                    </div>
                    {item.name}
                    <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                ))}
              </>
            ) : (
              <DropdownMenuItem className="text-muted-foreground">
                No organizations available
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}