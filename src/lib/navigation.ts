import type { AppModule } from "@/types";

/*
  The sidebar's rules, kept apart from its React components so they can be
  tested: how items group into sections, where links point, which item is
  the current page, and which items a team's modules allow.
*/

export type NavEntry = {
  title?: string;
  url?: string;
  type?: "separator";
  label?: string;
  module?: AppModule;
};

export type NavLinkEntry<T extends NavEntry> = T & {
  title: string;
  url: string;
};

export type NavSection<T extends NavEntry> = {
  key: string;
  label?: string;
  items: NavLinkEntry<T>[];
};

export const isNavSeparator = (item: NavEntry) => item.type === "separator";

export const isNavLink = <T extends NavEntry>(
  item: T,
): item is NavLinkEntry<T> =>
  item.type !== "separator" &&
  typeof item.title === "string" &&
  typeof item.url === "string";

/** Separators with a label open a new section; unlabeled ones just split. */
export const groupIntoSections = <T extends NavEntry>(
  items: T[],
): NavSection<T>[] => {
  const sections: NavSection<T>[] = [{ key: "root", items: [] }];

  for (const item of items) {
    if (isNavSeparator(item)) {
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

/**
 * Where the nav links of this page start: `/admin`, `/teams/<id>` or
 * `/organizations/<id>`; null where there is no team or organization yet.
 */
export const getNavBasePath = (pathname: string): string | null => {
  const [scope, id] = pathname.split("/").filter(Boolean);

  if (scope === "admin") return "/admin";
  if (!id || (scope === "teams" && id === "profile")) return null;
  if (scope === "teams" || scope === "organizations") return `/${scope}/${id}`;
  return null;
};

export const getNavHref = (basePath: string, url: string) =>
  url ? `${basePath}/${url}` : basePath;

/** The item is the current page, or one of its pages (a record, a form). */
export const isNavItemActive = (
  pathname: string,
  basePath: string,
  url: string,
) => {
  const href = getNavHref(basePath, url);
  if (!url) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
};

/**
 * The items a team's modules allow. Labeled separators (module headings)
 * stay; unlabeled ones only where content sits on both sides; never one at
 * the end.
 */
export const filterNavItemsByModules = <T extends NavEntry>(
  items: T[],
  modules: readonly AppModule[],
): T[] => {
  if (modules.length === 0) {
    return [];
  }

  const filtered = items.filter(
    (item) => !item.module || modules.includes(item.module),
  );

  const cleaned: T[] = [];

  for (let i = 0; i < filtered.length; i++) {
    const item = filtered[i];

    if (isNavSeparator(item)) {
      if (item.label) {
        cleaned.push(item);
        continue;
      }

      const hasPreviousContent =
        cleaned.length > 0 && !isNavSeparator(cleaned[cleaned.length - 1]);
      let j = i + 1;
      while (j < filtered.length && isNavSeparator(filtered[j])) {
        j++;
      }
      const hasNextContent = j < filtered.length;

      if (!hasPreviousContent || !hasNextContent) {
        continue;
      }
    }

    cleaned.push(item);
  }

  if (cleaned.length && isNavSeparator(cleaned[cleaned.length - 1])) {
    cleaned.pop();
  }

  return cleaned;
};

/** The sections someone closed, as stored; anything unreadable is none. */
export const parseClosedSections = (stored: string | null): string[] => {
  try {
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
};
