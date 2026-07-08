"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Download,
  Filter,
  GitMerge,
  Loader2,
  Mail,
  Plus,
  Send,
  Upload,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import { InternalCopyFields } from "@/components/emails/internal-copy-fields";
import { ContactExportDialog } from "@/components/forms/contact-export-dialog";
import ButtonControl from "@/components/helper/button-control";
import FormInputControl from "@/components/helper/form-input-control";
import TableLoadingState from "@/components/loading/table-loading-state";
import { RichEmailEditor } from "@/components/rich-email-editor";
import {
  type ContactRow,
  contactColumns,
  renderContactCard,
} from "@/components/table/contact-columns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  DEFAULT_INTERNAL_COPY_MODE,
  type InternalCopyMode,
} from "@/constants/email";
import { useToast } from "@/hooks/use-toast";
import { parseCsv } from "@/lib/csv";
import { ContactEmailKind, type ContactFilter, ContactFilterType } from "@/types";

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

type SenderLabelMode = "default" | "user";

type MergeEmail = {
  email: string;
  kind: ContactEmailKind.ALIAS | ContactEmailKind.SHARED;
  label?: string;
};

type MergeConflict = {
  field: string;
  values: Array<{
    contactId: string;
    value: unknown;
  }>;
};

type MergePreview = {
  contacts: ContactRow[];
  conflicts: MergeConflict[];
};

const encodeMergeValue = (value: unknown) => JSON.stringify(value ?? null);

const decodeMergeValue = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const formatMergeValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return "Empty";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
};

const parseEmailList = (value: string) =>
  value
    .split(/[\s,;]+/)
    .map((email) => email.trim())
    .filter(Boolean);

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
    | "website"
    | "notes";
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
    field: "notes",
    label: "Notes",
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
  {
    type: "distance",
    label: "Within distance of postal code",
    allowMultiple: false,
  },
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
  | "website"
  | "notes",
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
  notes: "Notes",
};

const CONTACT_IMPORT_FIELDS: ReadonlyArray<{
  field: ContactImportField;
  label: string;
  required?: boolean;
}> = [
  { field: "name", label: "Name", required: true },
  { field: "email", label: "Email", required: true },
  { field: "phone", label: "Phone" },
  { field: "signal", label: "Signal" },
  { field: "pronouns", label: "Pronouns" },
  { field: "address", label: "Address" },
  { field: "postalCode", label: "Postal code" },
  { field: "city", label: "City" },
  { field: "state", label: "State" },
  { field: "country", label: "Country" },
  { field: "website", label: "Website" },
  { field: "notes", label: "Notes" },
  { field: "group", label: "Group name" },
  { field: "groupId", label: "Group ID" },
] as const;

type ContactImportField =
  | "name"
  | "email"
  | "phone"
  | "signal"
  | "pronouns"
  | "address"
  | "postalCode"
  | "city"
  | "state"
  | "country"
  | "website"
  | "notes"
  | "group"
  | "groupId";
type ContactImportColumnMapping = Partial<Record<ContactImportField, string>>;
type ContactImportSourceMapping = Record<
  string,
  ContactImportField | "__none__"
>;

const CONTACT_IMPORT_HEADER_ALIASES: Record<ContactImportField, string[]> = {
  name: ["name", "fullname", "contactname"],
  email: ["email", "emailaddress", "e-mail", "mail"],
  phone: ["phone", "phonenumber", "mobile", "telephone"],
  signal: ["signal", "signalphone"],
  pronouns: ["pronouns"],
  address: ["address", "street"],
  postalCode: ["postalcode", "postcode", "zip", "zipcode"],
  state: ["state", "region", "province"],
  city: ["city", "town"],
  country: ["country"],
  website: ["website", "url", "homepage"],
  notes: ["notes", "note", "additionalinfo", "additionalinformation"],
  group: ["group", "groupname"],
  groupId: ["groupid"],
};

const normalizeImportHeader = (header: string) =>
  header.toLowerCase().replace(/[^a-z0-9]/g, "");

const buildDefaultImportMapping = (headers: string[]) => {
  const normalizedHeaders = new Map(
    headers.map((header) => [normalizeImportHeader(header), header]),
  );
  const mapping: ContactImportColumnMapping = {};

  CONTACT_IMPORT_FIELDS.forEach(({ field }) => {
    const alias = CONTACT_IMPORT_HEADER_ALIASES[field].find((value) =>
      normalizedHeaders.has(normalizeImportHeader(value)),
    );
    if (alias) {
      mapping[field] = normalizedHeaders.get(normalizeImportHeader(alias));
    }
  });

  return mapping;
};

const buildDefaultImportSourceMapping = (headers: string[]) => {
  const fieldMapping = buildDefaultImportMapping(headers);
  const sourceMapping: ContactImportSourceMapping = {};

  headers.forEach((header) => {
    sourceMapping[header] = "__none__";
  });

  Object.entries(fieldMapping).forEach(([field, header]) => {
    if (header) {
      sourceMapping[header] = field as ContactImportField;
    }
  });

  return sourceMapping;
};

const toContactImportColumnMapping = (
  sourceMapping: ContactImportSourceMapping,
) => {
  const columnMapping: ContactImportColumnMapping = {};

  Object.entries(sourceMapping).forEach(([header, field]) => {
    if (field !== "__none__") {
      columnMapping[field] = header;
    }
  });

  return columnMapping;
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
      return (
        Boolean(filter.postalCode?.trim()) &&
        Boolean(filter.countryCode?.trim()) &&
        Number.isFinite(filter.radiusKm) &&
        Number(filter.radiusKm) > 0
      );
    default:
      return true;
  }
};

const getContactFilterKey = (filter: ContactFilter) => {
  switch (filter.type) {
    case "contactField":
      return `${filter.type}-${filter.field}-${filter.operator}-${filter.value ?? ""}`;
    case "attribute":
      return `${filter.type}-${filter.key}-${filter.operator}-${filter.value}`;
    case "group":
      return `${filter.type}-${filter.groupId}`;
    case "eventRole":
      return `${filter.type}-${filter.eventRoleId}`;
    case "createdAt":
      return `${filter.type}-${filter.from ?? ""}-${filter.to ?? ""}`;
    case "distance":
      return `${filter.type}-${filter.postalCode}-${filter.countryCode}-${filter.radiusKm}`;
    default:
      return "contact-filter";
  }
};

export default function ContactTable({ teamId }: ContactTableProps) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importPreviewRows, setImportPreviewRows] = useState<string[][]>([]);
  const [importSourceMapping, setImportSourceMapping] =
    useState<ContactImportSourceMapping>({});
  const [importResult, setImportResult] = useState<ContactImportResult | null>(
    null,
  );
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [isMergePreviewLoading, setIsMergePreviewLoading] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
  const [mergeRows, setMergeRows] = useState<ContactRow[]>([]);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergePrimaryEmail, setMergePrimaryEmail] = useState("");
  const [mergeEmails, setMergeEmails] = useState<MergeEmail[]>([]);
  const [mergeFieldSelections, setMergeFieldSelections] = useState<
    Record<string, string>
  >({});
  const [emailRecipients, setEmailRecipients] = useState<ContactRow[]>([]);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [emailInternalCopyMode, setEmailInternalCopyMode] =
    useState<InternalCopyMode>(DEFAULT_INTERNAL_COPY_MODE);
  const [emailSenderLabelMode, setEmailSenderLabelMode] =
    useState<SenderLabelMode>("default");
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

  const { data: groupsData } = useSWR(`/api/groups?teamId=${teamId}`, fetcher);

  const eventRoles = useMemo(() => {
    if (!rolesData?.data) {
      return [] as Array<{ id: string; name: string; color?: string }>;
    }

    return rolesData.data as Array<{
      id: string;
      name: string;
      color?: string;
    }>;
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
  const previousQueryStateRef = useRef({ query, filtersQuery });

  useEffect(() => {
    if (
      previousQueryStateRef.current.query === query &&
      previousQueryStateRef.current.filtersQuery === filtersQuery
    ) {
      return;
    }
    previousQueryStateRef.current = { query, filtersQuery };
    setPage(1);
  });

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
        description: `${selectedRows.length} contact${selectedRows.length > 1 ? "s" : ""} removed successfully.`,
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
                            ? (current.value ?? "")
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
          : (attributeKeyOptions[0] ?? "");

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
                current.type === "group"
                  ? { ...current, groupId: value }
                  : current,
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
                      ? {
                          ...current,
                          from: event.currentTarget.value || undefined,
                        }
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
                      ? {
                          ...current,
                          to: event.currentTarget.value || undefined,
                        }
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

  const openMergeDialog = async (selectedRows: ContactRow[]) => {
    if (selectedRows.length < 2) {
      return;
    }

    setMergeRows(selectedRows);
    setMergePreview(null);
    setMergeTargetId(selectedRows[0].id);
    setMergePrimaryEmail(selectedRows[0].email ?? "");
    setMergeEmails([]);
    setMergeFieldSelections({});
    setIsMergeDialogOpen(true);
    setIsMergePreviewLoading(true);

    try {
      const response = await fetch("/api/contacts/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          contactIds: selectedRows.map((row) => row.id),
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json.error || "Failed to load merge preview");
      }

      const preview = json.data as MergePreview;
      const target = preview.contacts.find(
        (contact) => contact.id === selectedRows[0].id,
      );
      const allEmails = preview.contacts.flatMap((contact) => [
        ...(contact.email
          ? [
              {
                email: contact.email,
                kind: ContactEmailKind.ALIAS,
                label: undefined,
              } satisfies MergeEmail,
            ]
          : []),
        ...(contact.additionalEmails ?? []).map((entry) => ({
          email: entry.email,
          kind:
            entry.kind === ContactEmailKind.SHARED
              ? ContactEmailKind.SHARED
              : ContactEmailKind.ALIAS,
          label: entry.label,
        })),
      ]);
      const primaryEmail = target?.email ?? allEmails[0]?.email ?? "";
      const uniqueEmails = new Map<string, MergeEmail>();

      allEmails.forEach((entry) => {
        const key = entry.email.trim().toLowerCase();
        if (!key || key === primaryEmail.trim().toLowerCase()) {
          return;
        }
        if (!uniqueEmails.has(key)) {
          uniqueEmails.set(key, {
            ...entry,
            email: key,
            kind:
              entry.kind === ContactEmailKind.SHARED
                ? ContactEmailKind.SHARED
                : ContactEmailKind.ALIAS,
          });
        }
      });

      setMergePreview(preview);
      setMergePrimaryEmail(primaryEmail);
      setMergeEmails(Array.from(uniqueEmails.values()));
      setMergeFieldSelections(
        Object.fromEntries(
          preview.conflicts.map((conflict) => [
            conflict.field,
            encodeMergeValue(
              conflict.values.find((entry) => entry.contactId === selectedRows[0].id)
                ?.value ??
                conflict.values.find((entry) => entry.value !== null)?.value ??
                null,
            ),
          ]),
        ),
      );
    } catch (error) {
      toast({
        title: "Unable to prepare merge",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
      setIsMergeDialogOpen(false);
    } finally {
      setIsMergePreviewLoading(false);
    }
  };

  const handleMergeContacts = async (clearSelection: () => void) => {
    if (!mergeTargetId || !mergePrimaryEmail) {
      return;
    }

    setIsMerging(true);
    try {
      const response = await fetch("/api/contacts/merge", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          targetContactId: mergeTargetId,
          sourceContactIds: mergeRows
            .map((row) => row.id)
            .filter((id) => id !== mergeTargetId),
          primaryEmail: mergePrimaryEmail,
          preservedEmails: mergeEmails.filter(
            (entry) =>
              entry.email.trim().toLowerCase() !==
              mergePrimaryEmail.trim().toLowerCase(),
          ),
          fieldSelections: Object.fromEntries(
            Object.entries(mergeFieldSelections).map(([field, value]) => [
              field,
              decodeMergeValue(value),
            ]),
          ),
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json.error || "Failed to merge contacts");
      }

      toast({
        title: "Contacts merged",
        description: "The selected contacts were merged into the survivor.",
      });
      setIsMergeDialogOpen(false);
      setMergePreview(null);
      setMergeRows([]);
      clearSelection();
      await mutate();
    } catch (error) {
      toast({
        title: "Unable to merge contacts",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsMerging(false);
    }
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
            bccEmails: parseEmailList(emailBcc),
            internalCopyMode: emailInternalCopyMode,
            senderLabelMode: emailSenderLabelMode,
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
      setEmailBcc("");
      setEmailInternalCopyMode(DEFAULT_INTERNAL_COPY_MODE);
      setEmailSenderLabelMode("default");
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

  const handleImportContacts = async () => {
    if (!importFile) {
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("teamId", teamId);
      formData.append("file", importFile);
      formData.append(
        "columnMapping",
        JSON.stringify(toContactImportColumnMapping(importSourceMapping)),
      );

      const response = await fetch("/api/contacts/import", {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json?.error || "Failed to import contacts");
      }

      const result = json.data as ContactImportResult;
      setImportResult(result);

      toast({
        title: "Contact import complete",
        description: `${result.created} created, ${result.skipped} skipped.`,
      });

      if (result.created > 0) {
        await mutate();
      }
    } catch (importError) {
      toast({
        title: "Unable to import contacts",
        description:
          importError instanceof Error
            ? importError.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportFileChange = async (file: File | null) => {
    setImportFile(file);
    setImportResult(null);
    setImportHeaders([]);
    setImportPreviewRows([]);
    setImportSourceMapping({});

    if (!file) {
      return;
    }

    try {
      const parsed = parseCsv(await file.text());
      setImportHeaders(parsed.headers);
      setImportPreviewRows(parsed.rows.slice(0, 3));
      setImportSourceMapping(buildDefaultImportSourceMapping(parsed.headers));
    } catch (_error) {
      toast({
        title: "Unable to read CSV",
        description: "Check that the selected file is a valid CSV file.",
        variant: "destructive",
      });
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
                (filter.type !== "contactField" || item.field === filter.field),
            );
            return (
              <div
                key={getContactFilterKey(filter)}
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
          {activeFilters.map((filter) => (
            <Badge
              key={`active-${getContactFilterKey(filter)}`}
              variant="secondary"
            >
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
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="hidden gap-2 px-3 sm:inline-flex"
                  onClick={() => setIsImportDialogOpen(true)}
                >
                  <Upload className="h-4 w-4" />
                  <span>Import CSV</span>
                </Button>
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
                <ContactImportDialog
                  open={isImportDialogOpen}
                  file={importFile}
                  headers={importHeaders}
                  previewRows={importPreviewRows}
                  sourceMapping={importSourceMapping}
                  result={importResult}
                  isImporting={isImporting}
                  onOpenChange={(open) => {
                    setIsImportDialogOpen(open);
                    if (!open) {
                      setImportFile(null);
                      setImportHeaders([]);
                      setImportPreviewRows([]);
                      setImportSourceMapping({});
                      setImportResult(null);
                    }
                  }}
                  onFileChange={handleImportFileChange}
                  onSourceMappingChange={setImportSourceMapping}
                  onImport={handleImportContacts}
                />
              </div>
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
                      selectedRows.filter((contact) => contact.email).length ===
                        0
                    }
                    onClick={() => openEmailDialog(selectedRows)}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Email selected
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      isDeleting ||
                      isMerging ||
                      isMergePreviewLoading ||
                      selectedRows.length < 2
                    }
                    onClick={() => openMergeDialog(selectedRows)}
                  >
                    <GitMerge className="mr-2 h-4 w-4" />
                    Merge selected
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isDeleting || selectedRows.length === 0}
                    onClick={() => setIsExportDialogOpen(true)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </div>
                <ContactExportDialog
                  teamId={teamId}
                  contactIds={selectedRows.map((row) => row.id)}
                  open={isExportDialogOpen}
                  onOpenChange={setIsExportDialogOpen}
                />
                <MassEmailDialog
                  open={isEmailDialogOpen}
                  recipients={emailRecipients}
                  subject={emailSubject}
                  body={emailBody}
                  bcc={emailBcc}
                  internalCopyMode={emailInternalCopyMode}
                  senderLabelMode={emailSenderLabelMode}
                  isSending={isSendingEmail}
                  onOpenChange={setIsEmailDialogOpen}
                  onSubjectChange={setEmailSubject}
                  onBodyChange={setEmailBody}
                  onBccChange={setEmailBcc}
                  onInternalCopyModeChange={setEmailInternalCopyMode}
                  onSenderLabelModeChange={setEmailSenderLabelMode}
                  onSend={() => handleSendEmail(clearSelection)}
                />
                <ContactMergeDialog
                  open={isMergeDialogOpen}
                  contacts={mergePreview?.contacts ?? mergeRows}
                  conflicts={mergePreview?.conflicts ?? []}
                  targetId={mergeTargetId}
                  primaryEmail={mergePrimaryEmail}
                  preservedEmails={mergeEmails}
                  fieldSelections={mergeFieldSelections}
                  isLoading={isMergePreviewLoading}
                  isMerging={isMerging}
                  onOpenChange={setIsMergeDialogOpen}
                  onTargetChange={(contactId) => {
                    const target = mergePreview?.contacts.find(
                      (contact) => contact.id === contactId,
                    );
                    setMergeTargetId(contactId);
                    if (target?.email) {
                      setMergePrimaryEmail(target.email);
                    }
                  }}
                  onPrimaryEmailChange={setMergePrimaryEmail}
                  onPreservedEmailsChange={setMergeEmails}
                  onFieldSelectionChange={(field, value) =>
                    setMergeFieldSelections((current) => ({
                      ...current,
                      [field]: value,
                    }))
                  }
                  onMerge={() => handleMergeContacts(clearSelection)}
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
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Import CSV"
        className="fixed bottom-20 right-5 z-40 h-12 w-12 rounded-full bg-background shadow-lg sm:hidden"
        onClick={() => setIsImportDialogOpen(true)}
      >
        <Upload className="h-5 w-5" />
      </Button>
    </div>
  );
}

type ContactImportResult = {
  created: number;
  skipped: number;
  totalRows: number;
  skippedRows: Array<{
    rowNumber: number;
    reason: string;
  }>;
};

type ContactMergeDialogProps = {
  open: boolean;
  contacts: ContactRow[];
  conflicts: MergeConflict[];
  targetId: string;
  primaryEmail: string;
  preservedEmails: MergeEmail[];
  fieldSelections: Record<string, string>;
  isLoading: boolean;
  isMerging: boolean;
  onOpenChange: (open: boolean) => void;
  onTargetChange: (contactId: string) => void;
  onPrimaryEmailChange: (email: string) => void;
  onPreservedEmailsChange: (emails: MergeEmail[]) => void;
  onFieldSelectionChange: (field: string, value: string) => void;
  onMerge: () => void;
};

const ContactMergeDialog = ({
  open,
  contacts,
  conflicts,
  targetId,
  primaryEmail,
  preservedEmails,
  fieldSelections,
  isLoading,
  isMerging,
  onOpenChange,
  onTargetChange,
  onPrimaryEmailChange,
  onPreservedEmailsChange,
  onFieldSelectionChange,
  onMerge,
}: ContactMergeDialogProps) => {
  const allEmails = useMemo(() => {
    const map = new Map<string, MergeEmail>();

    contacts.forEach((contact) => {
      if (contact.email) {
        map.set(contact.email.toLowerCase(), {
          email: contact.email.toLowerCase(),
          kind: ContactEmailKind.ALIAS,
        });
      }
      contact.additionalEmails?.forEach((entry) => {
        const email = entry.email.toLowerCase();
        if (!map.has(email)) {
          map.set(email, {
            email,
            kind:
              entry.kind === ContactEmailKind.SHARED
                ? ContactEmailKind.SHARED
                : ContactEmailKind.ALIAS,
            label: entry.label,
          });
        }
      });
    });

    return Array.from(map.values());
  }, [contacts]);

  const preservedEmailSet = useMemo(
    () => new Set(preservedEmails.map((entry) => entry.email)),
    [preservedEmails],
  );

  const setPreservedEmailEnabled = (email: MergeEmail, enabled: boolean) => {
    if (enabled) {
      onPreservedEmailsChange(
        preservedEmailSet.has(email.email)
          ? preservedEmails
          : [...preservedEmails, email],
      );
      return;
    }

    onPreservedEmailsChange(
      preservedEmails.filter((entry) => entry.email !== email.email),
    );
  };

  const setPreservedEmailKind = (
    email: string,
    kind: ContactEmailKind.ALIAS | ContactEmailKind.SHARED,
  ) => {
    onPreservedEmailsChange(
      preservedEmails.map((entry) =>
        entry.email === email ? { ...entry, kind } : entry,
      ),
    );
  };

  const canMerge =
    contacts.length >= 2 && Boolean(targetId) && Boolean(primaryEmail);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Merge contacts</DialogTitle>
          <DialogDescription>
            Choose the survivor, preserve identity aliases, and resolve field
            conflicts before deleting duplicate contacts.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading merge preview...
          </div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-3">
              <Label>Surviving contact</Label>
              <Select value={targetId} onValueChange={onTargetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose survivor" />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.name} {contact.email ? `<${contact.email}>` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <section className="space-y-3">
              <Label>Primary email</Label>
              <Select
                value={primaryEmail}
                onValueChange={onPrimaryEmailChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose primary email" />
                </SelectTrigger>
                <SelectContent>
                  {allEmails.map((entry) => (
                    <SelectItem key={entry.email} value={entry.email}>
                      {entry.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <section className="space-y-3">
              <div>
                <Label>Preserved additional emails</Label>
                <p className="text-sm text-muted-foreground">
                  Alias emails are unique identity matches. Shared emails are
                  display-only and can belong to multiple contacts.
                </p>
              </div>
              <div className="space-y-2">
                {allEmails
                  .filter((entry) => entry.email !== primaryEmail)
                  .map((entry) => {
                    const preserved = preservedEmailSet.has(entry.email);
                    const selected =
                      preservedEmails.find(
                        (candidate) => candidate.email === entry.email,
                      ) ?? entry;

                    return (
                      <div
                        key={entry.email}
                        className="grid gap-3 rounded-md border p-3 sm:grid-cols-[auto_minmax(0,1fr)_150px]"
                      >
                        <Checkbox
                          checked={preserved}
                          onCheckedChange={(checked) =>
                            setPreservedEmailEnabled(entry, checked === true)
                          }
                          aria-label={`Preserve ${entry.email}`}
                        />
                        <span className="break-all text-sm">{entry.email}</span>
                        <Select
                          value={selected.kind}
                          onValueChange={(value) =>
                            setPreservedEmailKind(
                              entry.email,
                              value as ContactEmailKind.ALIAS | ContactEmailKind.SHARED,
                            )
                          }
                          disabled={!preserved}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ContactEmailKind.ALIAS}>
                              Alias
                            </SelectItem>
                            <SelectItem value={ContactEmailKind.SHARED}>
                              Shared
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
              </div>
            </section>

            {conflicts.length > 0 && (
              <section className="space-y-3">
                <div>
                  <Label>Field conflicts</Label>
                  <p className="text-sm text-muted-foreground">
                    Pick the value that should remain on the survivor.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {conflicts.map((conflict) => (
                    <div key={conflict.field} className="space-y-2">
                      <Label className="capitalize">
                        {conflict.field.replace(/([A-Z])/g, " $1")}
                      </Label>
                      <Select
                        value={fieldSelections[conflict.field] ?? ""}
                        onValueChange={(value) =>
                          onFieldSelectionChange(conflict.field, value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose value" />
                        </SelectTrigger>
                        <SelectContent>
                          {conflict.values.map((entry) => {
                            const contact = contacts.find(
                              (candidate) => candidate.id === entry.contactId,
                            );
                            const encoded = encodeMergeValue(entry.value);
                            return (
                              <SelectItem
                                key={`${conflict.field}-${entry.contactId}-${encoded}`}
                                value={encoded}
                              >
                                {contact?.name ?? "Contact"}:{" "}
                                {formatMergeValue(entry.value)}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isMerging}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onMerge}
            disabled={!canMerge || isLoading || isMerging}
          >
            {isMerging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Merging...
              </>
            ) : (
              "Merge contacts"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type ContactImportDialogProps = {
  open: boolean;
  file: File | null;
  headers: string[];
  previewRows: string[][];
  sourceMapping: ContactImportSourceMapping;
  result: ContactImportResult | null;
  isImporting: boolean;
  onOpenChange: (open: boolean) => void;
  onFileChange: (file: File | null) => void | Promise<void>;
  onSourceMappingChange: (mapping: ContactImportSourceMapping) => void;
  onImport: () => void;
};

const ContactImportDialog = ({
  open,
  file,
  headers,
  previewRows,
  sourceMapping,
  result,
  isImporting,
  onOpenChange,
  onFileChange,
  onSourceMappingChange,
  onImport,
}: ContactImportDialogProps) => {
  const selectedFields = Object.values(sourceMapping);
  const canImport =
    Boolean(file) &&
    selectedFields.includes("name") &&
    selectedFields.includes("email") &&
    !isImporting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import contacts from CSV</DialogTitle>
          <DialogDescription>
            Upload a comma-separated file, then map its columns to CRM contact
            fields. Duplicate emails are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="contact-import-file">CSV file</Label>
            <Input
              id="contact-import-file"
              type="file"
              accept=".csv,text/csv"
              disabled={isImporting}
              onChange={(event) => {
                onFileChange(event.currentTarget.files?.[0] ?? null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Name and email are required. Other mapped columns are optional.
            </p>
          </div>

          {headers.length > 0 && (
            <div className="space-y-3">
              <div className="rounded-md border">
                <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(12rem,0.8fr)] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>CSV column</span>
                  <span>Sample values</span>
                  <span>Import as</span>
                </div>
                <div className="divide-y">
                  {headers.map((header, columnIndex) => (
                    <div
                      key={header}
                      className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(12rem,0.8fr)] items-center gap-3 px-3 py-2"
                    >
                      <div className="truncate text-sm font-medium">
                        {header}
                      </div>
                      <div className="min-w-0 text-xs text-muted-foreground">
                        {previewRows.length > 0
                          ? previewRows
                              .map((row) => row[columnIndex])
                              .filter(Boolean)
                              .slice(0, 3)
                              .join(" / ") || "-"
                          : "-"}
                      </div>
                      <Select
                        value={sourceMapping[header] ?? "__none__"}
                        disabled={isImporting}
                        onValueChange={(value) => {
                          const nextValue = value as
                            | ContactImportField
                            | "__none__";
                          const nextMapping = { ...sourceMapping };

                          if (nextValue !== "__none__") {
                            Object.entries(nextMapping).forEach(
                              ([mappedHeader, mappedField]) => {
                                if (
                                  mappedHeader !== header &&
                                  mappedField === nextValue
                                ) {
                                  nextMapping[mappedHeader] = "__none__";
                                }
                              },
                            );
                          }

                          nextMapping[header] = nextValue;
                          onSourceMappingChange(nextMapping);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Do not import" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            Do not import
                          </SelectItem>
                          {CONTACT_IMPORT_FIELDS.map(
                            ({ field, label, required }) => (
                              <SelectItem key={field} value={field}>
                                {label}
                                {required ? " *" : ""}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-medium">
                {result.created} created, {result.skipped} skipped from{" "}
                {result.totalRows} rows.
              </div>
              {result.skippedRows.length > 0 && (
                <div className="mt-3 max-h-44 overflow-auto text-muted-foreground">
                  {result.skippedRows.map((row) => (
                    <div key={`${row.rowNumber}-${row.reason}`}>
                      Row {row.rowNumber}: {row.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isImporting}
          >
            Close
          </Button>
          <Button type="button" onClick={onImport} disabled={!canImport}>
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import contacts
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type MassEmailDialogProps = {
  open: boolean;
  recipients: ContactRow[];
  subject: string;
  body: string;
  bcc: string;
  internalCopyMode: InternalCopyMode;
  senderLabelMode: SenderLabelMode;
  isSending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onBccChange: (value: string) => void;
  onInternalCopyModeChange: (value: InternalCopyMode) => void;
  onSenderLabelModeChange: (value: SenderLabelMode) => void;
  onSend: () => void;
};

const MassEmailDialog = ({
  open,
  recipients,
  subject,
  body,
  bcc,
  internalCopyMode,
  senderLabelMode,
  isSending,
  onOpenChange,
  onSubjectChange,
  onBodyChange,
  onBccChange,
  onInternalCopyModeChange,
  onSenderLabelModeChange,
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
            <Label htmlFor="mass-email-sender">Sender</Label>
            <Select
              value={senderLabelMode}
              onValueChange={(value) =>
                onSenderLabelModeChange(value as SenderLabelMode)
              }
              disabled={isSending}
            >
              <SelectTrigger id="mass-email-sender">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default sender label</SelectItem>
                <SelectItem value="user">My user name</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The sender address stays the default address configured for
              Transactional Email.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mass-message-subject">Subject</Label>
            <Input
              id="mass-message-subject"
              name="subject"
              autoComplete="off"
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              disabled={isSending}
              placeholder="Email subject"
            />
          </div>

          <InternalCopyFields
            idPrefix="mass-email"
            emails={bcc}
            mode={internalCopyMode}
            disabled={isSending}
            onEmailsChange={onBccChange}
            onModeChange={onInternalCopyModeChange}
          />

          <div className="space-y-2">
            <Label htmlFor="mass-email-body">Email body</Label>
            <RichEmailEditor
              id="mass-email-body"
              value={body}
              onChange={onBodyChange}
              disabled={isSending}
              previewDescription="Use the toolbar to format the message. Successful sends are logged in each contact's engagement history."
            />
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
