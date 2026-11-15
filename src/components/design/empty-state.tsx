import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  /** What is missing, said plainly: "No contacts yet". */
  title: React.ReactNode;
  /** Why it is empty, or what to do about it. */
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** The one thing that fills it: usually a button. */
  action?: React.ReactNode;
  /** `page` for an empty screen; `inline` inside a card or table. */
  size?: "page" | "inline";
  className?: string;
};

/**
 * What a list says when there is nothing in it.
 *
 * "No results." told you nothing about whether you had filtered everything
 * away or never added anything. An empty state says which, and offers the
 * way out.
 */
export const EmptyState = ({
  title,
  description,
  icon: Icon,
  action,
  size = "inline",
  className,
}: EmptyStateProps) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center text-center",
      size === "page" ? "gap-3 px-6 py-16" : "gap-2 px-4 py-10",
      className,
    )}
  >
    {Icon ? (
      <span
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
          size === "page" ? "mb-1 size-12" : "size-10",
        )}
      >
        <Icon className={size === "page" ? "size-6" : "size-5"} />
      </span>
    ) : null}
    <p
      className={cn(
        "font-medium text-foreground",
        size === "page" ? "text-base" : "text-sm",
      )}
    >
      {title}
    </p>
    {description ? (
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    ) : null}
    {action ? <div className="mt-2">{action}</div> : null}
  </div>
);
