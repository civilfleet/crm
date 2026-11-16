"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";
import { useColumnVisibility } from "@/components/records/records-toolbar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSavedView } from "@/hooks/use-saved-view";
import {
  formatRecordSorts,
  MAX_SORTS,
  type RecordSort,
} from "@/lib/list-request";
import { persistTablePageSize } from "@/lib/table-page-size";
import type { ViewPreferenceSettings } from "@/validations/view-preferences";

/*
  The state every records list shares: search as you type, filters, server
  sort and paging, columns, Table/Cards/…, and the saved view that brings
  them back. The toolbar for it is in record-list-toolbar.tsx.
*/

export type RecordListView = "table" | "cards" | "map" | "calendar";

/**
 * A filter in the bar. `key` tells it from the others; `kind` is its entry
 * in the Filter menu (the key, when a kind is added once).
 */
export type RecordFilter = { key: string; kind?: string };

/** The menu entry a filter belongs to. */
export const filterKind = (filter: RecordFilter) => filter.kind ?? filter.key;

/** How a list's filters are made, applied and read back from a saved view. */
export type FilterModel<F extends RecordFilter> = {
  /** A new filter of this kind, still without a value. */
  create: (kind: string) => F;
  /** Only a filter with a value narrows the list. */
  isActive: (filter: F) => boolean;
  /** A filter from a saved view, or null when it no longer fits. */
  read: (saved: unknown) => F | null;
  /** How a filter is kept in the saved view (as it is, by default). */
  write?: (filter: F) => unknown;
  /** Kinds that can be added several times (several cities); else once. */
  multiple?: (kind: string) => boolean;
};

/** "Type is Report, Statement": one attribute, any of a few values. */
export type OptionFilter = { key: string; values: string[] };

export type OptionFilterDefinition = {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
};

/**
 * Option filters for a list. Pass a definition when the options are fixed
 * (a saved value must still be one of them), or just the key when they load
 * from the server.
 */
export const optionFilters = (
  kinds: ReadonlyArray<string | OptionFilterDefinition>,
): FilterModel<OptionFilter> => ({
  create: (key) => ({ key, values: [] }),
  isActive: (filter) => filter.values.length > 0,
  read: (saved) => {
    if (!saved || typeof saved !== "object") return null;
    const { key, values } = saved as Record<string, unknown>;
    const kind = kinds.find((item) =>
      typeof item === "string" ? item === key : item.key === key,
    );
    if (!kind || !Array.isArray(values)) return null;
    const known = values.filter(
      (value): value is string =>
        typeof value === "string" &&
        (typeof kind === "string" ||
          kind.options.some((option) => option.value === value)),
    );
    return known.length > 0 ? { key: key as string, values: known } : null;
  },
});

const NO_FILTERS: FilterModel<RecordFilter> = {
  create: (key) => ({ key }),
  isActive: () => false,
  read: () => null,
};

/** The server sort fields a list's columns offer. */
export const getSortFields = <TData>(columns: ColumnDef<TData, unknown>[]) =>
  columns.flatMap((column) => column.meta?.sortField ?? []);

export const recordListFetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
};

type UseRecordListOptions<F extends RecordFilter, V extends RecordListView> = {
  /**
   * Saved-view key, e.g. "transactions:team:<teamId>"
   * (validations/view-preferences); null for a list that keeps no view
   * (one embedded in a record page).
   */
  viewKey: string | null;
  columnDefaults: Record<string, boolean>;
  initialPageSize: number;
  /** A saved sort on any other field is dropped. */
  sortFields?: readonly string[];
  /** The views the list switches between; phones open on Cards. */
  views?: readonly V[];
  filters?: FilterModel<F>;
  /** The saved view as read on the server (null: none), to start from. */
  initialSaved?: ViewPreferenceSettings | null;
};

export const useRecordList = <
  F extends RecordFilter = OptionFilter,
  V extends RecordListView = "table",
>({
  viewKey,
  columnDefaults,
  initialPageSize,
  sortFields,
  views,
  filters: filterModel,
  initialSaved,
}: UseRecordListOptions<F, V>) => {
  const isMobile = useIsMobile();
  const savedView = useSavedView(viewKey, initialSaved);
  const columnVisibility = useColumnVisibility(columnDefaults);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  // Most important first; empty is the list's default order.
  const [sorts, setSorts] = useState<RecordSort<string>[]>([]);
  const [filters, setFilters] = useState<F[]>([]);
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const [view, setView] = useState<V | "table">("table");
  // Only a view the user picked is remembered, not the phone's default.
  const [chosenView, setChosenView] = useState<V | "table" | undefined>();
  const [isViewRestored, setIsViewRestored] = useState(false);
  // Fixed per list; a ref keeps fresh literals from re-running effects.
  const settingsRef = useRef({
    views: views ?? [],
    sortFields,
    model: filterModel ?? (NO_FILTERS as unknown as FilterModel<F>),
  });
  const model = settingsRef.current.model;
  const allowsSeveral = (kind: string) => model.multiple?.(kind) ?? false;
  const nextFilterNumber = useRef(0);
  const hasCards = settingsRef.current.views.includes("cards" as V);

  // A phone opens on cards, unless the user picked a view (or it was
  // restored first: the screen's width is only known after it).
  useEffect(() => {
    if (hasCards && isMobile && !chosenView) {
      setView((current) => (current === "table" ? ("cards" as V) : current));
    }
  }, [hasCards, isMobile, chosenView]);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(searchInput.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  // Open the list the way this user left it.
  useEffect(() => {
    if (!savedView.isLoaded || isViewRestored) return;
    const saved = savedView.saved;
    const settings = settingsRef.current;
    if (saved) {
      if (saved.columns) columnVisibility.restore(saved.columns);
      // Several orders, or the single one older saved views hold; any on a
      // field this list no longer sorts by are dropped.
      const savedSorts = saved.sorts ?? (saved.sort ? [saved.sort] : []);
      setSorts(
        savedSorts
          .filter(
            (sort) =>
              !settings.sortFields || settings.sortFields.includes(sort.field),
          )
          .slice(0, MAX_SORTS),
      );
      const savedViewName = saved.view;
      if (
        savedViewName &&
        (settings.views as readonly string[]).includes(savedViewName)
      ) {
        setView(savedViewName as V);
        setChosenView(savedViewName as V);
      }
      setFilters(
        (saved.filters ?? []).reduce<F[]>((restored, item) => {
          const filter = settings.model.read(item);
          const kind = filter ? filterKind(filter) : "";
          const taken = restored.some((entry) =>
            settings.model.multiple?.(kind)
              ? entry.key === filter?.key
              : filterKind(entry) === kind,
          );
          if (filter && !taken) restored.push(filter);
          return restored;
        }, []),
      );
    }
    setIsViewRestored(true);
  }, [savedView, isViewRestored, columnVisibility]);

  const activeFilters = useMemo(
    () => filters.filter(model.isActive),
    [filters, model],
  );

  // ...and remember every change, for this user and this list only.
  const hasOpenedRef = useRef(false);
  useEffect(() => {
    if (!isViewRestored) return;
    const settings = {
      columns: columnVisibility.visibility,
      sorts,
      view: chosenView,
      filters: model.write ? activeFilters.map(model.write) : activeFilters,
    };
    if (hasOpenedRef.current) {
      savedView.save(settings);
      return;
    }
    hasOpenedRef.current = true;
    savedView.remember(settings);
  }, [
    isViewRestored,
    savedView,
    columnVisibility.visibility,
    sorts,
    chosenView,
    activeFilters,
    model,
  ]);

  // A new search, filter or sort starts again from the first page.
  const filterSignature = JSON.stringify(activeFilters);
  const previousQueryStateRef = useRef({ query, filterSignature, sorts });
  useEffect(() => {
    const previous = previousQueryStateRef.current;
    if (
      previous.query === query &&
      previous.filterSignature === filterSignature &&
      previous.sorts === sorts
    ) {
      return;
    }
    previousQueryStateRef.current = { query, filterSignature, sorts };
    setPage(1);
  });

  const getFilter = (key: string) =>
    activeFilters.find((filter) => filter.key === key);

  /** The values of an option filter, or none. */
  const getFilterValues = (key: string): string[] => {
    const filter = getFilter(key) as Partial<OptionFilter> | undefined;
    return Array.isArray(filter?.values) ? filter.values : [];
  };

  /** The list's request: its scope, then query, page, pageSize and sorts. */
  const getSearchParams = (scope: Record<string, string> = {}) => {
    const params = new URLSearchParams({
      ...scope,
      query,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (sorts.length) params.set("sort", formatRecordSorts(sorts));
    return params;
  };

  /** A kind that is there already and can't be added again. */
  const isFilterKindTaken = (kind: string) =>
    !allowsSeveral(kind) &&
    filters.some((filter) => filterKind(filter) === kind);

  const handleAddFilter = (kind: string) => {
    if (isFilterKindTaken(kind)) {
      setOpenFilterKey(
        filters.find((filter) => filterKind(filter) === kind)?.key ?? null,
      );
      return;
    }
    const created = model.create(kind);
    // One of several of a kind gets a key of its own.
    const filter = allowsSeveral(kind)
      ? { ...created, kind, key: `${kind}#${++nextFilterNumber.current}` }
      : created;
    setOpenFilterKey(filter.key);
    setFilters((current) => [...current, filter]);
  };

  const handleFilterChange = (next: F) =>
    setFilters((current) =>
      current.map((filter) => (filter.key === next.key ? next : filter)),
    );

  const handleRemoveFilter = (key: string) =>
    setFilters((current) => current.filter((filter) => filter.key !== key));

  const handleClearFilters = () => setFilters([]);

  const handleClearAll = () => {
    setSearchInput("");
    setFilters([]);
  };

  const handleViewChange = (nextView: V | "table") => {
    setView(nextView);
    setChosenView(nextView);
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    persistTablePageSize(nextPageSize);
    setPageSize(nextPageSize);
    setPage(1);
  };

  return {
    columnVisibility,
    searchInput,
    setSearchInput,
    query,
    /** The orders, most important first (RecordTable `sorts`). */
    sorts,
    setSorts,
    filters,
    activeFilters,
    openFilterKey,
    isFilterActive: model.isActive,
    isFilterKindTaken,
    /** The saved view is applied: ask the server now, not before. */
    isRestored: isViewRestored,
    getFilter,
    getFilterValues,
    handleAddFilter,
    handleFilterChange,
    handleRemoveFilter,
    handleClearFilters,
    handleClearAll,
    isSearching: Boolean(query) || activeFilters.length > 0,
    views: settingsRef.current.views as readonly (V | "table")[],
    view,
    handleViewChange,
    getSearchParams,
    /** Spread into RecordTable's `pagination` with the total. */
    pagination: {
      page,
      pageSize,
      onPageChange: setPage,
      onPageSizeChange: handlePageSizeChange,
    },
  };
};

export type RecordList<
  F extends RecordFilter = OptionFilter,
  V extends RecordListView = "table",
> = ReturnType<typeof useRecordList<F, V>>;
