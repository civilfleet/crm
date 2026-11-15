"use client";

import { Check, Columns3, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/*
  The interactive parts of a records page (from the joshi branch): the
  toolbar row, the filter chips and the columns menu. Kept apart from
  records-layout, which server pages render directly.
*/

export const RecordsToolbar = ({
  start,
  end,
}: {
  start?: React.ReactNode;
  end?: React.ReactNode;
}) => (
  <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
    <div className="flex min-w-0 flex-wrap items-center gap-2">{start}</div>
    <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
      {end}
    </div>
  </div>
);

/** Holds the filter chips; only rendered when there are any. */
export const RecordsFilterBar = ({
  children,
  onClear,
}: {
  children: React.ReactNode;
  onClear: () => void;
}) => (
  <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-background/60 px-4 py-2">
    {children}
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs text-muted-foreground"
      onClick={onClear}
    >
      Clear all
    </Button>
  </div>
);

type FilterChipProps = {
  /** "Email contains “berlin”" */
  summary: React.ReactNode;
  /** The controls that edit this filter. */
  children: React.ReactNode;
  onRemove: () => void;
  /** Open on mount: a filter you just added asks for its value. */
  defaultOpen?: boolean;
  /** Not yet complete: drawn dashed, and not applied. */
  incomplete?: boolean;
};

/** One filter, as a pill. Click it to edit, × to remove. */
export const FilterChip = ({
  summary,
  children,
  onRemove,
  defaultOpen = false,
  incomplete = false,
}: FilterChipProps) => {
  const [open, setOpen] = React.useState(false);
  // A filter just added from the Filter menu opens a frame later: opened
  // while the menu is still closing, the popover dismisses itself at once.
  React.useEffect(() => {
    if (!defaultOpen) return;
    const frame = window.requestAnimationFrame(() => setOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, [defaultOpen]);

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md border bg-card text-xs",
        incomplete && "border-dashed text-muted-foreground",
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-full rounded-l-md px-2 font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          >
            {summary}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto max-w-[min(36rem,90vw)] p-3"
          // Land in the value you came to type, not on the operator.
          onOpenAutoFocus={(event) => {
            const content = event.currentTarget as HTMLElement | null;
            const field = content?.querySelector<HTMLInputElement>(
              "input:not([type='hidden']):not([disabled])",
            );
            if (field) {
              event.preventDefault();
              field.focus();
            }
          }}
        >
          <div className="flex flex-col gap-3">
            {children}
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={() => setOpen(false)}>
                <Check /> Done
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <span aria-hidden="true" className="h-4 w-px bg-border" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove filter"
        className="flex h-full items-center rounded-r-md px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
};

type ColumnOption = { id: string; label: string; alwaysVisible?: boolean };

type ColumnsMenuProps = {
  columns: ColumnOption[];
  visibility: Record<string, boolean>;
  onVisibilityChange: (id: string, visible: boolean) => void;
  onReset: () => void;
};

/** Which attributes the grid shows. Hidden columns are one click away, not gone. */
export const ColumnsMenu = ({
  columns,
  visibility,
  onVisibilityChange,
  onReset,
}: ColumnsMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5">
        <Columns3 /> Columns
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-52">
      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
        Show columns
      </DropdownMenuLabel>
      {columns.map((column) => (
        <DropdownMenuCheckboxItem
          key={column.id}
          checked={column.alwaysVisible || visibility[column.id] !== false}
          disabled={column.alwaysVisible}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={(value) =>
            onVisibilityChange(column.id, Boolean(value))
          }
        >
          {column.label}
        </DropdownMenuCheckboxItem>
      ))}
      <DropdownMenuSeparator />
      <button
        type="button"
        onClick={onReset}
        className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:outline-hidden"
      >
        Reset to default
      </button>
    </DropdownMenuContent>
  </DropdownMenu>
);

/**
 * Column visibility for one list. Defaults hide the long tail so the grid
 * opens uncluttered; the Columns menu brings any of it back. Remembering the
 * choice is the saved view's job (hooks/use-saved-view), per user and list.
 */
export const useColumnVisibility = (defaults: Record<string, boolean>) => {
  // The defaults are fixed per list; a ref keeps callers that pass a fresh
  // object literal from resetting anything.
  const defaultsRef = React.useRef(defaults);
  const [visibility, setVisibility] =
    React.useState<Record<string, boolean>>(defaults);

  const setColumnVisible = React.useCallback(
    (id: string, visible: boolean) =>
      setVisibility((current) => ({ ...current, [id]: visible })),
    [],
  );
  /** Apply a saved set on top of the defaults. */
  const restore = React.useCallback(
    (saved: Record<string, boolean>) =>
      setVisibility({ ...defaultsRef.current, ...saved }),
    [],
  );
  const reset = React.useCallback(() => setVisibility(defaultsRef.current), []);

  return React.useMemo(
    () => ({ visibility, setColumnVisible, restore, reset }),
    [visibility, setColumnVisible, restore, reset],
  );
};
