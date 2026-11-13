"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Map as MapIcon,
} from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  renderCard?: (item: TData) => React.ReactNode;
  renderMap?: (items: TData[]) => React.ReactNode;
  initialView?: "table" | "card" | "map";
  toolbar?: React.ReactNode;
  selectable?: boolean;
  onSelectionChange?: (selectedRows: TData[]) => void;
  renderBatchActions?: (params: {
    selectedRows: TData[];
    clearSelection: () => void;
  }) => React.ReactNode;
  serverPagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  };
}

const CARD_FIELD_LABELS: Record<string, string> = {
  loginMethod: "Login method",
  createdAt: "Created",
  updatedAt: "Updated",
};

function formatCardFieldLabel(columnId: string) {
  const known = CARD_FIELD_LABELS[columnId];
  if (known) {
    return known;
  }

  const normalized = columnId
    .replace(/^_+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim();

  if (!normalized) {
    return columnId;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function DataTable<TData, TValue>({
  columns,
  data,
  renderCard,
  renderMap,
  initialView = "table",
  toolbar,
  selectable = false,
  onSelectionChange,
  renderBatchActions,
  serverPagination,
}: DataTableProps<TData, TValue>) {
  const isMobile = useIsMobile();
  const resolvedInitialView =
    !renderMap && initialView === "map" ? "table" : initialView;
  const [view, setView] = React.useState<"table" | "card" | "map">(
    isMobile ? "card" : resolvedInitialView,
  );
  const [mobileView, setMobileView] = React.useState<"card" | "map">("card");
  const [desktopView, setDesktopView] = React.useState<
    "table" | "card" | "map"
  >(resolvedInitialView);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const pageInputId = React.useId();
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const tableData = React.useMemo(
    () => (Array.isArray(data) ? data : []),
    [data],
  );
  const previousDataRef = React.useRef(tableData);
  const isServerPagination = Boolean(serverPagination);
  const paginationState = isServerPagination
    ? {
        pageIndex: Math.max((serverPagination?.page ?? 1) - 1, 0),
        pageSize: serverPagination?.pageSize ?? 10,
      }
    : pagination;
  const controlledPageCount = isServerPagination
    ? Math.max(
        1,
        Math.ceil(
          (serverPagination?.total ?? 0) /
            Math.max(serverPagination?.pageSize ?? 1, 1),
        ),
      )
    : undefined;

  const selectionColumn = React.useMemo<ColumnDef<TData, TValue>[]>(
    () =>
      selectable
        ? [
            {
              id: "__select",
              size: 40,
              enableSorting: false,
              enableHiding: false,
              header: ({ table }) => (
                <Checkbox
                  aria-label="Select all"
                  checked={
                    table.getIsAllPageRowsSelected() ||
                    (table.getIsSomePageRowsSelected() && "indeterminate")
                  }
                  onCheckedChange={(value) =>
                    table.toggleAllPageRowsSelected(Boolean(value))
                  }
                  className="translate-y-0.5"
                />
              ),
              cell: ({ row }) => (
                <Checkbox
                  aria-label="Select row"
                  checked={row.getIsSelected()}
                  disabled={!row.getCanSelect()}
                  onCheckedChange={(value) =>
                    row.toggleSelected(Boolean(value))
                  }
                  className="translate-y-0.5"
                />
              ),
            } satisfies ColumnDef<TData>,
          ].map((column) => column as ColumnDef<TData, TValue>)
        : [],
    [selectable],
  );

  const enhancedColumns = React.useMemo(
    () => [...selectionColumn, ...columns],
    [selectionColumn, columns],
  );

  const table = useReactTable({
    data: tableData,
    columns: enhancedColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: isServerPagination,
    pageCount: controlledPageCount,
    enableRowSelection: selectable,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onPaginationChange: isServerPagination ? undefined : setPagination,
    state: {
      rowSelection,
      sorting,
      pagination: paginationState,
    },
  });

  const hasRows = table.getRowModel().rows?.length > 0;
  const selectedRows = table
    .getSelectedRowModel()
    .rows.map((row) => row.original as TData);

  const clearSelection = React.useCallback(() => {
    setRowSelection({});
  }, []);

  React.useEffect(() => {
    if (selectable && onSelectionChange) {
      onSelectionChange(selectedRows);
    }
  }, [selectable, selectedRows, onSelectionChange]);

  React.useEffect(() => {
    if (!renderMap && mobileView === "map") {
      setMobileView("card");
    }
    if (!isMobile) {
      setView(desktopView);
    }
  }, [isMobile, desktopView, mobileView, renderMap]);

  React.useEffect(() => {
    if (isServerPagination) {
      return;
    }
    if (previousDataRef.current === tableData) {
      return;
    }
    previousDataRef.current = tableData;
    setPagination((previous) => {
      if (previous.pageIndex === 0) {
        return previous;
      }
      return { ...previous, pageIndex: 0 };
    });
  }, [isServerPagination, tableData]);

  React.useEffect(() => {
    if (isServerPagination) {
      return;
    }
    setPagination((previous) => {
      const pageCount = table.getPageCount();
      if (pageCount === 0 || previous.pageIndex < pageCount) {
        return previous;
      }
      return { ...previous, pageIndex: pageCount - 1 };
    });
  }, [table, isServerPagination]);

  const effectiveView = isMobile ? mobileView : view;
  const showMapToggle = Boolean(renderMap);
  const hasBatchActions = selectable && Boolean(renderBatchActions);
  const showBatchActions = hasBatchActions && selectedRows.length > 0;
  const showDesktopBatchActions = showBatchActions && !isMobile;
  const showMobileBatchActions = showBatchActions && isMobile;
  const pageCount = isServerPagination
    ? (controlledPageCount ?? 1)
    : table.getPageCount();
  const currentPage = paginationState.pageIndex + 1;
  const [pageInput, setPageInput] = React.useState(String(currentPage));
  const canPaginate = pageCount > 1;
  const currentPageRows = isServerPagination
    ? tableData.length
    : table.getRowModel().rows.length;
  const currentFrom = paginationState.pageIndex * paginationState.pageSize + 1;
  const currentTo = currentFrom + currentPageRows - 1;
  const totalItems = isServerPagination
    ? (serverPagination?.total ?? 0)
    : tableData.length;

  React.useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const goToPage = React.useCallback(
    (requestedPage: number) => {
      const nextPage = Math.min(
        Math.max(Math.trunc(requestedPage), 1),
        pageCount,
      );

      if (isServerPagination && serverPagination) {
        serverPagination.onPageChange(nextPage);
      } else {
        table.setPageIndex(nextPage - 1);
      }
      setPageInput(String(nextPage));
    },
    [isServerPagination, pageCount, serverPagination, table],
  );

  const submitPageInput = () => {
    const requestedPage = Number(pageInput);
    if (!Number.isFinite(requestedPage)) {
      setPageInput(String(currentPage));
      return;
    }
    goToPage(requestedPage);
  };

  const renderViewButton = (
    target: "table" | "card" | "map",
    label: string,
    Icon: typeof List,
    onSelect: () => void,
  ) => {
    const isActive = effectiveView === target;
    return (
      <button
        type="button"
        aria-pressed={isActive}
        onClick={onSelect}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
          isActive
            ? "bg-card text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </button>
    );
  };

  const firstOnPage = currentPageRows === 0 ? 0 : currentFrom;

  return (
    <div className="flex w-full min-w-0 flex-col">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">{toolbar}</div>
        {isMobile && showMapToggle && (
          <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/50 p-0.5">
            {renderViewButton("card", "Cards", LayoutGrid, () =>
              setMobileView("card"),
            )}
            {renderViewButton("map", "Map", MapIcon, () =>
              setMobileView("map"),
            )}
          </div>
        )}
        {!isMobile && (
          <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/50 p-0.5">
            {renderViewButton("table", "Table", List, () => {
              setView("table");
              setDesktopView("table");
            })}
            {renderViewButton("card", "Cards", LayoutGrid, () => {
              setView("card");
              setDesktopView("card");
            })}
            {showMapToggle
              ? renderViewButton("map", "Map", MapIcon, () => {
                  setView("map");
                  setDesktopView("map");
                })
              : null}
          </div>
        )}
      </div>
      {showDesktopBatchActions ? (
        <div className="flex min-h-11 items-center justify-between gap-3 border-b bg-accent/60 px-3 py-1.5">
          {renderBatchActions?.({ selectedRows, clearSelection })}
        </div>
      ) : null}

      {effectiveView === "table" ? (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={cn(
                        "h-9 border-r border-b bg-muted/40 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground last:border-r-0",
                        header.column.id === "__select" && "w-10",
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {hasRows ? (
                table.getRowModel().rows.map((row) => {
                  const isSelected = row.getIsSelected();
                  return (
                    <tr
                      key={row.id}
                      data-state={isSelected ? "selected" : undefined}
                      className="group"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={cn(
                            "h-10 border-r border-b px-3 py-1.5 align-middle transition-colors last:border-r-0",
                            isSelected
                              ? "bg-accent"
                              : "bg-card group-hover:bg-muted/50",
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={table.getVisibleLeafColumns().length}
                    className="h-32 border-b text-center text-sm text-muted-foreground"
                  >
                    No results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : effectiveView === "map" ? (
        <div className="p-3">
          {renderMap ? (
            renderMap(tableData)
          ) : (
            <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
              Map view is unavailable.
            </div>
          )}
        </div>
      ) : hasRows ? (
        <div
          className={cn(
            "grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3",
            showMobileBatchActions ? "pb-24" : "",
          )}
        >
          {table.getRowModel().rows.map((row) => {
            const selectionCell = row
              .getVisibleCells()
              .find((cell) => cell.column.id === "__select");
            const contentCells = row
              .getVisibleCells()
              .filter((cell) => cell.column.id !== "__select");

            return (
              <div key={row.id}>
                {renderCard ? (
                  renderCard(row.original as TData)
                ) : (
                  <Card>
                    {selectable && selectionCell ? (
                      <CardHeader className="flex flex-row items-center justify-end space-y-0 pb-3">
                        <div>
                          {flexRender(
                            selectionCell.column.columnDef.cell,
                            selectionCell.getContext(),
                          )}
                        </div>
                      </CardHeader>
                    ) : null}
                    <CardContent className="space-y-2">
                      {contentCells.map((cell) => (
                        <div key={cell.id} className="text-sm">
                          <div className="text-xs text-muted-foreground">
                            {formatCardFieldLabel(cell.column.id)}
                          </div>
                          <div className="font-medium">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-10 text-center text-sm text-muted-foreground">
          No results.
        </div>
      )}
      {effectiveView !== "map" && totalItems > 0 ? (
        <footer className="flex flex-wrap items-center justify-between gap-3 bg-card px-4 py-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {firstOnPage}–{currentTo} of {totalItems.toLocaleString()}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span>Rows</span>
              <Select
                value={String(paginationState.pageSize)}
                onValueChange={(value) => {
                  const nextSize = Number(value);
                  if (isServerPagination && serverPagination) {
                    serverPagination.onPageSizeChange(nextSize);
                    return;
                  }
                  table.setPageSize(nextSize);
                }}
              >
                <SelectTrigger
                  aria-label="Rows per page"
                  className="h-7 w-[4.5rem] text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <form
              className="flex items-center gap-1.5 tabular-nums"
              onSubmit={(event) => {
                event.preventDefault();
                submitPageInput();
              }}
            >
              <label htmlFor={pageInputId} className="sr-only">
                Page
              </label>
              <Input
                id={pageInputId}
                type="number"
                inputMode="numeric"
                min={1}
                max={Math.max(pageCount, 1)}
                step={1}
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value)}
                onBlur={submitPageInput}
                className="h-7 w-12 px-1 text-center text-xs"
                aria-label="Go to page"
              />
              <span>/ {Math.max(pageCount, 1)}</span>
            </form>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7"
                aria-label="Previous page"
                onClick={() => {
                  if (isServerPagination && serverPagination) {
                    if (serverPagination.page > 1) {
                      serverPagination.onPageChange(serverPagination.page - 1);
                    }
                    return;
                  }
                  table.previousPage();
                }}
                disabled={
                  isServerPagination
                    ? (serverPagination?.page ?? 1) <= 1 || !canPaginate
                    : !table.getCanPreviousPage() || !canPaginate
                }
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7"
                aria-label="Next page"
                onClick={() => {
                  if (isServerPagination && serverPagination) {
                    if ((serverPagination.page ?? 1) < pageCount) {
                      serverPagination.onPageChange(serverPagination.page + 1);
                    }
                    return;
                  }
                  table.nextPage();
                }}
                disabled={
                  isServerPagination
                    ? (serverPagination?.page ?? 1) >= pageCount || !canPaginate
                    : !table.getCanNextPage() || !canPaginate
                }
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </footer>
      ) : null}
      {showMobileBatchActions ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto w-full max-w-screen-sm">
            <div className="flex items-center justify-between gap-3">
              {renderBatchActions?.({ selectedRows, clearSelection })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
