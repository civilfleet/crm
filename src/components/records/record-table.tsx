"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type RowData,
  type RowSelectionState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useRangeSelect } from "@/hooks/use-range-select";
import { nextSorts, type RecordSort } from "@/lib/list-request";
import { TABLE_PAGE_SIZES } from "@/lib/table-page-size";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Shown in the header and in the Columns menu. */
    label?: string;
    /** The attribute's type, drawn before the label (Attio-style). */
    icon?: LucideIcon;
    /** Server-side sort key; the header becomes a sort button. */
    sortField?: string;
    /** Fixed width in px. */
    width?: number;
    /** Stays put while the grid scrolls sideways (the record's name). */
    pinned?: boolean;
    /** Cannot be hidden from the Columns menu. */
    alwaysVisible?: boolean;
    /** Numbers (money, counts) line up on the right, header included. */
    align?: "right";
  }
}

const NO_SORTS: RecordSort<string>[] = [];

const DEFAULT_WIDTH = 180;
const SELECT_WIDTH = 40;

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  /** There are more than `total` (counting stopped there): "1,000+". */
  totalCapped?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

type RecordTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  getRowId: (row: TData) => string;
  /** Where a row leads. Clicking anywhere on the row that is not itself a control opens it. */
  getRowHref?: (row: TData) => string | undefined;
  isLoading?: boolean;
  /** Shown when there are no rows (and not loading). */
  emptyState: React.ReactNode;
  pagination: Pagination;
  /** "person" / "people", for "1–25 of 59 people". */
  noun: { one: string; other: string };
  /** The orders, most important first. */
  sorts?: RecordSort<string>[];
  onSortsChange?: (sorts: RecordSort<string>[]) => void;
  columnVisibility?: VisibilityState;
  selectable?: boolean;
  renderBulkActions?: (params: {
    selectedRows: TData[];
    clearSelection: () => void;
  }) => React.ReactNode;
  /** Replaces the grid with another view of the same page of rows. */
  view?: "table" | "cards" | "map";
  renderCards?: (rows: TData[]) => React.ReactNode;
  renderMap?: (rows: TData[]) => React.ReactNode;
  className?: string;
};

/**
 * A records grid in the manner of Attio's: the list fills the page, hairline
 * rules between cells, the header and the record's name stay put while you
 * scroll, and a row opens its record. Everything else (filters, views,
 * actions) lives above it; selection actions float below it.
 */
export const RecordTable = <TData,>({
  columns,
  data,
  getRowId,
  getRowHref,
  isLoading = false,
  emptyState,
  pagination,
  noun,
  sorts = NO_SORTS,
  onSortsChange,
  columnVisibility,
  selectable = false,
  renderBulkActions,
  view = "table",
  renderCards,
  renderMap,
  className,
}: RecordTableProps<TData>) => {
  const router = useRouter();
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  // A selection only means something for rows that are still on screen.
  React.useEffect(() => {
    setRowSelection((current) => {
      const visibleIds = new Set(data.map(getRowId));
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => visibleIds.has(id)),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [data, getRowId]);

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: selectable,
    onRowSelectionChange: setRowSelection,
    manualSorting: true,
    manualPagination: true,
    state: { rowSelection, columnVisibility: columnVisibility ?? {} },
  });

  const selectedRows = table
    .getSelectedRowModel()
    .rows.map((row) => row.original);
  const rowIds = React.useMemo(() => data.map(getRowId), [data, getRowId]);
  const handleSelectClick = useRangeSelect(
    rowIds,
    (id) => Boolean(rowSelection[id]),
    (ids, selected) =>
      setRowSelection((current) => {
        const next = { ...current };
        for (const id of ids) {
          if (selected) next[id] = true;
          else delete next[id];
        }
        return next;
      }),
  );
  const clearSelection = React.useCallback(() => setRowSelection({}), []);

  // Click: this column alone; Shift-click: add it (lib/list-request).
  const handleSort = (field: string, isAdding: boolean) => {
    if (!onSortsChange) return;
    onSortsChange(nextSorts(sorts, field, isAdding));
  };

  const handleRowClick = (
    event: React.MouseEvent<HTMLTableRowElement>,
    row: TData,
  ) => {
    const href = getRowHref?.(row);
    if (!href) return;
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "a, button, input, label, select, textarea, [role='checkbox'], [data-row-click='ignore']",
      ) ||
      window.getSelection()?.toString()
    ) {
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  };

  const rows = table.getRowModel().rows;
  const showSkeleton = isLoading && rows.length === 0;
  const isEmpty = !isLoading && rows.length === 0;
  const pinnedOffset = selectable ? SELECT_WIDTH : 0;

  const pageCount = Math.max(
    1,
    Math.ceil(pagination.total / pagination.pageSize),
  );
  const from =
    pagination.total === 0
      ? 0
      : (pagination.page - 1) * pagination.pageSize + 1;
  const to = Math.min(pagination.page * pagination.pageSize, pagination.total);

  const allOnPageSelected = table.getIsAllPageRowsSelected();
  const someOnPageSelected = table.getIsSomePageRowsSelected();

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-auto">
        {view === "map" && renderMap ? (
          <div className="h-full p-4">{renderMap(data)}</div>
        ) : view === "cards" && renderCards ? (
          isEmpty ? (
            emptyState
          ) : (
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {renderCards(data)}
            </div>
          )
        ) : (
          <>
            <table className="w-max min-w-full table-fixed border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-20">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {selectable ? (
                      <th
                        style={{ width: SELECT_WIDTH }}
                        className="sticky left-0 z-30 h-9 border-r border-b bg-card px-3 text-left align-middle"
                      >
                        <Checkbox
                          aria-label="Select all on this page"
                          checked={
                            allOnPageSelected
                              ? true
                              : someOnPageSelected
                                ? "indeterminate"
                                : false
                          }
                          disabled={rows.length === 0}
                          onCheckedChange={(value) =>
                            table.toggleAllPageRowsSelected(Boolean(value))
                          }
                        />
                      </th>
                    ) : null}
                    {headerGroup.headers.map((header) => {
                      const meta = header.column.columnDef.meta;
                      const Icon = meta?.icon;
                      const sortField = meta?.sortField;
                      const sortIndex = sortField
                        ? sorts.findIndex((sort) => sort.field === sortField)
                        : -1;
                      const sort = sortIndex >= 0 ? sorts[sortIndex] : null;
                      const label = header.isPlaceholder
                        ? null
                        : (meta?.label ??
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          ));
                      const content = (
                        <>
                          {Icon ? (
                            <Icon
                              aria-hidden="true"
                              className="size-3.5 shrink-0"
                            />
                          ) : null}
                          <span className="truncate">{label}</span>
                          {sort && sorts.length > 1 ? (
                            // Which order this is, when there are several.
                            <span className="text-[10px] font-semibold tabular-nums text-foreground">
                              {sortIndex + 1}
                            </span>
                          ) : null}
                          {sort ? (
                            sort.direction === "asc" ? (
                              <ArrowUp
                                aria-hidden="true"
                                className="size-3.5 shrink-0 text-foreground"
                              />
                            ) : (
                              <ArrowDown
                                aria-hidden="true"
                                className="size-3.5 shrink-0 text-foreground"
                              />
                            )
                          ) : null}
                        </>
                      );
                      return (
                        <th
                          key={header.id}
                          style={{
                            width: meta?.width ?? DEFAULT_WIDTH,
                            left: meta?.pinned ? pinnedOffset : undefined,
                          }}
                          aria-sort={
                            sort
                              ? sort.direction === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                          className={cn(
                            "h-9 border-r border-b bg-card text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground",
                            // A sortable header is one button, edge to edge.
                            sortField && onSortsChange ? "p-0" : "px-3",
                            meta?.pinned && "sticky z-30",
                            meta?.align === "right" && "text-right",
                          )}
                        >
                          {sortField && onSortsChange ? (
                            <button
                              type="button"
                              onClick={(event) =>
                                handleSort(sortField, event.shiftKey)
                              }
                              title="Click to sort; Shift-click to add to the order"
                              className={cn(
                                "flex h-9 w-full cursor-pointer items-center gap-1.5 px-3 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden focus-visible:ring-inset",
                                meta?.align === "right" && "justify-end",
                              )}
                            >
                              {content}
                            </button>
                          ) : (
                            <span
                              className={cn(
                                "flex items-center gap-1.5",
                                meta?.align === "right" && "justify-end",
                              )}
                            >
                              {content}
                            </span>
                          )}
                        </th>
                      );
                    })}
                    <td className="border-b bg-card" />
                  </tr>
                ))}
              </thead>
              <tbody>
                {showSkeleton
                  ? Array.from({ length: 8 }, (_, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
                      <tr key={`skeleton-${index}`}>
                        {selectable ? (
                          <td className="h-10 border-r border-b bg-card px-3" />
                        ) : null}
                        {table.getVisibleLeafColumns().map((column) => (
                          <td
                            key={column.id}
                            className="h-10 border-r border-b bg-card px-3"
                          >
                            <Skeleton className="h-3.5 w-2/3" />
                          </td>
                        ))}
                        <td className="border-b bg-card" />
                      </tr>
                    ))
                  : rows.map((row) => {
                      const href = getRowHref?.(row.original);
                      const isSelected = row.getIsSelected();
                      const cellClass = cn(
                        "h-10 border-r border-b px-3 align-middle transition-colors",
                        isSelected
                          ? "bg-sidebar-active"
                          : "bg-card group-hover:bg-muted",
                      );
                      return (
                        <tr
                          key={row.id}
                          data-state={isSelected ? "selected" : undefined}
                          onClick={(event) => {
                            // Next to the box, inside its cell: select, not open.
                            const target = event.target as HTMLElement;
                            if (target.closest("[data-select-cell]")) {
                              if (target.closest("[role='checkbox']")) return;
                              let ranged = false;
                              handleSelectClick(
                                {
                                  shiftKey: event.shiftKey,
                                  preventDefault: () => {
                                    ranged = true;
                                  },
                                },
                                row.id,
                              );
                              if (!ranged) row.toggleSelected(!isSelected);
                              return;
                            }
                            handleRowClick(event, row.original);
                          }}
                          className={cn("group", href && "cursor-pointer")}
                        >
                          {selectable ? (
                            <td
                              // The whole cell selects the row (the row's
                              // click handler): a near miss must not open it.
                              data-select-cell=""
                              className={cn(
                                cellClass,
                                "sticky left-0 z-10 cursor-default",
                              )}
                              // No text selection on a shift-click (cell or box).
                              onMouseDown={(event) => {
                                if (event.shiftKey) event.preventDefault();
                              }}
                            >
                              <Checkbox
                                aria-label="Select row"
                                checked={isSelected}
                                // Shift-click: from the last row clicked to here.
                                onClick={(event) =>
                                  handleSelectClick(event, row.id)
                                }
                                onCheckedChange={(value) =>
                                  row.toggleSelected(Boolean(value))
                                }
                              />
                            </td>
                          ) : null}
                          {row.getVisibleCells().map((cell) => {
                            const meta = cell.column.columnDef.meta;
                            return (
                              <td
                                key={cell.id}
                                style={{
                                  left: meta?.pinned ? pinnedOffset : undefined,
                                }}
                                className={cn(
                                  cellClass,
                                  "max-w-0 overflow-hidden",
                                  meta?.pinned && "sticky z-10",
                                  meta?.align === "right" &&
                                    "text-right tabular-nums",
                                )}
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </td>
                            );
                          })}
                          <td className={cn(cellClass, "border-r-0")} />
                        </tr>
                      );
                    })}
              </tbody>
            </table>
            {isEmpty ? emptyState : null}
          </>
        )}
      </div>

      {view !== "map" ? (
        <footer className="flex h-11 shrink-0 items-center justify-between gap-3 border-t bg-card px-4 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {pagination.total === 0
              ? `0 ${noun.other}`
              : `${from}–${to} of ${pagination.total.toLocaleString()}${
                  pagination.totalCapped ? "+" : ""
                } ${pagination.total === 1 ? noun.one : noun.other}`}
          </span>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span>Rows</span>
              <Select
                value={String(pagination.pageSize)}
                onValueChange={(value) =>
                  pagination.onPageSizeChange(Number(value))
                }
              >
                <SelectTrigger
                  aria-label="Rows per page"
                  className="h-7 w-[4.5rem] text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TABLE_PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="tabular-nums">
              {pagination.page} / {pageCount}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7"
                aria-label="Previous page"
                disabled={pagination.page <= 1}
                onClick={() => pagination.onPageChange(pagination.page - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7"
                aria-label="Next page"
                disabled={pagination.page >= pageCount}
                onClick={() => pagination.onPageChange(pagination.page + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </footer>
      ) : null}

      {selectable && renderBulkActions && selectedRows.length > 0 ? (
        <div
          role="toolbar"
          aria-label="Selected records"
          className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-foreground py-1 pr-1 pl-3 text-background shadow-xl animate-in fade-in-0 slide-in-from-bottom-2"
        >
          <span className="pr-2 text-sm font-medium tabular-nums whitespace-nowrap">
            {selectedRows.length} selected
          </span>
          <span aria-hidden="true" className="h-5 w-px bg-background/20" />
          {renderBulkActions({ selectedRows, clearSelection })}
          <span aria-hidden="true" className="h-5 w-px bg-background/20" />
          <BulkActionButton
            aria-label="Clear selection"
            onClick={clearSelection}
          >
            <X />
          </BulkActionButton>
        </div>
      ) : null}
    </div>
  );
};

/** A button on the floating selection bar (light ink on the dark bar). */
export const BulkActionButton = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & { tone?: "default" | "destructive" }
>(({ className, tone = "default", ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant="ghost"
    size="sm"
    className={cn(
      "h-8 text-background hover:bg-background/15 hover:text-background focus-visible:ring-background/60 focus-visible:ring-offset-0",
      tone === "destructive" &&
        "text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground",
      className,
    )}
    {...props}
  />
));
BulkActionButton.displayName = "BulkActionButton";
