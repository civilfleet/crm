import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { getInitials } from "@/components/design/initials-avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/*
  A single record, after Attio's record page:

    ┌ People › Giulia Conti ──────────────────────── [Edit] [⋯] ┐
    │ ◯ Giulia Conti                         │ Details           │
    │   chips · email · city                 │ label   value     │
    │   tags                                 │ label   value     │
    │ Activity  Events 2  Files  Changes     │                   │
    │ ─────────────────────────────────────  │ Record            │
    │ tab content (scrolls)                  │ created · updated │
    └────────────────────────────────────────┴───────────────────┘

  The list is one click behind (breadcrumb), the record's facts sit in a
  quiet panel, and the main column is for what happens with the record.
*/

// Server-safe: record pages are server components and pass icons in here.
// The one interactive piece, the tabs, lives in record-tabs.tsx.

export const RecordPage = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-[calc(100svh-3.5rem)] flex-col bg-card md:h-svh md:min-h-0">
    {children}
  </div>
);

type RecordTopBarProps = {
  /** Back to the list this record belongs to. */
  list: { href: string; label: string; icon: LucideIcon };
  /** A step between the list and this page: the record an edit page edits. */
  parent?: { href: string; label: string };
  title: string;
  actions?: React.ReactNode;
};

export const RecordTopBar = ({
  list,
  parent,
  title,
  actions,
}: RecordTopBarProps) => {
  const ListIcon = list.icon;
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
        <Link
          href={list.href}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
        >
          <ListIcon aria-hidden="true" className="size-4" />
          {list.label}
        </Link>
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        {parent ? (
          <>
            <Link
              href={parent.href}
              className="min-w-0 truncate rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
            >
              {parent.label}
            </Link>
            <ChevronRight
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          </>
        ) : null}
        <span
          aria-current="page"
          className="truncate px-1 text-sm font-medium"
          title={title}
        >
          {title}
        </span>
      </nav>
      {actions ? (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {actions}
        </div>
      ) : null}
    </div>
  );
};

type RecordHeaderProps = {
  name: string;
  /** People get a round avatar, organizations a square one. Any other
   * record (a funding request, an event, a file) shows its icon. */
  kind: "person" | "organization" | "record";
  icon?: LucideIcon;
  /** A person's photo or an organization's logo, in place of initials. */
  imageSrc?: string | null;
  /** A small control on the picture, e.g. to change a photo or logo. */
  imageAction?: React.ReactNode;
  /** Small text after the name: pronouns, a status. */
  nameMeta?: React.ReactNode;
  /** One line of quick facts: chips, an email, a city. */
  facts?: React.ReactNode;
  /** Below the facts: tags. */
  children?: React.ReactNode;
};

export const RecordHeader = ({
  name,
  kind,
  icon: Icon,
  imageSrc,
  imageAction,
  nameMeta,
  facts,
  children,
}: RecordHeaderProps) => (
  <div className="flex items-start gap-4 px-6 pt-6 pb-4">
    <div className="relative shrink-0">
      {kind === "organization" && imageSrc ? (
        <Avatar
          aria-hidden="true"
          className="size-12 shrink-0 rounded-lg border bg-logo-tile"
        >
          <AvatarImage src={imageSrc} alt="" className="object-contain p-1" />
          <AvatarFallback className="rounded-lg bg-background text-base font-semibold text-muted-foreground">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
      ) : kind === "person" && imageSrc ? (
        <Avatar aria-hidden="true" className="size-12 shrink-0">
          <AvatarImage src={imageSrc} alt="" className="object-cover" />
          <AvatarFallback className="bg-sidebar-active text-base font-semibold text-sidebar-active-foreground">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "flex size-12 shrink-0 items-center justify-center text-base font-semibold",
            kind === "person"
              ? "rounded-full bg-sidebar-active text-sidebar-active-foreground"
              : "rounded-lg border bg-background text-muted-foreground",
          )}
        >
          {kind === "record" && Icon ? (
            <Icon className="size-5" />
          ) : (
            getInitials(name)
          )}
        </span>
      )}
      {imageAction ? (
        <div className="absolute -right-1.5 -bottom-1.5">{imageAction}</div>
      ) : null}
    </div>
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <h1 className="text-xl font-semibold tracking-tight text-balance break-words">
          {name}
        </h1>
        {nameMeta ? (
          <span className="text-sm text-muted-foreground">{nameMeta}</span>
        ) : null}
      </div>
      {facts ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
          {facts}
        </div>
      ) : null}
      {children}
    </div>
  </div>
);

/** One quick fact in the header: an icon and a value, optionally a link. */
export const RecordFact = ({
  icon: Icon,
  children,
  href,
  external = false,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  href?: string;
  external?: boolean;
}) => {
  const content = (
    <>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </>
  );
  return href ? (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="inline-flex max-w-full min-w-0 items-center gap-1.5 hover:text-foreground hover:underline"
    >
      {content}
    </a>
  ) : (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
      {content}
    </span>
  );
};

/** Two columns on wide screens: the record's story, and its facts. */
export const RecordBody = ({
  main,
  aside,
}: {
  main: React.ReactNode;
  aside: React.ReactNode;
}) => (
  // Narrow: one column that scrolls as a whole. Wide: the story and the
  // facts side by side, each scrolling on its own. `relative` on each scroll
  // area keeps positioned helpers (sr-only labels) inside it.
  <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
    <div className="relative flex min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-y-auto">
      {main}
    </div>
    <aside className="relative shrink-0 border-t bg-background/40 lg:w-[22rem] lg:overflow-y-auto lg:border-t-0 lg:border-l">
      {aside}
    </aside>
  </div>
);

export const RecordSidebarSection = ({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="border-b px-5 py-4 last:border-b-0">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-xs font-semibold text-muted-foreground">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

/** Label on the left, value on the right; long values wrap under themselves. */
export const AttributeList = ({ children }: { children: React.ReactNode }) => (
  <dl className="space-y-0.5">{children}</dl>
);

export const AttributeRow = ({
  icon: Icon,
  label,
  children,
  wrap = false,
  title,
}: {
  icon?: LucideIcon;
  label: string;
  children: React.ReactNode;
  /** Let the value wrap (notes, addresses, chip lists). Otherwise one line. */
  wrap?: boolean;
  /** Full value on hover when it is truncated. */
  title?: string;
}) => (
  <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-start gap-3 rounded-md px-1 py-1.5 text-sm">
    <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
      {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
      <span className="truncate" title={label}>
        {label}
      </span>
    </dt>
    <dd
      title={title}
      className={
        wrap
          ? "min-w-0 break-words [overflow-wrap:anywhere]"
          : "min-w-0 truncate"
      }
    >
      {children}
    </dd>
  </div>
);
