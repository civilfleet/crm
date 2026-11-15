"use client";

import * as React from "react";
import {
  type FilterDefinition,
  optionFilter,
} from "@/components/records/record-list-toolbar";
import type { FilterModel } from "@/components/records/use-record-list";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/*
  Filters for a records list beyond picking options: a free text ("State
  contains Bayern") and a date range ("Start date 1 Mar – 31 May"). One
  model makes, applies and reads back all of them, so a list declares its
  filters once and gets the Filter menu, the chips and its saved view.
*/

/** One filter in a list's bar; which fields it uses depends on its kind. */
export type ListFilter = {
  key: string;
  /** Options: any of these values. */
  values?: string[];
  /** Text: contains this. */
  text?: string;
  /** Date range: from and/or to, as YYYY-MM-DD. */
  from?: string;
  to?: string;
};

export type ListFilterKind =
  | {
      key: string;
      label: string;
      type: "options";
      options: Array<{ value: string; label: string }>;
      /**
       * The options load from the server: a saved value is kept even when
       * the options haven't arrived (or no longer include it).
       */
      dynamicOptions?: boolean;
    }
  | { key: string; label: string; type: "text"; placeholder?: string }
  | { key: string; label: string; type: "dateRange" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isDate = (value: unknown): value is string =>
  typeof value === "string" &&
  DATE.test(value) &&
  !Number.isNaN(Date.parse(value));

export const isListFilterActive = (filter: ListFilter) =>
  Boolean(filter.values?.length) ||
  Boolean(filter.text?.trim()) ||
  Boolean(filter.from) ||
  Boolean(filter.to);

/** How these filters are made and read back from a saved view. */
export const listFilterModel = (
  kinds: readonly ListFilterKind[],
): FilterModel<ListFilter> => ({
  create: (key) => ({ key }),
  isActive: isListFilterActive,
  read: (saved) => {
    if (!saved || typeof saved !== "object") return null;
    const item = saved as Record<string, unknown>;
    const kind = kinds.find((entry) => entry.key === item.key);
    if (!kind) return null;
    if (kind.type === "options") {
      if (!Array.isArray(item.values)) return null;
      const values = item.values.filter(
        (value): value is string =>
          typeof value === "string" &&
          (kind.dynamicOptions ||
            kind.options.some((option) => option.value === value)),
      );
      return values.length ? { key: kind.key, values } : null;
    }
    if (kind.type === "text") {
      return typeof item.text === "string" && item.text.trim()
        ? { key: kind.key, text: item.text.slice(0, 200) }
        : null;
    }
    const from = isDate(item.from) ? item.from : undefined;
    const to = isDate(item.to) ? item.to : undefined;
    return from || to ? { key: kind.key, from, to } : null;
  },
});

const formatDay = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));

/**
 * An input that reports typing a moment after it stops (or on Enter), so a
 * filter doesn't ask the server on every keystroke.
 */
export const DebouncedInput = ({
  value,
  onCommit,
  delay = 300,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onCommit: (value: string) => void;
  delay?: number;
}) => {
  const [draft, setDraft] = React.useState(value);
  const onCommitRef = React.useRef(onCommit);
  onCommitRef.current = onCommit;

  React.useEffect(() => {
    if (draft === value) return;
    const timeout = window.setTimeout(() => onCommitRef.current(draft), delay);
    return () => window.clearTimeout(timeout);
  }, [draft, value, delay]);

  return (
    <Input
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommitRef.current(draft);
        props.onKeyDown?.(event);
      }}
    />
  );
};

/** Commits typing a moment after it stops, like the search field. */
const TextFilterEditor = ({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) => {
  const id = React.useId();
  const [draft, setDraft] = React.useState(value);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  React.useEffect(() => {
    if (draft === value) return;
    const timeout = window.setTimeout(() => onChangeRef.current(draft), 300);
    return () => window.clearTimeout(timeout);
  }, [draft, value]);

  return (
    <div className="space-y-1.5 p-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label} contains
      </Label>
      <Input
        id={id}
        autoFocus
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onChangeRef.current(draft);
        }}
        className="h-8"
      />
    </div>
  );
};

const DateRangeFilterEditor = ({
  filter,
  onChange,
}: {
  filter: ListFilter;
  onChange: (next: ListFilter) => void;
}) => {
  const id = React.useId();
  return (
    <div className="grid grid-cols-2 gap-2 p-1">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-from`} className="text-xs text-muted-foreground">
          From
        </Label>
        <Input
          id={`${id}-from`}
          type="date"
          value={filter.from ?? ""}
          max={filter.to}
          onChange={(event) =>
            onChange({ ...filter, from: event.target.value || undefined })
          }
          className="h-8"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-to`} className="text-xs text-muted-foreground">
          To
        </Label>
        <Input
          id={`${id}-to`}
          type="date"
          value={filter.to ?? ""}
          min={filter.from}
          onChange={(event) =>
            onChange({ ...filter, to: event.target.value || undefined })
          }
          className="h-8"
        />
      </div>
    </div>
  );
};

/** The Filter menu entries and chips for these filters. */
export const listFilterDefinitions = (
  kinds: readonly ListFilterKind[],
): FilterDefinition<ListFilter>[] =>
  kinds.map((kind) => {
    if (kind.type === "options") {
      const definition = optionFilter({
        key: kind.key,
        label: kind.label,
        options: kind.options,
      });
      return {
        key: kind.key,
        label: kind.label,
        disabled: definition.disabled,
        summary: (filter) =>
          definition.summary({ key: filter.key, values: filter.values ?? [] }),
        editor: (filter, onChange) =>
          definition.editor(
            { key: filter.key, values: filter.values ?? [] },
            (next) => onChange({ ...filter, values: next.values }),
          ),
      };
    }
    if (kind.type === "text") {
      return {
        key: kind.key,
        label: kind.label,
        summary: (filter) =>
          filter.text?.trim()
            ? `${kind.label} contains “${filter.text.trim()}”`
            : kind.label,
        editor: (filter, onChange) => (
          <TextFilterEditor
            label={kind.label}
            value={filter.text ?? ""}
            placeholder={kind.placeholder}
            onChange={(text) => onChange({ ...filter, text })}
          />
        ),
      };
    }
    return {
      key: kind.key,
      label: kind.label,
      summary: (filter) => {
        if (filter.from && filter.to) {
          return `${kind.label}: ${formatDay(filter.from)} – ${formatDay(filter.to)}`;
        }
        if (filter.from) return `${kind.label}: from ${formatDay(filter.from)}`;
        if (filter.to) return `${kind.label}: until ${formatDay(filter.to)}`;
        return kind.label;
      },
      editor: (filter, onChange) => (
        <DateRangeFilterEditor filter={filter} onChange={onChange} />
      ),
    };
  });
