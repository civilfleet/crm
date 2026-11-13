import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import navItems from "@/components/nav-items";
import {
  filterNavItemsByModules,
  getNavBasePath,
  getNavHref,
  groupIntoSections,
  isNavItemActive,
  type NavEntry,
  parseClosedSections,
} from "@/lib/navigation";
import {
  parseSidebarOpen,
  parseSidebarWidth,
} from "@/lib/sidebar-state-values";

const links = (items: NavEntry[]) =>
  items.filter((item) => item.type !== "separator").map((item) => item.url);

test("every sidebar entry points at a page that exists", () => {
  const roots = {
    admin: "src/app/admin",
    team: "src/app/teams/[teamId]",
    organization: "src/app/organizations/[organizationId]",
  } as const;

  for (const [scope, root] of Object.entries(roots)) {
    for (const url of links(navItems[scope as keyof typeof roots])) {
      const page = path.join(root, url ?? "", "page.tsx");
      assert.ok(existsSync(page), `${scope} nav "${url}" has no ${page}`);
    }
  }
});

test("labeled separators open collapsible sections", () => {
  const sections = groupIntoSections([
    { title: "Tags", url: "tags" },
    { type: "separator", label: "Funding" },
    { title: "Requests", url: "funding/funding-requests" },
    { type: "separator", label: "Empty" },
    { type: "separator", label: "CRM" },
    { title: "Contacts", url: "crm/contacts" },
  ]);

  assert.deepEqual(
    sections.map((section) => [section.key, links(section.items)]),
    [
      ["root", ["tags"]],
      ["Funding", ["funding/funding-requests"]],
      ["CRM", ["crm/contacts"]],
    ],
  );
});

test("links start at the team, organization or admin area", () => {
  assert.equal(getNavBasePath("/admin/teams"), "/admin");
  assert.equal(getNavBasePath("/teams/t1/crm/contacts"), "/teams/t1");
  assert.equal(getNavBasePath("/organizations/o1"), "/organizations/o1");
  assert.equal(getNavBasePath("/teams/profile"), null);
  assert.equal(getNavBasePath("/teams"), null);
  assert.equal(getNavBasePath("/public/t1/events"), null);
  assert.equal(getNavHref("/teams/t1", ""), "/teams/t1");
  assert.equal(getNavHref("/teams/t1", "users"), "/teams/t1/users");
});

test("an entry stays active on its records but not on its siblings", () => {
  const base = "/teams/t1";
  assert.ok(isNavItemActive("/teams/t1/crm/contacts", base, "crm/contacts"));
  assert.ok(isNavItemActive("/teams/t1/crm/contacts/c1", base, "crm/contacts"));
  assert.ok(!isNavItemActive("/teams/t1/crm/contacts-x", base, "crm/contacts"));
  assert.ok(isNavItemActive("/teams/t1", base, ""));
  assert.ok(!isNavItemActive("/teams/t1/users", base, ""));
});

test("module filtering hides other modules and dangling separators", () => {
  const items: NavEntry[] = [
    { type: "separator" },
    { title: "Tags", url: "tags", module: "CRM" },
    { type: "separator", label: "Funding", module: "FUNDING" },
    { title: "Requests", url: "funding/funding-requests", module: "FUNDING" },
    { type: "separator", label: "CRM", module: "CRM" },
    { title: "Contacts", url: "crm/contacts", module: "CRM" },
    { type: "separator" },
  ];

  assert.deepEqual(
    filterNavItemsByModules(items, ["CRM"]).map(
      (item) => item.label ?? item.url,
    ),
    ["tags", "CRM", "crm/contacts"],
  );
  assert.deepEqual(filterNavItemsByModules(items, []), []);
});

test("stored sidebar state falls back safely", () => {
  assert.deepEqual(parseClosedSections('["CRM",1,"Admin"]'), ["CRM", "Admin"]);
  assert.deepEqual(parseClosedSections("{not json"), []);
  assert.deepEqual(parseClosedSections(null), []);

  assert.equal(parseSidebarOpen(undefined), true);
  assert.equal(parseSidebarOpen("1"), true);
  assert.equal(parseSidebarOpen("0"), false);

  assert.equal(parseSidebarWidth("300"), 300);
  assert.equal(parseSidebarWidth("100"), undefined);
  assert.equal(parseSidebarWidth("9000"), undefined);
  assert.equal(parseSidebarWidth("wide"), undefined);
  assert.equal(parseSidebarWidth(undefined), undefined);
});
