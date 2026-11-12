"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface NavItem {
  title?: string;
  url?: string;
  icon?: LucideIcon;
  isActive?: boolean;
  type?: "separator";
  label?: string;
  badge?: number | string;
}

type NavLink = NavItem & { title: string; url: string };

type NavSection = {
  key: string;
  label?: string;
  items: NavLink[];
};

const SECTIONS_STORAGE_KEY = "sidebar:closed-sections";

const isNavLink = (item: NavItem): item is NavLink =>
  item.type !== "separator" &&
  typeof item.title === "string" &&
  typeof item.url === "string";

// Separators with a label open a new section; unlabeled ones just split.
const groupIntoSections = (items: NavItem[]): NavSection[] => {
  const sections: NavSection[] = [{ key: "root", items: [] }];

  for (const item of items) {
    if (item.type === "separator") {
      sections.push({
        key: item.label ?? `section-${sections.length}`,
        label: item.label,
        items: [],
      });
      continue;
    }
    if (isNavLink(item)) {
      sections[sections.length - 1].items.push(item);
    }
  }

  return sections.filter((section) => section.items.length > 0);
};

const readClosedSections = (): string[] => {
  try {
    const stored = window.localStorage.getItem(SECTIONS_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
};

const writeClosedSections = (closed: string[]) => {
  try {
    window.localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(closed));
  } catch {
    // Storage can be unavailable (private mode); collapsing still works.
  }
};

const getBasePath = (pathname: string): string | null => {
  const [scope, id] = pathname.split("/").filter(Boolean);

  if (scope === "admin") return "/admin";
  if (!id || (scope === "teams" && id === "profile")) return null;
  if (scope === "teams" || scope === "organizations") return `/${scope}/${id}`;
  return null;
};

export function NavMain({ items = [] }: { items?: NavItem[] }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const [closedSections, setClosedSections] = React.useState<string[]>([]);

  React.useEffect(() => {
    setClosedSections(readClosedSections());
  }, []);

  const basePath = getBasePath(pathname);
  const sections = React.useMemo(() => groupIntoSections(items), [items]);

  const handleNavigate = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleToggleSection = (key: string) => {
    setClosedSections((current) => {
      const next = current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key];
      writeClosedSections(next);
      return next;
    });
  };

  if (!basePath) {
    return (
      <div className="px-4 py-3 text-sm text-sidebar-muted-foreground group-data-[collapsible=icon]:hidden">
        Select a team or organization to get started.
      </div>
    );
  }

  const getHref = (item: NavLink) =>
    item.url ? `${basePath}/${item.url}` : basePath;

  const getIsActive = (item: NavLink) => {
    const href = getHref(item);
    if (!item.url) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      {sections.map((section) => {
        const isClosed = Boolean(
          section.label && closedSections.includes(section.key),
        );
        return (
          <SidebarGroup key={section.key} className="px-2 py-1">
            {section.label ? (
              <>
                <button
                  type="button"
                  onClick={() => handleToggleSection(section.key)}
                  aria-expanded={!isClosed}
                  className="group/section flex h-7 w-full items-center gap-1 px-2 text-left text-xs font-medium text-sidebar-muted-foreground outline-hidden transition-colors hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden"
                >
                  <span className="truncate">{section.label}</span>
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      "size-3 shrink-0 transition-[transform,opacity] duration-150",
                      isClosed
                        ? "opacity-100"
                        : "rotate-90 opacity-0 group-hover/section:opacity-100 group-focus-visible/section:opacity-100",
                    )}
                  />
                </button>
                <div
                  aria-hidden="true"
                  className="mx-auto my-1.5 hidden h-px w-5 bg-sidebar-border group-data-[collapsible=icon]:block"
                />
              </>
            ) : null}
            <SidebarMenu className="gap-0.5">
              {section.items.map((item) => {
                const isActive = getIsActive(item);
                return (
                  <NavMainItem
                    key={`${section.key}-${item.url}`}
                    item={item}
                    href={getHref(item)}
                    isActive={isActive}
                    // A closed section still shows the page you are on, and
                    // the icon rail always lists every destination.
                    isFolded={isClosed && !isActive}
                    tooltip={
                      section.label
                        ? `${section.label} · ${item.title}`
                        : item.title
                    }
                    onNavigate={handleNavigate}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        );
      })}
    </>
  );
}

function NavMainItem({
  item,
  href,
  isActive,
  isFolded,
  tooltip,
  onNavigate,
}: {
  item: NavLink;
  href: string;
  isActive: boolean;
  isFolded: boolean;
  tooltip: string;
  onNavigate: () => void;
}) {
  const hasBadge = item.badge !== undefined && item.badge !== 0;

  return (
    <SidebarMenuItem
      className={cn(isFolded && "hidden group-data-[collapsible=icon]:block")}
    >
      <SidebarMenuButton asChild tooltip={tooltip} isActive={isActive}>
        <Link
          href={href}
          onClick={onNavigate}
          aria-current={isActive ? "page" : undefined}
        >
          {item.icon && <item.icon />}
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
      {hasBadge ? (
        <>
          <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-1 top-1 hidden size-2 rounded-full bg-sidebar-indicator ring-2 ring-sidebar group-data-[collapsible=icon]:block"
          />
        </>
      ) : null}
    </SidebarMenuItem>
  );
}
