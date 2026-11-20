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
import type { ColumnLayout } from "@/components/records/records-toolbar";
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
import { clampWidth, displayOrder, moveColumnId } from "@/lib/column-layout";
import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
} from "@/validations/view-preferences";

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

/** A column's id as the table knows it: its id, else its accessor key. */
const columnIdOf = <TData,>(column: ColumnDef<TData, unknown>) =>
  column.id ??
  String((column as { accessorKey?: string | number }).accessorKey ?? "");

const DEFAULT_WIDTH = 180;
const SELECT_WIDTH = 40;
/** A keyboard step when resizing (arrow keys on the column's edge). */
const RESIZE_STEP = 16;

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
  /** Dragged widths and order; without it the columns stay as listed. */
  columnLayout?: ColumnLayout;
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
  columnLayout,
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

  const columnIds = React.useMemo(() => columns.map(columnIdOf), [columns]);
  const pinnedIds = React.useMemo(
    () =>
      new Set(columns.filter((column) => column.meta?.pinned).map(columnIdOf)),
    [columns],
  );
  const savedOrder = columnLayout?.order;
  const columnOrder = React.useMemo(
    () => displayOrder(columnIds, pinnedIds, savedOrder ?? []),
    [columnIds, pinnedIds, savedOrder],
  );

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: selectable,
    onRowSelectionChange: setRowSelection,
    manualSorting: true,
    manualPagination: true,
    state: {
      rowSelection,
      columnVisibility: columnVisibility ?? {},
      columnOrder,
    },
  });

  // Resizing: the width while dragging, saved when let go.
  const [resizing, setResizing] = React.useState<{
    id: string;
    width: number;
  } | null>(null);
  const isResizingRef = React.useRef(false);
  const widthOf = (id: string, listed?: number) =>
    resizing?.id === id
      ? resizing.width
      : (columnLayout?.widths[id] ?? listed ?? DEFAULT_WIDTH);

  const handleResizeStart = (
    event: React.PointerEvent<HTMLDivElement>,
    id: string,
    startWidth: number,
  ) => {
    if (!columnLayout || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    isResizingRef.current = true;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    let width = startWidth;
    setResizing({ id, width });
    const handleMove = (move: PointerEvent) => {
      width = clampWidth(startWidth + move.clientX - startX);
      setResizing({ id, width });
    };
    const handleUp = () => {
      handle.removeEventListener("pointermove", handleMove);
      handle.removeEventListener("pointerup", handleUp);
      handle.removeEventListener("pointercancel", handleUp);
      isResizingRef.current = false;
      setResizing(null);
      if (width !== startWidth) columnLayout.setColumnWidth(id, width);
    };
    handle.addEventListener("pointermove", handleMove);
    handle.addEventListener("pointerup", handleUp);
    handle.addEventListener("pointercancel", handleUp);
  };

  const handleResizeKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    id: string,
    width: number,
  ) => {
    if (!columnLayout) return;
    const step =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    columnLayout.setColumnWidth(id, clampWidth(width + step * RESIZE_STEP));
  };

  // Reordering: drag a header onto another; the line shows where it lands.
  // Pointer events, not the browser's drag and drop: Firefox will not drag
  // from a button, and a sortable header is one.
  const [dragging, setDragging] = React.useState<string | null>(null);
  const suppressClickRef = React.useRef(false);
  const [dropTarget, setDropTarget] = React.useState<{
    id: string;
    side: "before" | "after";
  } | null>(null);
  const canMove = (id: string) => Boolean(columnLayout) && !pinnedIds.has(id);

  const handleMove = (id: string, targetId: string, side: "before" | "after") =>
    columnLayout?.setOrder(
      moveColumnId(columnOrder, id, targetId, side).filter(
        (entry) => !pinnedIds.has(entry),
      ),
    );

  const handleDragStart = (
    event: React.PointerEvent<HTMLTableCellElement>,
    id: string,
  ) => {
    if (!canMove(id) || event.button !== 0 || isResizingRef.current) return;
    const row = event.currentTarget.parentElement;
    if (!row) return;
    const startX = event.clientX;
    let active = false;
    let target: { id: string; side: "before" | "after" } | null = null;
    const handleMoveEvent = (move: PointerEvent) => {
      if (!active) {
        if (Math.abs(move.clientX - startX) < 6) return;
        active = true;
        suppressClickRef.current = true;
        document.body.style.userSelect = "none";
        setDragging(id);
      }
      target = null;
      for (const cell of row.querySelectorAll<HTMLElement>(
        "th[data-movable-column]",
      )) {
        const box = cell.getBoundingClientRect();
        const cellId = cell.dataset.movableColumn ?? "";
        if (move.clientX < box.left || move.clientX > box.right) continue;
        if (cellId !== id) {
          target = {
            id: cellId,
            side: move.clientX < box.left + box.width / 2 ? "before" : "after",
          };
        }
        break;
      }
      setDropTarget(target);
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMoveEvent);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      if (!active) return;
      document.body.style.userSelect = "";
      if (target) handleMove(id, target.id, target.side);
      setDragging(null);
      setDropTarget(null);
      // The click that ends a drag does not sort.
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };
    window.addEventListener("pointermove", handleMoveEvent);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };

  // Alt + arrow on a header moves it one visible column along.
  const handleHeaderKey = (event: React.KeyboardEvent, id: string) => {
    if (!event.altKey || !canMove(id)) return;
    const step =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    const visible = table
      .getVisibleLeafColumns()
      .map((column) => column.id)
      .filter((entry) => !pinnedIds.has(entry));
    const neighbour = visible[visible.indexOf(id) + step];
    if (neighbour) handleMove(id, neighbour, step < 0 ? "before" : "after");
  };

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
                      const columnId = header.column.id;
                      const width = widthOf(columnId, meta?.width);
                      const movable = canMove(columnId);
                      return (
                        <th
                          key={header.id}
                          style={{
                            width,
                            left: meta?.pinned ? pinnedOffset : undefined,
                          }}
                          data-movable-column={movable ? columnId : undefined}
                          onPointerDown={(event) =>
                            handleDragStart(event, columnId)
                          }
                          onClickCapture={(event) => {
                            if (!suppressClickRef.current) return;
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onKeyDown={(event) =>
                            handleHeaderKey(event, columnId)
                          }
                          aria-sort={
                            sort
                              ? sort.direction === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                          className={cn(
                            "relative h-9 border-r border-b bg-card text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground",
                            // A sortable header is one button, edge to edge.
                            sortField && onSortsChange ? "p-0" : "px-3",
                            meta?.pinned && "sticky z-30",
                            meta?.align === "right" && "text-right",
                            movable && "cursor-grab active:cursor-grabbing",
                            dragging === columnId && "opacity-50",
                          )}
                        >
                          {dropTarget?.id === columnId ? (
                            <span
                              aria-hidden="true"
                              className={cn(
                                "pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-interactive",
                                dropTarget.side === "before"
                                  ? "-left-px"
                                  : "-right-px",
                              )}
                            />
                          ) : null}
                          {sortField && onSortsChange ? (
                            <button
                              type="button"
                              onClick={(event) =>
                                handleSort(sortField, event.shiftKey)
                              }
                              title={
                                movable
                                  ? "Click to sort; Shift-click to add to the order. Drag to move (or Alt + arrow keys)."
                                  : "Click to sort; Shift-click to add to the order"
                              }
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
                          {columnLayout ? (
                            // biome-ignore lint/a11y/useSemanticElements: a column's edge is a separator you can move, as in WAI-ARIA's window splitter
                            <div
                              role="separator"
                              aria-orientation="vertical"
                              aria-label={`Resize ${typeof label === "string" ? label : "column"}`}
                              aria-valuenow={width}
                              aria-valuemin={MIN_COLUMN_WIDTH}
                              aria-valuemax={MAX_COLUMN_WIDTH}
                              tabIndex={0}
                              title="Drag to resize; double-click for the default width"
                              onPointerDown={(event) =>
                                handleResizeStart(event, columnId, width)
                              }
                              onDoubleClick={() =>
                                columnLayout.setColumnWidth(columnId, undefined)
                              }
                              onKeyDown={(event) =>
                                handleResizeKey(event, columnId, width)
                              }
                              onClick={(event) => event.stopPropagation()}
                              className={cn(
                                "absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none select-none",
                                "after:absolute after:inset-y-1.5 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:transition-colors",
                                "hover:after:bg-interactive focus-visible:outline-hidden focus-visible:after:bg-interactive",
                                resizing?.id === columnId &&
                                  "after:bg-interactive",
                              )}
                            />
                          ) : null}
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
      // The bar's own ink at rest (it flips with the theme: near-white text
      // vanished on the light bar of the dark theme), red only on hover.
      tone === "destructive" &&
        "hover:bg-destructive hover:text-destructive-foreground",
      className,
    )}
    {...props}
  />
));
BulkActionButton.displayName = "BulkActionButton";
