import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { getInitials } from "@/components/design/initials-avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/*
  Cells for the records grid. One rule runs through all of them: a cell is
  one line. Anything that does not fit truncates (the full value is in the
  title), and an empty value is an empty cell, not "N/A" or "-". That alone
  removes most of the noise from a dense list.
*/

export const EmptyCell = () => null;

type TextCellProps = {
  value?: string | number | null;
  muted?: boolean;
  className?: string;
};

export const TextCell = ({
  value,
  muted = false,
  className,
}: TextCellProps) => {
  if (value === null || value === undefined || value === "") {
    return <EmptyCell />;
  }
  const text = String(value);
  return (
    <span
      title={text}
      className={cn(
        "block truncate",
        muted && "text-muted-foreground",
        className,
      )}
    >
      {text}
    </span>
  );
};

type RecordAvatarProps = {
  name: string;
  kind: "person" | "organization";
  /** A person's photo or an organization's logo; the initials show until it loads, or if it can't. */
  imageSrc?: string | null;
  className?: string;
};

/** People are round, organisations are square: you can tell them apart at a glance. */
export const RecordAvatar = ({
  name,
  kind,
  imageSrc,
  className,
}: RecordAvatarProps) =>
  kind === "organization" && imageSrc ? (
    <Avatar
      aria-hidden="true"
      className={cn("size-6 rounded-md border bg-logo-tile", className)}
    >
      <AvatarImage src={imageSrc} alt="" className="object-contain p-0.5" />
      <AvatarFallback className="rounded-md bg-card text-[10px] font-semibold text-muted-foreground">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  ) : kind === "person" && imageSrc ? (
    <Avatar aria-hidden="true" className={cn("size-6", className)}>
      <AvatarImage src={imageSrc} alt="" className="object-cover" />
      <AvatarFallback className="bg-sidebar-active text-[10px] font-semibold text-sidebar-active-foreground">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center text-[10px] font-semibold",
        kind === "person"
          ? "rounded-full bg-sidebar-active text-sidebar-active-foreground"
          : "rounded-md border bg-card text-muted-foreground",
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );

/** Anything that is not a person or an organization: its list's icon on a square tile. */
export const RecordIcon = ({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className?: string;
}) => (
  <span
    aria-hidden="true"
    className={cn(
      "flex size-6 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground",
      className,
    )}
  >
    <Icon className="size-3.5" />
  </span>
);

type RecordNameCellProps = {
  name: string;
  href?: string;
  /** A quiet second piece of information on the same line: pronouns, a type. */
  meta?: string | null;
  /** An organization's logo, in place of its initials. */
  imageSrc?: string | null;
} & (
  | { kind: "person" | "organization"; icon?: undefined }
  /** A request, an event, a file: no avatar, an icon instead. */
  | { kind: "record"; icon: LucideIcon }
);

const nameLinkClass =
  "flex min-w-0 items-center gap-2 rounded-sm outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring";

/** The record's identity, and the way into it. */
export const RecordNameCell = ({
  name,
  kind,
  icon,
  href,
  meta,
  imageSrc,
}: RecordNameCellProps) => {
  const content = (
    <>
      {kind === "record" ? (
        <RecordIcon icon={icon} />
      ) : (
        <RecordAvatar name={name} kind={kind} imageSrc={imageSrc} />
      )}
      <span className="truncate font-medium">{name}</span>
      {meta ? (
        <span className="shrink-0 truncate text-xs text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </>
  );

  if (!href) {
    return (
      <span className="flex min-w-0 items-center gap-2" title={name}>
        {content}
      </span>
    );
  }

  // API routes are plain links: prefetching one would fetch the file.
  if (href.startsWith("/api/")) {
    return (
      <a href={href} title={name} className={nameLinkClass}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} title={name} className={nameLinkClass}>
      {content}
    </Link>
  );
};

type RecordChipProps = {
  children: React.ReactNode;
  /** A colour the user chose (an organisation type), shown as a dot. */
  color?: string | null;
  avatar?: { name: string; kind: "person" | "organization" };
  /** What kind of record it is, for chips that point at one. */
  icon?: LucideIcon;
  title?: string;
};

/** A linked value inside a cell: an organisation, a tag, a person. */
export const RecordChip = ({
  children,
  color,
  avatar,
  icon: Icon,
  title,
}: RecordChipProps) => (
  <span
    title={title}
    className="inline-flex h-6 max-w-48 shrink-0 items-center gap-1.5 rounded-md border bg-card px-1.5 text-xs text-foreground"
  >
    {avatar ? (
      <RecordAvatar
        name={avatar.name}
        kind={avatar.kind}
        className="size-4 text-[8px]"
      />
    ) : null}
    {Icon ? (
      <Icon
        aria-hidden="true"
        className="size-3 shrink-0 text-muted-foreground"
      />
    ) : null}
    {color ? (
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
    ) : null}
    <span className="truncate">{children}</span>
  </span>
);

type ChipListProps<Item> = {
  items: Item[];
  getKey: (item: Item) => string;
  renderChip: (item: Item) => React.ReactNode;
  /** How many chips before the rest collapse into "+n". */
  max?: number;
  getLabel?: (item: Item) => string;
};

export const ChipList = <Item,>({
  items,
  getKey,
  renderChip,
  max = 2,
  getLabel,
}: ChipListProps<Item>) => {
  if (items.length === 0) {
    return <EmptyCell />;
  }
  const visible = items.slice(0, max);
  const hidden = items.slice(max);
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {visible.map((item) => (
        <span key={getKey(item)} className="min-w-0">
          {renderChip(item)}
        </span>
      ))}
      {hidden.length > 0 ? (
        <span
          className="shrink-0 text-xs text-muted-foreground"
          title={getLabel ? hidden.map(getLabel).join(", ") : undefined}
        >
          +{hidden.length}
        </span>
      ) : null}
    </span>
  );
};

type EmailCellProps = {
  email?: string | null;
  /** Further addresses beyond the primary one. */
  moreCount?: number;
};

export const EmailCell = ({ email, moreCount = 0 }: EmailCellProps) => {
  if (!email) {
    return <EmptyCell />;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate" title={email}>
        {email}
      </span>
      {moreCount > 0 ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          +{moreCount}
        </span>
      ) : null}
    </span>
  );
};

/** "https://www.example.org/" → "example.org" */
export const toDisplayDomain = (url: string) =>
  url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");

const toHref = (url: string) =>
  /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;

export const LinkCell = ({ url }: { url?: string | null }) => {
  if (!url) {
    return <EmptyCell />;
  }
  return (
    <a
      href={toHref(url)}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="block truncate text-interactive hover:underline"
    >
      {toDisplayDomain(url)}
    </a>
  );
};

export const LocationCell = ({
  city,
  country,
}: {
  city?: string | null;
  country?: string | null;
}) => <TextCell value={[city, country].filter(Boolean).join(", ")} />;

export const formatRecordDate = (
  value?: string | Date | null,
  options: { withTime?: boolean } = {},
) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, options.withTime ? "d MMM yyyy, HH:mm" : "d MMM yyyy");
};

/** A date; with `withTime` also the hour and minute (local time). */
export const DateCell = ({
  value,
  withTime = false,
}: {
  value?: string | Date | null;
  withTime?: boolean;
}) => <TextCell value={formatRecordDate(value, { withTime })} muted />;
