"use client";

import { useEffect, useRef, useState } from "react";
import { FilterMenu } from "@/components/records/record-list-toolbar";
import { FilterChip } from "@/components/records/records-toolbar";
import {
  type ContactListFilter,
  contactFilterModel,
  isContactFilterComplete,
  kindOf,
  useContactFilterDefinitions,
} from "@/components/table/contact-filters";
import { Button } from "@/components/ui/button";
import type { ContactFilter } from "@/types";

type ContactFilterChipsProps = {
  teamId: string;
  /** The complete filters, as saved with the list. */
  value: ContactFilter[];
  onChange: (filters: ContactFilter[]) => void;
};

const toItems = (filters: ContactFilter[], prefix: string) =>
  filters.map((filter, index) => ({
    key: `${kindOf(filter)}#${prefix}${index}`,
    kind: kindOf(filter),
    filter,
  }));

const completeFilters = (items: ContactListFilter[]) =>
  items
    .filter((item) => isContactFilterComplete(item.filter))
    .map((item) => item.filter);

/**
 * A smart list's filters, as the same chips and Filter menu as the contacts
 * list. A chip still without its value stays here, dashed, and is not saved.
 */
export const ContactFilterChips = ({
  teamId,
  value,
  onChange,
}: ContactFilterChipsProps) => {
  const definitions = useContactFilterDefinitions(teamId);
  const [items, setItems] = useState<ContactListFilter[]>(() =>
    toItems(value, "s"),
  );
  const [openKey, setOpenKey] = useState<string | null>(null);
  const counter = useRef(0);
  // What the chips hold, for telling an outside change from our own.
  const itemsRef = useRef(items);

  // The list loaded or was reset from outside: show what it holds.
  useEffect(() => {
    const ours = JSON.stringify(completeFilters(itemsRef.current));
    if (JSON.stringify(value) === ours) return;
    const next = toItems(value, `r${++counter.current}-`);
    itemsRef.current = next;
    setItems(next);
  }, [value]);

  const update = (next: ContactListFilter[]) => {
    itemsRef.current = next;
    setItems(next);
    onChange(completeFilters(next));
  };

  const isKindTaken = (kind: string) =>
    !contactFilterModel.multiple?.(kind) &&
    items.some((item) => item.kind === kind);

  const handleAdd = (kind: string) => {
    const existing = items.find((item) => item.kind === kind);
    if (existing && isKindTaken(kind)) {
      setOpenKey(existing.key);
      return;
    }
    const created = contactFilterModel.create(kind);
    const item = { ...created, kind, key: `${kind}#n${++counter.current}` };
    setOpenKey(item.key);
    update([...items, item]);
  };

  const handleChange = (next: ContactListFilter) =>
    update(items.map((item) => (item.key === next.key ? next : item)));

  const handleRemove = (key: string) =>
    update(items.filter((item) => item.key !== key));

  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterMenu
          label="Include contacts by"
          options={definitions.map((definition) => ({
            key: definition.key,
            label: definition.label,
            group: definition.group,
            keywords: definition.keywords,
            disabled: definition.disabled || isKindTaken(definition.key),
          }))}
          activeCount={completeFilters(items).length}
          onAdd={handleAdd}
        />
        {items.map((item) => {
          const definition = definitions.find(
            (entry) => entry.key === item.kind,
          );
          if (!definition) return null;
          return (
            <FilterChip
              key={item.key}
              summary={definition.summary(item)}
              incomplete={!isContactFilterComplete(item.filter)}
              defaultOpen={item.key === openKey}
              onRemove={() => handleRemove(item.key)}
            >
              {definition.editor(item, handleChange)}
            </FilterChip>
          );
        })}
        {items.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => update([])}
          >
            Clear all
          </Button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">
          No filters yet: every contact in the team is included. Add one with
          Filter.
        </p>
      ) : null}
    </div>
  );
};
