"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavItem {
  title?: string;
  url?: string;
  icon?: LucideIcon;
  isActive?: boolean;
  type?: "separator";
  label?: string;
  items?: {
    title: string;
    url: string;
  }[];
}

export function NavMain({ items = [] }: { items?: NavItem[] }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleNavigate = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  // Extract the subUrl and id from the pathname
  const pathSegments = pathname.split("/").filter(Boolean);
  const subUrl = pathSegments[0] ?? null;
  const id = pathSegments[1] ?? null;
  const isProfilePage = subUrl === "teams" && id === "profile";

  // Determine if we have an active context based on the URL
  const hasActiveContext = Boolean(
    id &&
      !isProfilePage &&
      (subUrl === "organizations" || subUrl === "teams"),
  );
  const isAdminSection = pathname.startsWith("/admin");

  return (
    <SidebarGroup>
      <SidebarMenu>
        {isAdminSection ? (
          items.map((item) => {
            const key =
              item.url ??
              item.title ??
              item.label ??
              item.type ??
              "nav-separator";
            if (item.type === "separator") {
              return (
                <li key={key} className="px-2 py-2">
                  {item.label && (
                    <div className="px-2 pb-1 text-xs font-semibold text-muted-foreground">
                      {item.label}
                    </div>
                  )}
                  <Separator />
                </li>
              );
            }

            const fullPath = `/admin/${item.url}`;
            const isActive = pathname.startsWith(fullPath);

            return (
              <SidebarMenuItem key={key}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={isActive}
                >
                  <Link href={fullPath} onClick={handleNavigate}>
                    {item.icon && <item.icon className="size-4" />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })
        ) : hasActiveContext ? (
          items.map((item) => {
            const key =
              [subUrl, id, item.url, item.title, item.label]
                .filter(Boolean)
                .join("-") ||
              item.type ||
              "nav-item";
            if (item.type === "separator") {
              return (
                <li key={key} className="px-2 py-2">
                  {item.label && (
                    <div className="px-2 pb-1 text-xs font-semibold text-muted-foreground">
                      {item.label}
                    </div>
                  )}
                  <Separator />
                </li>
              );
            }

            const fullPath = `/${subUrl}/${id}/${item.url}/`;
            const isActive = pathname.startsWith(fullPath);

            return (
              <SidebarMenuItem key={key}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={isActive}
                >
                  <Link href={fullPath} onClick={handleNavigate}>
                    {item.icon && <item.icon className="size-4" />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })
        ) : (
          <SidebarMenuItem>
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Please select a team or organization
            </div>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
