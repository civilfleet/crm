"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Filter, Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import TableLoadingState from "@/components/loading/table-loading-state";
import { columns } from "@/components/table/user-columns";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Combobox } from "@/components/ui/combobox";
import { useToast } from "@/hooks/use-toast";
import { persistTablePageSize } from "@/lib/table-page-size";
import type { User } from "@/types";
import FormInputControl from "../helper/form-input-control";
import { Form } from "../ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface UserTableProps {
  teamId: string;
  organizationId: string;
  initialPageSize: number;
  canManageUsers?: boolean;
}

const querySchema = z.object({
  query: z.string(),
});

const SEARCH_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  address: "Address",
  postalCode: "Postal code",
  city: "City",
  country: "Country",
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());
export default function UserTable({
  teamId,
  organizationId,
  initialPageSize,
  canManageUsers = true,
}: UserTableProps) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [groupId, setGroupId] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const form = useForm<z.infer<typeof querySchema>>({
    resolver: zodResolver(querySchema),
    defaultValues: { query: "" },
  });

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams({
      teamId,
      organizationId,
      query: searchQuery,
      field: searchField,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (teamId && groupId !== "all") params.set("groupId", groupId);
    return `/api/users?${params.toString()}`;
  }, [
    groupId,
    organizationId,
    page,
    pageSize,
    searchField,
    searchQuery,
    teamId,
  ]);

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    requestUrl,
    fetcher,
  );
  const { data: groupsResponse, isLoading: groupsLoading } = useSWR<{
    data: Array<{ id: string; name: string }>;
  }>(
    teamId
      ? `/api/groups?teamId=${encodeURIComponent(teamId)}&optionsOnly=true`
      : null,
    fetcher,
  );
  const groupOptions = useMemo(
    () => [
      { value: "all", label: "All groups" },
      { value: "none", label: "No groups" },
      ...(groupsResponse?.data ?? []).map((group) => ({
        value: group.id,
        label: group.name,
      })),
    ],
    [groupsResponse?.data],
  );
  const selectedGroupLabel = groupOptions.find(
    (option) => option.value === groupId,
  )?.label;
  const loading = isLoading || !data;
  const ownerId = data?.ownerId as string | undefined;
  const totalUsers = Number(data?.total ?? data?.data?.length ?? 0);
  const onSubmit = (values: z.infer<typeof querySchema>) => {
    setSearchQuery(values.query.trim());
    setPage(1);
  };

  const hasFilters = Boolean(
    searchQuery || searchField !== "all" || groupId !== "all",
  );
  const hiddenFilterCount =
    Number(searchField !== "all") + Number(groupId !== "all");

  const clearFilters = () => {
    form.reset({ query: "" });
    setSearchQuery("");
    setSearchField("all");
    setGroupId("all");
    setPage(1);
  };

  const clearSearch = () => {
    form.reset({ query: "" });
    setSearchQuery("");
    setPage(1);
  };

  useEffect(() => {
    if (!error) return;
    toast({
      title: "Unable to load users",
      description: "The user list could not be fetched. Please try again.",
      variant: "destructive",
    });
  }, [error, toast]);

  const handleDeleteSelected = async (
    selectedRows: Array<User & { isOwner?: boolean }>,
    clearSelection: () => void,
  ) => {
    if (!selectedRows.length) {
      return;
    }

    const ownerSelected = selectedRows.some((user) => user.isOwner);
    if (ownerSelected) {
      toast({
        title: "Cannot remove owner",
        description:
          "Transfer ownership first before removing the team owner from this team.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsDeleting(true);
      const results = await Promise.allSettled(
        selectedRows.map((user) =>
          fetch(`/api/users/${user.id}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ organizationId, teamId }),
          }),
        ),
      );

      const failed = results.filter((result) => {
        if (result.status !== "fulfilled") {
          return true;
        }
        return !result.value.ok;
      }).length;

      await mutate();
      clearSelection();

      if (failed > 0) {
        toast({
          title: "Users partially removed",
          description: `${selectedRows.length - failed} removed, ${failed} failed.`,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Users removed",
        description: `${selectedRows.length} user${selectedRows.length === 1 ? "" : "s"} removed.`,
      });
    } catch (_deleteError) {
      toast({
        title: "Unable to remove users",
        description: "An unexpected error occurred while removing users.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col my-2 gap-2">
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex w-full flex-col gap-3"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 sm:max-w-md">
                <FormInputControl
                  form={form}
                  name="query"
                  label="Search Users"
                  placeholder="Enter a value…"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" className="shrink-0">
                  <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                  Search
                </Button>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="outline" className="group">
                    <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
                    Filters
                    {hiddenFilterCount > 0 ? (
                      <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-xs leading-none text-primary-foreground tabular-nums">
                        {hiddenFilterCount}
                      </span>
                    ) : null}
                    <ChevronDown
                      className="ml-2 h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>

            <CollapsibleContent>
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:max-w-2xl">
                <div className="space-y-1.5">
                  <label
                    className="text-sm font-medium"
                    htmlFor="user-search-field"
                  >
                    Search Field
                  </label>
                  <Select
                    value={searchField}
                    onValueChange={(value) => {
                      setSearchField(value);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger id="user-search-field" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All fields</SelectItem>
                      {Object.entries(SEARCH_FIELD_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {teamId ? (
                  <div className="space-y-1.5">
                    <label
                      className="text-sm font-medium"
                      htmlFor="user-group-filter"
                    >
                      Group
                    </label>
                    <Combobox
                      id="user-group-filter"
                      value={groupId}
                      onChange={(value) => {
                        setGroupId(value || "all");
                        setPage(1);
                      }}
                      options={groupOptions}
                      placeholder="Select a group"
                      searchPlaceholder="Search groups…"
                      emptyStateText="No groups found."
                      isLoading={groupsLoading}
                    />
                  </div>
                ) : null}
              </div>
            </CollapsibleContent>
          </form>
        </Form>
      </Collapsible>
      {hasFilters ? (
        <fieldset className="flex min-w-0 flex-wrap items-center gap-2">
          <legend className="sr-only">Active filters</legend>
          <span className="text-sm text-muted-foreground">Active:</span>
          {searchQuery ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 rounded-full px-2.5"
              onClick={clearSearch}
              aria-label={`Remove search filter: ${searchQuery}`}
            >
              <span className="max-w-56 truncate">Search: {searchQuery}</span>
              <X className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : null}
          {searchField !== "all" ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 rounded-full px-2.5"
              onClick={() => {
                setSearchField("all");
                setPage(1);
              }}
              aria-label={`Remove search field filter: ${SEARCH_FIELD_LABELS[searchField]}`}
            >
              Field: {SEARCH_FIELD_LABELS[searchField]}
              <X className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : null}
          {groupId !== "all" ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 rounded-full px-2.5"
              onClick={() => {
                setGroupId("all");
                setPage(1);
              }}
              aria-label={`Remove group filter: ${selectedGroupLabel ?? "Selected group"}`}
            >
              <span className="max-w-56 truncate">
                Group: {selectedGroupLabel ?? "Selected group"}
              </span>
              <X className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-muted-foreground"
            onClick={clearFilters}
          >
            Clear All
          </Button>
        </fieldset>
      ) : null}
      <div className="relative rounded-md border my-2 flex justify-center items-center grow h-full">
        {isValidating && !loading ? (
          <p
            className="absolute right-4 top-4 text-xs text-muted-foreground"
            role="status"
          >
            Refreshing…
          </p>
        ) : null}
        {loading ? (
          <TableLoadingState />
        ) : (
          <DataTable
            columns={columns}
            data={(data?.data || []).map((user: User) => ({
              ...user,
              isOwner: ownerId ? user.id === ownerId : false,
              canManageUsers,
            }))}
            initialView="table"
            serverPagination={{
              page,
              pageSize,
              total: totalUsers,
              onPageChange: setPage,
              onPageSizeChange: (nextPageSize) => {
                setPageSize(nextPageSize);
                persistTablePageSize(nextPageSize);
                setPage(1);
              },
            }}
            selectable={canManageUsers}
            renderBatchActions={
              canManageUsers
                ? ({ selectedRows, clearSelection }) => (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {selectedRows.length} selected
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={isDeleting}
                          onClick={() =>
                            handleDeleteSelected(
                              selectedRows as Array<
                                User & { isOwner?: boolean }
                              >,
                              clearSelection,
                            )
                          }
                        >
                          {isDeleting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Removing…
                            </>
                          ) : (
                            "Remove selected"
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
                    </div>
                  )
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
