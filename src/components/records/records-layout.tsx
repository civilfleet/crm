import { type LucideIcon, MoreHorizontal } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/*
  The frame of a records page (from the joshi branch):

    ┌ header ─ icon · title · count ──────────── ⋯  [New] ┐
    │ toolbar · the table · footer (components/data-table) │
    └──────────────────────────────────────────────────────┘

  One primary action, everything else one click away in the ⋯ menu.
  The header sits flush under the top of the page, like the breadcrumb bar
  of record pages (records/record-page), so every page starts the same way.
*/

/**
 * Fills the page below the top. Pages that sit inside other content
 * pass `fill={false}` and get a bordered box instead.
 */
export const RecordsPage = ({
  children,
  fill = true,
}: {
  children: React.ReactNode;
  fill?: boolean;
}) => (
  <div
    className={cn(
      "flex min-w-0 flex-col bg-card",
      fill
        ? "min-h-[calc(100svh-3.5rem)] md:min-h-svh"
        : "overflow-hidden rounded-lg border",
    )}
  >
    {children}
  </div>
);

// A fixed locale renders the same on the server and in the browser.
const COUNT_FORMAT = new Intl.NumberFormat("en-GB");

type RecordsHeaderProps = {
  icon: LucideIcon;
  title: string;
  count?: number;
  /** The primary action, e.g. "New person". */
  action?: React.ReactNode;
  /** Secondary actions, rendered inside the ⋯ menu. */
  menu?: React.ReactNode;
};

export const RecordsHeader = ({
  icon: Icon,
  title,
  count,
  action,
  menu,
}: RecordsHeaderProps) => (
  <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
    <span
      aria-hidden="true"
      className="flex size-7 items-center justify-center rounded-md border bg-background text-muted-foreground"
    >
      <Icon className="size-4" />
    </span>
    <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
    {typeof count === "number" ? (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
        {COUNT_FORMAT.format(count)}
      </span>
    ) : null}
    <div className="ml-auto flex items-center gap-2">
      {menu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`More ${title.toLowerCase()} actions`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {menu}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {action}
    </div>
  </header>
);
