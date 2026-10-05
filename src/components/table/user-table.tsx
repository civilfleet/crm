"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Filter, Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import TableLoadingState from "@/components/loading/table-loading-state";
import { columns } from "@/components/table/user-columns";
import { Button } from "@/components/ui/button";
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
  const { data: groupsResponse } = useSWR<{
    data: Array<{ id: string; name: string }>;
  }>(
    teamId
      ? `/api/groups?teamId=${encodeURIComponent(teamId)}&optionsOnly=true`
      : null,
    fetcher,
  );
  const groups = groupsResponse?.data ?? [];
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

  const clearFilters = () => {
    form.reset({ query: "" });
    setSearchQuery("");
    setSearchField("all");
    setGroupId("all");
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
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex w-full flex-col gap-2 rounded-lg border bg-muted/20 p-3 lg:flex-row lg:items-end"
        >
          <div className="min-w-0 flex-1 lg:max-w-md">
            <FormInputControl
              form={form}
              name="query"
              label="Search users"
              placeholder="Enter a value..."
            />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:flex lg:items-end">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium"
                htmlFor="user-search-field"
              >
                Field
              </label>
              <Select
                value={searchField}
                onValueChange={(value) => {
                  setSearchField(value);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  id="user-search-field"
                  className="w-full sm:w-40"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All fields</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="address">Address</SelectItem>
                  <SelectItem value="postalCode">Postal code</SelectItem>
                  <SelectItem value="city">City</SelectItem>
                  <SelectItem value="country">Country</SelectItem>
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
                <Select
                  value={groupId}
                  onValueChange={(value) => {
                    setGroupId(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    id="user-group-filter"
                    className="w-full sm:w-52"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All groups</SelectItem>
                    <SelectItem value="none">No groups</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2 lg:pb-px">
            <Button type="submit" className="shrink-0">
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
            {hasFilters ? (
              <Button type="button" variant="ghost" onClick={clearFilters}>
                <X className="mr-2 h-4 w-4" />
                Clear
              </Button>
            ) : null}
          </div>
        </form>
      </Form>
      {hasFilters ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Showing users that match the active filters
        </div>
      ) : null}
      <div className="relative rounded-md border my-2 flex justify-center items-center grow h-full">
        {isValidating && !loading ? (
          <p className="absolute right-4 top-4 text-xs text-muted-foreground">
            Refreshing...
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
                              Removing...
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
