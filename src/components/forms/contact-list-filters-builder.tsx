"use client";

import { Filter, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ContactFilter, ContactFilterType } from "@/types";

type FilterOption = {
  type: ContactFilterType;
  label: string;
  allowMultiple?: boolean;
  field?:
    | "email"
    | "phone"
    | "signal"
    | "name"
    | "pronouns"
    | "address"
    | "postalCode"
    | "state"
    | "city"
    | "country"
    | "website";
};

const FILTER_OPTIONS: FilterOption[] = [
  {
    type: "contactField",
    field: "name",
    label: "Name contains...",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "email",
    label: "Has email / email contains...",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "phone",
    label: "Has phone / phone contains...",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "signal",
    label: "Has Signal / Signal contains...",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "website",
    label: "Has website / website contains...",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "pronouns",
    label: "Has pronouns / pronouns contains...",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "address",
    label: "Has address / address contains...",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "postalCode",
    label: "Has postal code / postal code contains...",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "state",
    label: "Has state / state contains...",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "city",
    label: "Has city / city contains...",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "country",
    label: "Has country / country contains...",
    allowMultiple: true,
  },
  { type: "attribute", label: "Profile attribute", allowMultiple: true },
  { type: "group", label: "Group membership", allowMultiple: true },
  { type: "eventRole", label: "Event role participation", allowMultiple: true },
  {
    type: "distance",
    label: "Within distance of postal code",
    allowMultiple: false,
  },
  { type: "createdAt", label: "Created date range", allowMultiple: false },
];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ContactListFiltersBuilderProps {
  teamId: string;
  value: ContactFilter[];
  onChange: (filters: ContactFilter[]) => void;
}

const CONTACT_FIELD_LABELS: Record<
  | "email"
  | "phone"
  | "signal"
  | "name"
  | "pronouns"
  | "address"
  | "postalCode"
  | "state"
  | "city"
  | "country"
  | "website",
  string
> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  signal: "Signal",
  pronouns: "Pronouns",
  address: "Address",
  postalCode: "Postal code",
  state: "State",
  city: "City",
  country: "Country",
  website: "Website",
};

export function ContactListFiltersBuilder({
  teamId,
  value,
  onChange,
}: ContactListFiltersBuilderProps) {
  const filters = value ?? [];
  const filterKeyMap = useRef(new WeakMap<ContactFilter, string>());

  const getFilterKey = (filter: ContactFilter) => {
    let key = filterKeyMap.current.get(filter);
    if (!key) {
      key = `filter-${Math.random().toString(36).slice(2, 9)}`;
      filterKeyMap.current.set(filter, key);
    }
    return key;
  };

  const { data: groupsData } = useSWR(`/api/groups?teamId=${teamId}`, fetcher);

  const { data: rolesData } = useSWR(
    `/api/event-roles?teamId=${teamId}`,
    fetcher,
  );

  const groups = useMemo(() => {
    if (!groupsData?.data) {
      return [] as Array<{ id: string; name: string }>;
    }

    return groupsData.data as Array<{ id: string; name: string }>;
  }, [groupsData]);

  const eventRoles = useMemo(() => {
    if (!rolesData?.data) {
      return [] as Array<{ id: string; name: string }>;
    }

    return rolesData.data as Array<{ id: string; name: string }>;
  }, [rolesData]);

  const updateFilter = (index: number, updated: ContactFilter) => {
    onChange(filters.map((filter, idx) => (idx === index ? updated : filter)));
  };

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, idx) => idx !== index));
  };

  const createDefaultFilter = (option: FilterOption): ContactFilter => {
    switch (option.type) {
      case "contactField": {
        const field = option.field ?? "email";
        const operator =
          field === "name" || field === "pronouns" || field === "city"
            ? "contains"
            : "has";
        return {
          type: "contactField",
          field,
          operator,
          ...(operator === "contains" ? { value: "" } : {}),
        };
      }
      case "attribute":
        return {
          type: "attribute",
          key: "",
          operator: "contains",
          value: "",
        };
      case "group":
        return {
          type: "group",
          groupId: groups[0]?.id ?? "",
        };
      case "eventRole":
        return {
          type: "eventRole",
          eventRoleId: eventRoles[0]?.id ?? "",
        };
      case "createdAt":
        return {
          type: "createdAt",
        };
      case "distance":
        return {
          type: "distance",
          postalCode: "",
          countryCode: "",
          radiusKm: 50,
        };
      default:
        return {
          type: "contactField",
          field: "email",
          operator: "has",
        };
    }
  };

  const canAddOption = (option: FilterOption) => {
    if (option.type === "group" && groups.length === 0) {
      return false;
    }
    if (option.type === "eventRole" && eventRoles.length === 0) {
      return false;
    }
    if (option.allowMultiple) {
      return true;
    }

    return !filters.some((filter) => {
      if (filter.type !== option.type) {
        return false;
      }

      if (option.type === "contactField" && filter.type === "contactField") {
        return filter.field === option.field;
      }

      return true;
    });
  };

  const handleAddFilter = (option: FilterOption) => {
    if (!canAddOption(option)) {
      return;
    }

    onChange([...filters, createDefaultFilter(option)]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span>Filters automatically keep this list up to date.</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add filter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {FILTER_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={`${option.type}-${option.field ?? "default"}`}
                onClick={() => handleAddFilter(option)}
                disabled={!canAddOption(option)}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filters.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No filters configured. All contacts in the team will be included.
        </p>
      ) : (
        <div className="space-y-3">
          {filters.map((filter, index) => {
            const filterKey = getFilterKey(filter);
            switch (filter.type) {
              case "contactField": {
                const fieldLabel = CONTACT_FIELD_LABELS[filter.field];
                return (
                  <div key={filterKey} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Badge variant="outline">{fieldLabel}</Badge>
                        <span>Contact field</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFilter(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove filter</span>
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Select
                        value={filter.operator}
                        onValueChange={(value) => {
                          const operator = value as
                            | "contains"
                            | "has"
                            | "missing";
                          updateFilter(index, {
                            ...filter,
                            operator,
                            ...(operator === "contains"
                              ? { value: filter.value ?? "" }
                              : { value: undefined }),
                          });
                        }}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Select operator" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contains">
                            Contains value
                          </SelectItem>
                          <SelectItem value="has">Is present</SelectItem>
                          <SelectItem value="missing">Is missing</SelectItem>
                        </SelectContent>
                      </Select>
                      {filter.operator === "contains" ? (
                        <Input
                          className="min-w-[220px]"
                          placeholder={`Enter ${fieldLabel.toLowerCase()}`}
                          value={filter.value ?? ""}
                          onChange={(event) =>
                            updateFilter(index, {
                              ...filter,
                              value: event.target.value,
                            })
                          }
                        />
                      ) : null}
                    </div>
                  </div>
                );
              }
              case "attribute":
                return (
                  <div key={filterKey} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Badge variant="outline">Attribute</Badge>
                        <span>Custom profile field</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFilter(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove filter</span>
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <Input
                        placeholder="Attribute key (e.g. city)"
                        value={filter.key}
                        onChange={(event) =>
                          updateFilter(index, {
                            ...filter,
                            key: event.target.value,
                          })
                        }
                      />
                      <Select
                        value={filter.operator}
                        onValueChange={(value) =>
                          updateFilter(index, {
                            ...filter,
                            operator: value as "contains" | "equals",
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select operator" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contains">
                            Contains value
                          </SelectItem>
                          <SelectItem value="equals">Equals value</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Value"
                        value={filter.value}
                        onChange={(event) =>
                          updateFilter(index, {
                            ...filter,
                            value: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                );
              case "group":
                return (
                  <div key={filterKey} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Badge variant="outline">Group</Badge>
                        <span>Group membership</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFilter(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove filter</span>
                      </Button>
                    </div>
                    <div className="mt-3">
                      <Select
                        value={filter.groupId}
                        onValueChange={(value) =>
                          updateFilter(index, {
                            ...filter,
                            groupId: value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select group" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              case "eventRole":
                return (
                  <div key={filterKey} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Badge variant="outline">Event role</Badge>
                        <span>Participation</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFilter(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove filter</span>
                      </Button>
                    </div>
                    <div className="mt-3">
                      <Select
                        value={filter.eventRoleId}
                        onValueChange={(value) =>
                          updateFilter(index, {
                            ...filter,
                            eventRoleId: value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select event role" />
                        </SelectTrigger>
                        <SelectContent>
                          {eventRoles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              case "createdAt":
                return (
                  <div key={filterKey} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Badge variant="outline">Created at</Badge>
                        <span>Date range</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFilter(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove filter</span>
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`created-at-from-${filterKey}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          From
                        </label>
                        <Input
                          id={`created-at-from-${filterKey}`}
                          type="date"
                          value={filter.from ?? ""}
                          onChange={(event) =>
                            updateFilter(index, {
                              ...filter,
                              from: event.target.value || undefined,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`created-at-to-${filterKey}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          To
                        </label>
                        <Input
                          id={`created-at-to-${filterKey}`}
                          type="date"
                          value={filter.to ?? ""}
                          onChange={(event) =>
                            updateFilter(index, {
                              ...filter,
                              to: event.target.value || undefined,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              case "distance":
                return (
                  <div key={filterKey} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Badge variant="outline">Distance</Badge>
                        <span>Within radius</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFilter(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove filter</span>
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <Input
                        placeholder="Postal code"
                        value={filter.postalCode}
                        onChange={(event) =>
                          updateFilter(index, {
                            ...filter,
                            postalCode: event.target.value,
                          })
                        }
                      />
                      <Input
                        placeholder="Country code (e.g. DE)"
                        value={filter.countryCode}
                        onChange={(event) =>
                          updateFilter(index, {
                            ...filter,
                            countryCode: event.target.value.toUpperCase(),
                          })
                        }
                      />
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        placeholder="Radius (km)"
                        value={
                          Number.isFinite(filter.radiusKm)
                            ? filter.radiusKm
                            : ""
                        }
                        onChange={(event) =>
                          updateFilter(index, {
                            ...filter,
                            radiusKm: Number(event.target.value),
                          })
                        }
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Uses postal-code centroids; results are approximate.
                    </p>
                  </div>
                );
              default:
                return null;
            }
          })}
        </div>
      )}
    </div>
  );
}