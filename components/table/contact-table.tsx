"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Filter, Loader2, Mail, Plus, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import ButtonControl from "@/components/helper/button-control";
import FormInputControl from "@/components/helper/form-input-control";
import TableLoadingState from "@/components/loading/table-loading-state";
import {
  type ContactRow,
  contactColumns,
  renderContactCard,
} from "@/components/table/contact-columns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { ContactFilter, ContactFilterType } from "@/types";

const ContactMap = dynamic(() => import("@/components/contacts/contact-map"), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

interface ContactTableProps {
  teamId: string;
}

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
    label: "Name",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "email",
    label: "Email",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "phone",
    label: "Phone",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "signal",
    label: "Signal",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "website",
    label: "Website",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "pronouns",
    label: "Pronouns",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "address",
    label: "Address",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "postalCode",
    label: "Postal code",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "state",
    label: "State",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "city",
    label: "City",
    allowMultiple: true,
  },
  {
    type: "contactField",
    field: "country",
    label: "Country",
    allowMultiple: true,
  },
  { type: "attribute", label: "Attribute", allowMultiple: true },
  { type: "group", label: "Group", allowMultiple: true },
  { type: "eventRole", label: "Event role", allowMultiple: true },
  { type: "distance", label: "Within distance of postal code", allowMultiple: false },
  { type: "createdAt", label: "Created date", allowMultiple: false },
];

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

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const querySchema = z.object({
  query: z.string(),
});

const isFilterComplete = (filter: ContactFilter) => {
  switch (filter.type) {
    case "contactField":
      if (filter.operator === "contains") {
        return Boolean(filter.value?.trim());
      }
      return true;
    case "attribute":
      if (!filter.key?.trim()) {
        return false;
      }
      return Boolean(filter.value?.trim());
    case "group":
      return Boolean(filter.groupId);
    case "eventRole":
      return Boolean(filter.eventRoleId);
    case "createdAt":
      return Boolean(filter.from) || Boolean(filter.to);
    case "distance":
      return Boolean(filter.postalCode?.trim()) &&
        Boolean(filter.countryCode?.trim()) &&
        Number.isFinite(filter.radiusKm) &&
        Number(filter.radiusKm) > 0;
    default:
      return true;
  }
};

export default function ContactTable({ teamId }: ContactTableProps) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState<ContactRow[]>([]);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [filters, setFilters] = useState<ContactFilter[]>([]);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const form = useForm<z.infer<typeof querySchema>>({
    resolver: zodResolver(querySchema),
    defaultValues: { query: "" },
  });

  const query = form.watch("query");

  const activeFilters = useMemo(
    () => filters.filter(isFilterComplete),
    [filters],
  );

  const filtersQuery = useMemo(() => {
    if (!activeFilters.length) {
      return "";
    }

    return `&filters=${encodeURIComponent(JSON.stringify(activeFilters))}`;
  }, [activeFilters]);

  const contactsKey = `/api/contacts?teamId=${teamId}&query=${encodeURIComponent(query)}${filtersQuery}`;
  const paginatedContactsKey = `${contactsKey}&page=${page}&pageSize=${pageSize}`;

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    paginatedContactsKey,
    fetcher,
  );

  const { data: rolesData } = useSWR(
    `/api/event-roles?teamId=${teamId}`,
    fetcher,
  );

  const { data: groupsData } = useSWR(
    `/api/groups?teamId=${teamId}`,
    fetcher,
  );

  const eventRoles = useMemo(() => {
    if (!rolesData?.data) {
      return [] as Array<{ id: string; name: string; color?: string }>;
    }

    return rolesData.data as Array<{ id: string; name: string; color?: string }>;
  }, [rolesData]);

  const groups = useMemo(() => {
    if (!groupsData?.data) {
      return [] as Array<{ id: string; name: string }>;
    }

    return groupsData.data as Array<{ id: string; name: string }>;
  }, [groupsData]);

  const groupMap = useMemo(() => {
    return new Map(groups.map((group) => [group.id, group]));
  }, [groups]);

  const eventRoleMap = useMemo(() => {
    return new Map(eventRoles.map((role) => [role.id, role]));
  }, [eventRoles]);

  const renderCard = (contact: ContactRow) =>
    renderContactCard(contact, teamId);

  const contacts = useMemo<ContactRow[]>(() => {
    if (!data?.data) {
      return [];
    }

    return data.data as ContactRow[];
  }, [data]);
  const totalContacts = Number(data?.total ?? contacts.length);

  useEffect(() => {
    setPage(1);
  }, [query, filtersQuery]);

  const [attributeKeyOptions, setAttributeKeyOptions] = useState<string[]>([]);

  useEffect(() => {
    const keys = new Set<string>();
    contacts.forEach((contact) => {
      contact.profileAttributes?.forEach((attribute) => {
        if (attribute?.key) {
          keys.add(attribute.key);
        }
      });
    });

    const sortedKeys = Array.from(keys).sort((a, b) => a.localeCompare(b));

    if (sortedKeys.length) {
      setAttributeKeyOptions(sortedKeys);
    }
  }, [contacts]);

  useEffect(() => {
    if (!attributeKeyOptions.length) {
      return;
    }

    setFilters((previous) => {
      let changed = false;
      const updated = previous.map((filter) => {
        if (
          filter.type === "attribute" &&
          !attributeKeyOptions.includes(filter.key)
        ) {
          changed = true;
          return { ...filter, key: attributeKeyOptions[0] };
        }
        return filter;
      });

      return changed ? updated : previous;
    });
  }, [attributeKeyOptions]);

  if (error) {
    toast({
      title: "Unable to load contacts",
      description: "An unexpected error occurred while fetching contacts.",
      variant: "destructive",
    });
  }

  const handleSubmit = (values: z.infer<typeof querySchema>) => {
    form.setValue("query", values.query);
  };

  const handleDeleteSelected = async (
    selectedRows: ContactRow[],
    clearSelection: () => void,
  ) => {
    if (selectedRows.length === 0) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch("/api/contacts", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          ids: selectedRows.map((contact) => contact.id),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to delete contacts");
      }

      toast({
        title: "Contacts deleted",
        description: `${selectedRows.length} contact${
          selectedRows.length > 1 ? "s" : ""
        } removed successfully.`,
      });

      clearSelection();
      await mutate();
    } catch (deleteError) {
      toast({
        title: "Unable to delete contacts",
        description:
          deleteError instanceof Error
            ? deleteError.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const updateFilter = useCallback(
    (index: number, updater: (current: ContactFilter) => ContactFilter) => {
      setFilters((previous) =>
        previous.map((filter, idx) =>
          idx === index ? updater(filter) : filter,
        ),
      );
    },
    [],
  );

  const createDefaultFilter = useCallback(
    (option: FilterOption): ContactFilter => {
      switch (option.type) {
        case "contactField": {
          const field = option.field ?? "email";
          const operator =
            field === "name" ||
            field === "pronouns" ||
            field === "city"
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
          if (!attributeKeyOptions.length) {
            return {
              type: "attribute",
              key: "",
              operator: "contains",
              value: "",
            };
          }
          return {
            type: "attribute",
            key: attributeKeyOptions[0],
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
          return { type: "createdAt" };
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
    },
    [attributeKeyOptions, eventRoles, groups],
  );

  const handleAddFilter = (option: FilterOption) => {
    if (option.type === "attribute" && attributeKeyOptions.length === 0) {
      return;
    }

    const alreadyExists = filters.some((filter) => {
      if (filter.type !== option.type) {
        return false;
      }

      if (option.type === "contactField") {
        return filter.type === "contactField" && filter.field === option.field;
      }
      if (option.type === "attribute") {
        return false;
      }

      return true;
    });

    if (alreadyExists && !option.allowMultiple) {
      return;
    }

    setFilters((previous) => [...previous, createDefaultFilter(option)]);
    setIsFilterMenuOpen(false);
  };

  const handleRemoveFilter = (index: number) => {
    setFilters((previous) => previous.filter((_, idx) => idx !== index));
  };

  const summarizeFilter = useCallback(
    (filter: ContactFilter) => {
      switch (filter.type) {
        case "contactField": {
          const label = CONTACT_FIELD_LABELS[filter.field];
          if (filter.operator === "contains") {
            return filter.value
              ? `${label} contains “${filter.value}”`
              : `${label} contains…`;
          }
          if (filter.operator === "has") {
            return `${label} present`;
          }
          return `${label} missing`;
        }
        case "attribute": {
          const keyLabel = filter.key || "Attribute";
          const operatorLabel =
            filter.operator === "equals" ? "equals" : "contains";
          const trimmedValue = (filter.value ?? "").trim();
          return trimmedValue
            ? `${keyLabel} ${operatorLabel} “${trimmedValue}”`
            : `${keyLabel} ${operatorLabel}…`;
        }
        case "group": {
          const groupName = filter.groupId
            ? groupMap.get(filter.groupId)?.name
            : undefined;
          return groupName ? `Group: ${groupName}` : "Group: Select…";
        }
        case "eventRole": {
          const roleName = filter.eventRoleId
            ? eventRoleMap.get(filter.eventRoleId)?.name
            : undefined;
          return roleName ? `Role: ${roleName}` : "Role: Select…";
        }
        case "createdAt": {
          if (filter.from && filter.to) {
            return `Created between ${filter.from} and ${filter.to}`;
          }
          if (filter.from) {
            return `Created after ${filter.from}`;
          }
          if (filter.to) {
            return `Created before ${filter.to}`;
          }
          return "Created date";
        }
        case "distance": {
          const postal = filter.postalCode?.trim();
          const country = filter.countryCode?.trim();
          const radius = Number.isFinite(filter.radiusKm)
            ? `${filter.radiusKm}km`
            : "radius";
          if (postal && country) {
            return `Within ${radius} of ${postal} (${country})`;
          }
          return "Within distance";
        }
        default:
          return "Filter";
      }
    },
    [eventRoleMap, groupMap],
  );

  const isOptionDisabled = (option: FilterOption) => {
    const alreadyExists = filters.some((filter) => {
      if (filter.type !== option.type) {
        return false;
      }

      if (option.type === "contactField") {
        return filter.type === "contactField" && filter.field === option.field;
      }

      return true;
    });

    if (alreadyExists && !option.allowMultiple) {
      return true;
    }

    if (option.type === "attribute" && attributeKeyOptions.length === 0) {
      return true;
    }

    if (option.type === "group" && groups.length === 0) {
      return true;
    }

    if (option.type === "eventRole" && eventRoles.length === 0) {
      return true;
    }

    return false;
  };

  const renderFilterControl = (filter: ContactFilter, index: number) => {
    switch (filter.type) {
      case "contactField":
        return (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filter.operator}
              onValueChange={(value) =>
                updateFilter(index, (current) =>
                  current.type === "contactField"
                    ? {
                        ...current,
                        operator: value as "has" | "missing" | "contains",
                        value:
                          value === "contains"
                            ? current.value ?? ""
                            : undefined,
                      }
                    : current,
                )
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="has">Has value</SelectItem>
                <SelectItem value="missing">Is missing</SelectItem>
                <SelectItem value="contains">Contains</SelectItem>
              </SelectContent>
            </Select>
            {filter.operator === "contains" && (
              <Input
                type="text"
                placeholder="Contains…"
                value={filter.value ?? ""}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  updateFilter(index, (current) =>
                    current.type === "contactField"
                      ? { ...current, value: nextValue }
                      : current,
                  );
                }}
                className="w-56"
              />
            )}
          </div>
        );
      case "attribute": {
        if (attributeKeyOptions.length === 0) {
          return (
            <span className="text-sm text-muted-foreground">
              No attributes available
            </span>
          );
        }

        const selectedKey = attributeKeyOptions.includes(filter.key)
          ? filter.key
          : attributeKeyOptions[0] ?? "";

        return (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedKey}
              onValueChange={(value) =>
                updateFilter(index, (current) =>
                  current.type === "attribute"
                    ? { ...current, key: value }
                    : current,
                )
              }
              disabled={attributeKeyOptions.length === 0}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select attribute" />
              </SelectTrigger>
              <SelectContent>
                {attributeKeyOptions.map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filter.operator}
              onValueChange={(value) =>
                updateFilter(index, (current) =>
                  current.type === "attribute"
                    ? {
                        ...current,
                        operator: value as "contains" | "equals",
                      }
                    : current,
                )
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">Contains</SelectItem>
                <SelectItem value="equals">Equals</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="text"
              placeholder="Value"
              value={filter.value}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                updateFilter(index, (current) =>
                  current.type === "attribute"
                    ? { ...current, value: nextValue }
                    : current,
                );
              }}
              className="w-56"
            />
          </div>
        );
      }
      case "group":
        return (
          <Select
            value={filter.groupId ?? ""}
            onValueChange={(value) =>
              updateFilter(index, (current) =>
                current.type === "group" ? { ...current, groupId: value } : current,
              )
            }
          >
            <SelectTrigger className="w-48">
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
        );
      case "eventRole":
        return (
          <Select
            value={filter.eventRoleId ?? ""}
            onValueChange={(value) =>
              updateFilter(index, (current) =>
                current.type === "eventRole"
                  ? { ...current, eventRoleId: value }
                  : current,
              )
            }
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              {eventRoles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "createdAt":
        return (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">From</span>
              <Input
                type="date"
                value={filter.from ?? ""}
                onChange={(event) =>
                  updateFilter(index, (current) =>
                    current.type === "createdAt"
                      ? { ...current, from: event.currentTarget.value || undefined }
                      : current,
                  )
                }
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">To</span>
              <Input
                type="date"
                value={filter.to ?? ""}
                onChange={(event) =>
                  updateFilter(index, (current) =>
                    current.type === "createdAt"
                      ? { ...current, to: event.currentTarget.value || undefined }
                      : current,
                  )
                }
                className="w-40"
              />
            </div>
          </div>
        );
      case "distance":
        return (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Postal code"
              value={filter.postalCode}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                updateFilter(index, (current) =>
                  current.type === "distance"
                    ? { ...current, postalCode: nextValue }
                    : current,
                );
              }}
              className="w-36"
            />
            <Input
              placeholder="Country code (e.g. DE)"
              value={filter.countryCode}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                updateFilter(index, (current) =>
                  current.type === "distance"
                    ? { ...current, countryCode: nextValue.toUpperCase() }
                    : current,
                );
              }}
              className="w-40"
            />
            <Input
              type="number"
              min={1}
              step={1}
              placeholder="Radius (km)"
              value={Number.isFinite(filter.radiusKm) ? filter.radiusKm : ""}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                updateFilter(index, (current) =>
                  current.type === "distance"
                    ? { ...current, radiusKm: Number(nextValue) }
                    : current,
                );
              }}
              className="w-32"
            />
          </div>
        );
      default:
        return null;
    }
  };

  const openEmailDialog = (selectedRows: ContactRow[]) => {
    setEmailRecipients(selectedRows);
    setIsEmailDialogOpen(true);
  };

  const handleSendEmail = async (clearSelection: () => void) => {
    const contactIds = emailRecipients.map((contact) => contact.id);
    if (contactIds.length === 0) {
      return;
    }

    setIsSendingEmail(true);
    try {
      const response = await fetch(
        `/api/teams/${teamId}/integrations/scaleway-email/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contactIds,
            subject: emailSubject,
            html: emailBody,
          }),
        },
      );

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || "Failed to send email");
      }

      const result = json.data as {
        batchId: string;
        requested: number;
        sent: number;
        skipped: number;
        failed: number;
      };

      toast({
        title: "Email batch queued",
        description: `${result.requested - result.skipped} email${
          result.requested - result.skipped === 1 ? "" : "s"
        } queued for worker delivery. ${result.skipped} skipped.`,
      });

      setIsEmailDialogOpen(false);
      setEmailRecipients([]);
      setEmailSubject("");
      setEmailBody("");
      clearSelection();
      await mutate();
    } catch (sendError) {
      toast({
        title: "Unable to send email",
        description:
          sendError instanceof Error
            ? sendError.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="my-4 flex flex-col gap-5">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-row"
        >
          <FormInputControl
            form={form}
            name="query"
            placeholder="Search contacts"
          />
          <ButtonControl type="submit" label="Search" className="sm:ml-2" />
        </form>
      </Form>

      <div className="flex flex-wrap items-center gap-3">
        <DropdownMenu
          open={isFilterMenuOpen}
          onOpenChange={setIsFilterMenuOpen}
        >
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              <Filter className="h-4 w-4" />
              Add filter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {FILTER_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={`${option.type}-${option.field ?? "default"}`}
                disabled={isOptionDisabled(option)}
                onSelect={(event) => {
                  event.preventDefault();
                  handleAddFilter(option);
                }}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {filters.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFilters([])}
          >
            Clear filters
          </Button>
        )}
      </div>

      {filters.length > 0 && (
        <div className="flex flex-col gap-2">
          {filters.map((filter, index) => {
            const option = FILTER_OPTIONS.find(
              (item) =>
                item.type === filter.type &&
                (filter.type !== "contactField" ||
                  item.field === filter.field),
            );
            return (
              <div
                key={`${filter.type}-${index}`}
                className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3"
              >
                <span className="text-sm font-medium">
                  {option?.label ?? "Filter"}
                </span>
                {renderFilterControl(filter, index)}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveFilter(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((filter, index) => (
            <Badge key={`active-${filter.type}-${index}`} variant="secondary">
              {summarizeFilter(filter)}
            </Badge>
          ))}
        </div>
      )}

      <div className="relative rounded-md border p-2">
        {isValidating && !isLoading ? (
          <p className="absolute right-4 top-4 text-xs text-muted-foreground">
            Refreshing...
          </p>
        ) : null}
        {isLoading ? (
          <TableLoadingState />
        ) : (
          <DataTable
            columns={contactColumns}
            data={contacts}
            renderCard={renderCard}
            renderMap={() => <ContactMap contacts={contacts} />}
            initialView="table"
            serverPagination={{
              page,
              pageSize,
              total: totalContacts,
              onPageChange: setPage,
              onPageSizeChange: (nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              },
            }}
            toolbar={
              <Link
                href={`/teams/${teamId}/crm/contacts/create`}
                aria-label="Add contact"
              >
                <Button
                  type="button"
                  size="sm"
                  className="hidden gap-2 px-3 sm:inline-flex"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add contact</span>
                </Button>
              </Link>
            }
            selectable
            renderBatchActions={({ selectedRows, clearSelection }) => (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {selectedRows.length} selected
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={
                      isDeleting ||
                      isSendingEmail ||
                      selectedRows.filter((contact) => contact.email).length === 0
                    }
                    onClick={() => openEmailDialog(selectedRows)}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Email selected
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isDeleting}
                    onClick={() =>
                      handleDeleteSelected(selectedRows, clearSelection)
                    }
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Delete selected"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting || selectedRows.length === 0}
                    onClick={clearSelection}
                  >
                    Clear
                  </Button>
                </div>
                <MassEmailDialog
                  open={isEmailDialogOpen}
                  recipients={emailRecipients}
                  subject={emailSubject}
                  body={emailBody}
                  isSending={isSendingEmail}
                  onOpenChange={setIsEmailDialogOpen}
                  onSubjectChange={setEmailSubject}
                  onBodyChange={setEmailBody}
                  onSend={() => handleSendEmail(clearSelection)}
                />
              </div>
            )}
          />
        )}
      </div>

      <Link
        href={`/teams/${teamId}/crm/contacts/create`}
        aria-label="Add contact"
        className="fixed bottom-5 right-5 z-40 sm:hidden"
      >
        <Button
          type="button"
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg"
        >
          <Plus className="h-5 w-5" />
          <span className="sr-only">Add contact</span>
        </Button>
      </Link>
    </div>
  );
}

type MassEmailDialogProps = {
  open: boolean;
  recipients: ContactRow[];
  subject: string;
  body: string;
  isSending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSend: () => void;
};

const MassEmailDialog = ({
  open,
  recipients,
  subject,
  body,
  isSending,
  onOpenChange,
  onSubjectChange,
  onBodyChange,
  onSend,
}: MassEmailDialogProps) => {
  const recipientsWithEmail = recipients.filter((contact) => contact.email);
  const missingEmailCount = recipients.length - recipientsWithEmail.length;
  const canSend =
    recipientsWithEmail.length > 0 &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !isSending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send email to selected contacts</DialogTitle>
          <DialogDescription>
            Sends one email per contact through the Scaleway Transactional Email
            integration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            {recipientsWithEmail.length} recipient
            {recipientsWithEmail.length === 1 ? "" : "s"} with email selected
            {missingEmailCount > 0
              ? `, ${missingEmailCount} without email will be skipped`
              : ""}
            .
          </div>

          <div className="space-y-2">
            <Label htmlFor="mass-email-subject">Subject</Label>
            <Input
              id="mass-email-subject"
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              disabled={isSending}
              placeholder="Email subject"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mass-email-body">Email body</Label>
            <Textarea
              id="mass-email-body"
              value={body}
              onChange={(event) => onBodyChange(event.target.value)}
              disabled={isSending}
              placeholder="<p>Hello,</p><p>Write your email here.</p>"
              className="min-h-56 font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              HTML is supported. Successful sends are logged in each contact's
              engagement history.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onSend} disabled={!canSend}>
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
