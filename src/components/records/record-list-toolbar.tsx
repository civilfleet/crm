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
import { useId, useState } from "react";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MAX_SORTS, type RecordSort } from "@/lib/list-request";

/** One kind of filter as the toolbar shows it: in the Filter menu and as a chip. */
export type FilterDefinition<F extends RecordFilter> = {
  /** The kind (a filter's `kind`, or its key when it has none). */
  key: string;
  label: string;
  /** The heading it is listed under in the Filter menu: "Place". */
  group?: string;
  /** Other words it is found by in the menu's search. */
  keywords?: string[];
  /** Nothing to choose from yet. */
  disabled?: boolean;
  /** "Status is Submitted or Accepted" */
  summary: (filter: F) => string;
  /** The controls inside the chip. */
  editor: (filter: F, onChange: (next: F) => void) => React.ReactNode;
};

type FilterMenuOption = {
  key: string;
  label: string;
  group?: string;
  keywords?: string[];
  disabled?: boolean;
};

type FilterMenuProps = {
  options: FilterMenuOption[];
  activeCount: number;
  onAdd: (key: string) => void;
  /** "Filter events by" */
  label?: string;
};

/** Above this many entries the menu can be searched. */
const SEARCHABLE_FROM = 8;

/** The options by heading, in the order the headings first appear. */
const groupOptions = (options: FilterMenuOption[]) => {
  const groups = new Map<string, FilterMenuOption[]>();
  for (const option of options) {
    const heading = option.group ?? "";
    groups.set(heading, [...(groups.get(heading) ?? []), option]);
  }
  return [...groups];
};

/**
 * "Filter" in the toolbar: pick an attribute, then its value in the new
 * chip. Long menus are grouped under headings and can be searched.
 */
export const FilterMenu = ({
  options,
  activeCount,
  onAdd,
  label = "Filter by",
}: FilterMenuProps) => {
  const [open, setOpen] = useState(false);
  const searchable = options.length >= SEARCHABLE_FROM;
  const handleSelect = (key: string) => {
    setOpen(false);
    onAdd(key);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5">
          <ListFilter /> Filter
          {activeCount > 0 ? (
            <span className="rounded-full bg-interactive px-1.5 text-[11px] font-semibold tabular-nums text-interactive-foreground">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-0"
        // Focus belongs to the new filter's editor, not back on "Filter".
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <Command label={label}>
          {searchable ? (
            <CommandInput placeholder="Search filters…" />
          ) : (
            <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
              {label}
            </p>
          )}
          <CommandList className="max-h-[min(24rem,60vh)]">
            <CommandEmpty>No filter found.</CommandEmpty>
            {groupOptions(options).map(([heading, entries]) => (
              <CommandGroup key={heading || "_"} heading={heading || undefined}>
                {entries.map((option) => (
                  <CommandItem
                    key={option.key}
                    value={option.key}
                    keywords={[
                      option.label,
                      ...(option.group ? [option.group] : []),
                      ...(option.keywords ?? []),
                    ]}
                    disabled={option.disabled}
                    onSelect={() => handleSelect(option.key)}
                  >
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

type SortChipProps = {
  sorts: RecordSort<string>[];
  /** A column's label for a sort field. */
  getLabel: (field: string) => string;
  onClear: () => void;
};

const SortArrow = ({
  direction,
}: {
  direction: RecordSort<string>["direction"];
}) =>
  direction === "asc" ? (
    <ArrowUp aria-label="ascending" className="size-3.5 shrink-0" />
  ) : (
    <ArrowDown aria-label="descending" className="size-3.5 shrink-0" />
  );

/**
 * "Sorted by ↑ Name, then ↓ City ×", while a sort is set, and a hint that
 * Shift-click adds another column while there is room for one.
 */
export const SortChip = ({ sorts, getLabel, onClear }: SortChipProps) => {
  if (sorts.length === 0) return null;
  return (
    <>
      <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border bg-card pr-0.5 pl-2 text-xs">
        <span className="shrink-0">Sorted by</span>
        {sorts.map((sort, index) => (
          <span
            key={sort.field}
            className="inline-flex min-w-0 items-center gap-0.5"
          >
            {index > 0 ? <span className="pr-0.5">, then</span> : null}
            <SortArrow direction={sort.direction} />
            <span className="truncate">{getLabel(sort.field)}</span>
          </span>
        ))}
        <button
          type="button"
          aria-label={sorts.length > 1 ? "Clear sorting" : "Clear sort"}
          onClick={onClear}
          className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
        >
          <X className="size-3.5" />
        </button>
      </span>
      {sorts.length < MAX_SORTS ? (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Shift-click a column to sort by it too
        </span>
      ) : null}
    </>
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
  /** After the chips, while a filter applies: "Save as smart list". */
  filterActions?: React.ReactNode;
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
  filterActions,
}: RecordListToolbarProps<TData, F, V>) => {
  const getSortLabel = (field: string) =>
    columns.find((column) => column.meta?.sortField === field)?.meta?.label ??
    field;

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
                  group: definition.group,
                  keywords: definition.keywords,
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
                sorts={list.sorts}
                getLabel={getSortLabel}
                onClear={() => list.setSorts([])}
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
          {list.activeFilters.length > 0 ? filterActions : null}
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
