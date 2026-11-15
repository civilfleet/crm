"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  LayoutGrid,
  ListFilter,
  Loader2,
  type LucideIcon,
  Map as MapIcon,
  SearchX,
  Table2,
  X,
} from "lucide-react";
import type * as React from "react";
import { useId } from "react";
import { EmptyState } from "@/components/design/empty-state";
import { SearchField } from "@/components/design/search-field";
import { Switcher } from "@/components/design/switcher";
import {
  ColumnsMenu,
  FilterChip,
  RecordsFilterBar,
  RecordsToolbar,
} from "@/components/records/records-toolbar";
import {
  filterKind,
  type OptionFilter,
  type OptionFilterDefinition,
  type RecordFilter,
  type RecordList,
  type RecordListView,
} from "@/components/records/use-record-list";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RecordSort } from "@/lib/list-request";

/** One kind of filter as the toolbar shows it: in the Filter menu and as a chip. */
export type FilterDefinition<F extends RecordFilter> = {
  /** The kind (a filter's `kind`, or its key when it has none). */
  key: string;
  label: string;
  /** Nothing to choose from yet. */
  disabled?: boolean;
  /** "Status is Submitted or Accepted" */
  summary: (filter: F) => string;
  /** The controls inside the chip. */
  editor: (filter: F, onChange: (next: F) => void) => React.ReactNode;
};

type FilterMenuProps = {
  options: Array<{ key: string; label: string; disabled?: boolean }>;
  activeCount: number;
  onAdd: (key: string) => void;
  /** "Filter events by" */
  label?: string;
};

/** "Filter" in the toolbar: pick an attribute, then its value in the new chip. */
export const FilterMenu = ({
  options,
  activeCount,
  onAdd,
  label = "Filter by",
}: FilterMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5">
        <ListFilter /> Filter
        {activeCount > 0 ? (
          <span className="rounded-full bg-interactive px-1.5 text-[11px] font-semibold tabular-nums text-interactive-foreground">
            {activeCount}
          </span>
        ) : null}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="start"
      className="min-w-48"
      // Focus belongs to the new filter's editor, not back on "Filter".
      onCloseAutoFocus={(event) => event.preventDefault()}
    >
      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
        {label}
      </DropdownMenuLabel>
      {options.map((option) => (
        <DropdownMenuItem
          key={option.key}
          disabled={option.disabled}
          onSelect={() => onAdd(option.key)}
        >
          {option.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

type SortChipProps = {
  sort: RecordSort<string> | null;
  label?: string;
  onClear: () => void;
};

/** "↑ Sorted by Name ×", while a sort is set. */
export const SortChip = ({ sort, label, onClear }: SortChipProps) => {
  if (!sort) return null;
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-md border bg-card pr-0.5 pl-2 text-xs">
      {sort.direction === "asc" ? (
        <ArrowUp aria-hidden="true" className="size-3.5" />
      ) : (
        <ArrowDown aria-hidden="true" className="size-3.5" />
      )}
      Sorted by {label ?? sort.field}
      <button
        type="button"
        aria-label="Clear sort"
        onClick={onClear}
        className="flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
};

const summarizeOptions = (
  definition: OptionFilterDefinition,
  values: string[],
) => {
  if (values.length === 0) return `${definition.label} is…`;
  const names = values.map(
    (value) =>
      definition.options.find((option) => option.value === value)?.label ??
      value,
  );
  return names.length > 2
    ? `${definition.label} is ${names[0]} +${names.length - 1}`
    : `${definition.label} is ${names.join(" or ")}`;
};

type OptionFilterEditorProps = {
  definition: OptionFilterDefinition;
  values: string[];
  onChange: (values: string[]) => void;
};

/** A checkbox per option; the chosen ones stay in the options' order. */
const OptionFilterEditor = ({
  definition,
  values,
  onChange,
}: OptionFilterEditorProps) => {
  const id = useId();
  const order = definition.options.map((option) => option.value);
  const rank = (value: string) => {
    const index = order.indexOf(value);
    return index === -1 ? order.length : index;
  };

  const handleToggle = (value: string, checked: boolean) => {
    const rest = values.filter((item) => item !== value);
    onChange(
      (checked ? [...rest, value] : rest).sort((a, b) => rank(a) - rank(b)),
    );
  };

  return (
    <fieldset className="flex max-h-72 min-w-52 flex-col gap-0.5 overflow-y-auto">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">
        {definition.label} is any of
      </legend>
      {definition.options.map((option, index) => {
        const optionId = `${id}-${index}`;
        return (
          <label
            key={option.value}
            htmlFor={optionId}
            className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent"
          >
            <Checkbox
              id={optionId}
              checked={values.includes(option.value)}
              onCheckedChange={(checked) =>
                handleToggle(option.value, checked === true)
              }
            />
            <span className="truncate">{option.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
};

/** A filter that picks any of a few values: status, type, role. */
export const optionFilter = (
  definition: OptionFilterDefinition,
): FilterDefinition<OptionFilter> => ({
  key: definition.key,
  label: definition.label,
  disabled: definition.options.length === 0,
  summary: (filter) => summarizeOptions(definition, filter.values),
  editor: (filter, onChange) => (
    <OptionFilterEditor
      definition={definition}
      values={filter.values}
      onChange={(values) => onChange({ key: filter.key, values })}
    />
  ),
});

const VIEW_OPTIONS: Record<
  RecordListView,
  { label: string; icon: LucideIcon }
> = {
  table: { label: "Table", icon: Table2 },
  cards: { label: "Cards", icon: LayoutGrid },
  map: { label: "Map", icon: MapIcon },
  calendar: { label: "Calendar", icon: CalendarDays },
};

type RecordListToolbarProps<
  TData,
  F extends RecordFilter,
  V extends RecordListView,
> = {
  list: RecordList<F, V>;
  columns: ColumnDef<TData, unknown>[];
  searchLabel: string;
  isRefreshing?: boolean;
  filters?: FilterDefinition<F>[];
  /** Heads the Filter menu: "Filter events by". */
  filterMenuLabel?: string;
  /** Before the Filter menu: e.g. which records ("All" or "Trash"). */
  start?: React.ReactNode;
};

/**
 * Filter and sort on the left; search, columns and the view switch on the
 * right; then the filter chips, when there are any.
 */
export const RecordListToolbar = <
  TData,
  F extends RecordFilter,
  V extends RecordListView,
>({
  list,
  columns,
  searchLabel,
  isRefreshing = false,
  filters = [],
  filterMenuLabel,
  start,
}: RecordListToolbarProps<TData, F, V>) => {
  const sortLabel = list.sort
    ? columns.find((column) => column.meta?.sortField === list.sort?.field)
        ?.meta?.label
    : undefined;

  return (
    <>
      <RecordsToolbar
        start={
          <>
            {start}
            {filters.length > 0 ? (
              <FilterMenu
                label={filterMenuLabel}
                options={filters.map((definition) => ({
                  key: definition.key,
                  label: definition.label,
                  disabled:
                    definition.disabled ||
                    list.isFilterKindTaken(definition.key),
                }))}
                activeCount={list.activeFilters.length}
                onAdd={list.handleAddFilter}
              />
            ) : null}
            {list.view === "calendar" ? null : (
              <SortChip
                sort={list.sort}
                label={sortLabel}
                onClear={() => list.setSort(null)}
              />
            )}
          </>
        }
        end={
          <>
            {isRefreshing ? (
              <Loader2
                aria-label="Refreshing"
                className="size-4 animate-spin text-muted-foreground"
              />
            ) : null}
            <SearchField
              label={searchLabel}
              value={list.searchInput}
              onValueChange={list.setSearchInput}
              className="sm:w-60"
            />
            {list.view === "table" ? (
              <ColumnsMenu
                columns={columns.map((column) => ({
                  id: column.id ?? "",
                  label: column.meta?.label ?? column.id ?? "",
                  alwaysVisible: column.meta?.alwaysVisible,
                }))}
                visibility={list.columnVisibility.visibility}
                onVisibilityChange={list.columnVisibility.setColumnVisible}
                onReset={list.columnVisibility.reset}
              />
            ) : null}
            {list.views.length > 1 ? (
              <Switcher
                label="View"
                size="sm"
                value={list.view}
                onValueChange={list.handleViewChange}
                options={list.views.map((view) => ({
                  value: view,
                  ...VIEW_OPTIONS[view],
                  iconOnly: true,
                }))}
              />
            ) : null}
          </>
        }
      />

      {list.filters.length > 0 ? (
        <RecordsFilterBar onClear={list.handleClearFilters}>
          {list.filters.map((filter) => {
            const definition = filters.find(
              (entry) => entry.key === filterKind(filter),
            );
            if (!definition) return null;
            return (
              <FilterChip
                key={filter.key}
                summary={definition.summary(filter)}
                incomplete={!list.isFilterActive(filter)}
                defaultOpen={filter.key === list.openFilterKey}
                onRemove={() => list.handleRemoveFilter(filter.key)}
              >
                {definition.editor(filter, list.handleFilterChange)}
              </FilterChip>
            );
          })}
        </RecordsFilterBar>
      ) : null}
    </>
  );
};

/** Shown when a search or filter leaves nothing, with the way back. */
export const NoMatchState = ({
  noun,
  onClear,
}: {
  noun: string;
  onClear: () => void;
}) => (
  <EmptyState
    icon={SearchX}
    title={`No ${noun} match`}
    description="Try a different search, or clear the filters."
    action={
      <Button type="button" variant="outline" size="sm" onClick={onClear}>
        Clear search and filters
      </Button>
    }
  />
);
