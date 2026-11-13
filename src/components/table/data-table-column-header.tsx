"use client";

import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: ReactNode;
  className?: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <div className={cn("flex items-center whitespace-nowrap", className)}>
        <span>{title}</span>
      </div>
    );
  }

  const sorted = column.getIsSorted();

  return (
    <button
      type="button"
      className={cn(
        "-mx-1 flex max-w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-xs font-medium whitespace-nowrap transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
        sorted && "text-foreground",
        className,
      )}
      aria-label={
        typeof title === "string" ? `Sort by ${title.toLowerCase()}` : undefined
      }
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      <span className="truncate">{title}</span>
      {sorted === "desc" ? (
        <ArrowDown aria-hidden="true" className="size-3.5 shrink-0" />
      ) : sorted === "asc" ? (
        <ArrowUp aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <ChevronsUpDown
          aria-hidden="true"
          className="size-3.5 shrink-0 opacity-40"
        />
      )}
    </button>
  );
}
