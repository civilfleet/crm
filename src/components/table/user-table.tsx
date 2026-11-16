"use client";

import { BookUser, Loader2, MailPlus, Plus, UserMinus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { EmptyState } from "@/components/design/empty-state";
import { BulkInviteUsersDialog } from "@/components/forms/bulk-invite-users";
import {
  NoMatchState,
  optionFilter,
  RecordListToolbar,
} from "@/components/records/record-list-toolbar";
import {
  BulkActionButton,
  RecordTable,
} from "@/components/records/record-table";
import {
  RecordsHeader,
  RecordsPage,
} from "@/components/records/records-layout";
import {
  getSortFields,
  type OptionFilterDefinition,
  optionFilters,
  recordListFetcher,
  useRecordList,
} from "@/components/records/use-record-list";
import {
  getUserColumns,
  renderUserCard,
  USER_COLUMN_DEFAULTS,
  USER_ROLE_LABELS,
  type UserRow,
} from "@/components/table/user-columns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface UserTableProps {
  teamId?: string;
  organizationId?: string;
  initialPageSize: number;
  /** May invite and remove users. */
  canManageUsers?: boolean;
}

// Groups load with the list, so a saved group is kept as it is.
const TEAM_FILTER_MODEL = optionFilters(["role", "group", "field"]);
const ORGANIZATION_FILTER_MODEL = optionFilters(["field"]);

// Search one field instead of all of them (the API's `field`).
const SEARCH_FIELD_FILTER: OptionFilterDefinition = {
  key: "field",
  label: "Search in",
  options: [
    { value: "name", label: "Name" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "address", label: "Address" },
    { value: "postalCode", label: "Postal code" },
    { value: "city", label: "City" },
    { value: "country", label: "Country" },
  ],
};
const TEAM_ROLES = ["Admin", "Team"] as const;

const getUserRowId = (user: UserRow) => user.id;

export default function UserTable({
  teamId = "",
  organizationId = "",
  initialPageSize,
  canManageUsers = true,
}: UserTableProps) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkInviteOpen, setIsBulkInviteOpen] = useState(false);
  const basePath = teamId
    ? `/teams/${teamId}/users`
    : `/organizations/${organizationId}/users`;
  const scopeLabel = teamId ? "team" : "organization";
  const columns = useMemo(
    () => getUserColumns({ basePath, showGroups: Boolean(teamId) }),
    [basePath, teamId],
  );
  const list = useRecordList({
    viewKey: teamId ? `users:team:${teamId}` : `users:org:${organizationId}`,
    columnDefaults: USER_COLUMN_DEFAULTS,
    initialPageSize,
    sortFields: getSortFields(columns),
    views: ["table", "cards"],
    filters: teamId ? TEAM_FILTER_MODEL : ORGANIZATION_FILTER_MODEL,
  });
  const roleFilter = list.getFilterValues("role");
  const groupFilter = list.getFilterValues("group");

  const params = list.getSearchParams({ teamId, organizationId });
  if (roleFilter.length) params.set("roles", roleFilter.join(","));
  if (teamId && groupFilter.length) {
    params.set("groupIds", groupFilter.join(","));
  }
  // One field narrows the search; several are the same as all.
  const fieldFilter = list.getFilterValues("field");
  if (fieldFilter.length === 1) params.set("field", fieldFilter[0]);

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/users?${params.toString()}`,
    recordListFetcher,
    { keepPreviousData: true },
  );
  const { data: groupsResponse } = useSWR<{
    data: Array<{ id: string; name: string }>;
  }>(
    teamId
      ? `/api/groups?teamId=${encodeURIComponent(teamId)}&optionsOnly=true`
      : null,
    recordListFetcher,
  );
  const ownerId = data?.ownerId as string | undefined;
  const total = Number(data?.total ?? 0);
  const users = useMemo<UserRow[]>(
    () =>
      (Array.isArray(data?.data) ? (data.data as UserRow[]) : []).map(
        (user) => ({ ...user, isOwner: ownerId ? user.id === ownerId : false }),
      ),
    [data?.data, ownerId],
  );

  const filterDefinitions = useMemo<OptionFilterDefinition[]>(
    () =>
      teamId
        ? [
            {
              key: "role",
              label: "Role",
              options: TEAM_ROLES.map((role) => ({
                value: role,
                label: USER_ROLE_LABELS[role],
              })),
            },
            {
              key: "group",
              label: "Group",
              options: [
                { value: "none", label: "No group" },
                ...(groupsResponse?.data ?? []).map((group) => ({
                  value: group.id,
                  label: group.name,
                })),
              ],
            },
            SEARCH_FIELD_FILTER,
          ]
        : [SEARCH_FIELD_FILTER],
    [teamId, groupsResponse?.data],
  );

  useEffect(() => {
    if (!error) return;
    toast({
      title: "Unable to load users",
      description: "The user list could not be fetched. Please try again.",
      variant: "destructive",
    });
  }, [error, toast]);

  const handleRemoveSelected = async (
    selectedRows: UserRow[],
    clearSelection: () => void,
  ) => {
    if (!selectedRows.length) return;

    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedRows.map((user) =>
          fetch(`/api/users/${user.id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ organizationId, teamId }),
          }),
        ),
      );
      const failed = results.filter(
        (result) => result.status !== "fulfilled" || !result.value.ok,
      ).length;

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
        description: `${selectedRows.length} user${selectedRows.length === 1 ? "" : "s"} removed from this ${scopeLabel}.`,
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

  const inviteHref = `${basePath}/create`;
  const emptyState = list.isSearching ? (
    <NoMatchState noun="users" onClear={list.handleClearAll} />
  ) : (
    <EmptyState
      size="page"
      icon={BookUser}
      title="No users yet"
      description={`Invite the people who work in this ${scopeLabel}.`}
      action={
        canManageUsers ? (
          <Button asChild variant="action">
            <Link href={inviteHref}>
              <Plus /> Invite user
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <RecordsPage>
      <RecordsHeader
        icon={BookUser}
        title="Users"
        count={isLoading ? undefined : total}
        action={
          canManageUsers ? (
            <Button asChild variant="action" size="sm">
              <Link href={inviteHref}>
                <Plus /> Invite user
              </Link>
            </Button>
          ) : undefined
        }
        menu={
          canManageUsers && teamId ? (
            <DropdownMenuItem onSelect={() => setIsBulkInviteOpen(true)}>
              <MailPlus /> Invite several by email
            </DropdownMenuItem>
          ) : undefined
        }
      />

      <RecordListToolbar
        list={list}
        columns={columns}
        filters={filterDefinitions.map(optionFilter)}
        searchLabel="Search users"
        isRefreshing={isValidating && !isLoading}
      />

      <RecordTable
        columns={columns}
        data={users}
        getRowId={getUserRowId}
        getRowHref={(user) => `${basePath}/${user.id}`}
        isLoading={isLoading}
        emptyState={emptyState}
        noun={{ one: "user", other: "users" }}
        sorts={list.sorts}
        onSortsChange={list.setSorts}
        columnVisibility={list.columnVisibility.visibility}
        view={list.view}
        renderCards={(rows) =>
          rows.map((user) => renderUserCard(user, basePath))
        }
        pagination={{ ...list.pagination, total }}
        selectable={canManageUsers}
        renderBulkActions={({ selectedRows, clearSelection }) => {
          if (selectedRows.some((user) => user.isOwner)) {
            return (
              <BulkActionButton
                tone="destructive"
                onClick={() =>
                  toast({
                    title: "The owner cannot be removed",
                    description:
                      "Transfer ownership first, then remove them from the team.",
                    variant: "destructive",
                  })
                }
              >
                <UserMinus /> Remove
              </BulkActionButton>
            );
          }
          return (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <BulkActionButton tone="destructive" disabled={isDeleting}>
                  {isDeleting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <UserMinus />
                  )}
                  Remove
                </BulkActionButton>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Remove {selectedRows.length}{" "}
                    {selectedRows.length === 1 ? "user" : "users"} from this{" "}
                    {scopeLabel}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    They lose access to this {scopeLabel}
                    {teamId ? " and its groups" : ""}. Their accounts and other
                    memberships stay as they are.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() =>
                      handleRemoveSelected(selectedRows, clearSelection)
                    }
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          );
        }}
      />

      {canManageUsers && teamId ? (
        <BulkInviteUsersDialog
          teamId={teamId}
          open={isBulkInviteOpen}
          onOpenChange={setIsBulkInviteOpen}
          onInvited={() => mutate()}
        />
      ) : null}
    </RecordsPage>
  );
}
