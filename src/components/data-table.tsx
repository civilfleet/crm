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
import { LayoutGrid, List, Map as MapIcon } from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const canPaginate = pageCount > 1;
  const currentPageRows = isServerPagination
    ? tableData.length
    : table.getRowModel().rows.length;
  const currentFrom = paginationState.pageIndex * paginationState.pageSize + 1;
  const currentTo = currentFrom + currentPageRows - 1;
  const totalItems = isServerPagination
    ? (serverPagination?.total ?? 0)
    : tableData.length;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="flex-1 min-w-0">{toolbar}</div>
        {isMobile && showMapToggle && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={effectiveView === "card" ? "default" : "outline"}
              onClick={() => setMobileView("card")}
            >
              <LayoutGrid className="mr-2" /> Cards
            </Button>
            <Button
              type="button"
              size="sm"
              variant={effectiveView === "map" ? "default" : "outline"}
              onClick={() => setMobileView("map")}
            >
              <MapIcon className="mr-2" /> Map
            </Button>
          </div>
        )}
        {!isMobile && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={effectiveView === "table" ? "default" : "outline"}
              onClick={() => {
                setView("table");
                setDesktopView("table");
              }}
            >
              <List className="mr-2" /> Table
            </Button>
            <Button
              type="button"
              size="sm"
              variant={effectiveView === "card" ? "default" : "outline"}
              onClick={() => {
                setView("card");
                setDesktopView("card");
              }}
            >
              <LayoutGrid className="mr-2" /> Cards
            </Button>
            {showMapToggle && (
              <Button
                type="button"
                size="sm"
                variant={effectiveView === "map" ? "default" : "outline"}
                onClick={() => {
                  setView("map");
                  setDesktopView("map");
                }}
              >
                <MapIcon className="mr-2" /> Map
              </Button>
            )}
          </div>
        )}
      </div>
      {hasBatchActions && (
        <div
          className={cn(
            "px-3 transition-opacity",
            isMobile ? "min-h-0 pb-0" : "min-h-11 pb-2",
            showDesktopBatchActions ? "opacity-100" : "opacity-0",
          )}
          aria-hidden={!showDesktopBatchActions}
        >
          {showDesktopBatchActions ? (
            <div className="flex items-center justify-between gap-3">
              {renderBatchActions?.({ selectedRows, clearSelection })}
            </div>
          ) : null}
        </div>
      )}

      {effectiveView === "table" ? (
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {hasRows ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
            "grid grid-cols-1 gap-4 px-3 pb-3 pt-0 sm:grid-cols-2 sm:pt-3 lg:grid-cols-3",
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
        <div className="p-6 text-center text-sm text-muted-foreground">
          No results.
        </div>
      )}
      {effectiveView !== "map" && totalItems > 0 ? (
        <div className="flex flex-col gap-2 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {currentPageRows === 0 ? 0 : currentFrom}-{currentTo} of{" "}
            {totalItems}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows</span>
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
                <SelectTrigger className="h-8 w-[84px]">
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
            <div className="text-sm text-muted-foreground">
              Page {paginationState.pageIndex + 1} of {Math.max(pageCount, 1)}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
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
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
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
              Next
            </Button>
          </div>
        </div>
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