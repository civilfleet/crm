"use client";

import { Loader2, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { EmptyState } from "@/components/design/empty-state";
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
  getTeamColumns,
  getTeamHref,
  TEAM_COLUMN_DEFAULTS,
  TEAM_MODULE_LABELS,
  type TeamRow,
} from "@/components/table/teams-columns";
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
import { useToast } from "@/hooks/use-toast";
import { APP_MODULES } from "@/types";

const FILTERS: OptionFilterDefinition[] = [
  {
    key: "module",
    label: "Module",
    options: APP_MODULES.map((module) => ({
      value: module,
      label: TEAM_MODULE_LABELS[module] ?? module,
    })),
  },
];
const FILTER_MODEL = optionFilters(FILTERS);
const FILTER_DEFINITIONS = FILTERS.map(optionFilter);

const getTeamRowId = (team: TeamRow) => team.id;

export default function TeamsTable({
  initialPageSize,
}: {
  initialPageSize: number;
}) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const columns = useMemo(() => getTeamColumns(), []);
  const list = useRecordList({
    viewKey: "teams:admin",
    columnDefaults: TEAM_COLUMN_DEFAULTS,
    initialPageSize,
    sortFields: getSortFields(columns),
    filters: FILTER_MODEL,
  });
  const moduleFilter = list.getFilterValues("module");

  const params = list.getSearchParams();
  if (moduleFilter.length) params.set("modules", moduleFilter.join(","));

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/teams?${params.toString()}`,
    recordListFetcher,
    { keepPreviousData: true },
  );
  const teams: TeamRow[] = Array.isArray(data?.data) ? data.data : [];
  const total = Number(data?.total ?? 0);

  useEffect(() => {
    if (!error) return;
    toast({
      title: "Unable to load teams",
      description: "The team list could not be fetched. Please try again.",
      variant: "destructive",
    });
  }, [error, toast]);

  const handleDeleteSelected = async (
    selectedRows: TeamRow[],
    clearSelection: () => void,
  ) => {
    if (!selectedRows.length) return;

    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedRows.map((team) =>
          fetch(`/api/teams/${team.id}`, { method: "DELETE" }),
        ),
      );
      const failed = results.filter(
        (result) => result.status !== "fulfilled" || !result.value.ok,
      ).length;

      await mutate();
      clearSelection();

      if (failed > 0) {
        toast({
          title: "Teams partially deleted",
          description: `${selectedRows.length - failed} deleted, ${failed} failed.`,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Teams deleted",
        description: `${selectedRows.length} team${selectedRows.length === 1 ? "" : "s"} deleted.`,
      });
    } catch (_deleteError) {
      toast({
        title: "Unable to delete teams",
        description: "An unexpected error occurred while deleting teams.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const emptyState = list.isSearching ? (
    <NoMatchState noun="teams" onClear={list.handleClearAll} />
  ) : (
    <EmptyState
      size="page"
      icon={Users}
      title="No teams yet"
      description="A team funds organizations and keeps its own people, files and settings."
      action={
        <Button asChild variant="action">
          <Link href="/admin/teams/create">
            <Plus /> New team
          </Link>
        </Button>
      }
    />
  );

  return (
    <RecordsPage>
      <RecordsHeader
        icon={Users}
        title="Teams"
        count={isLoading ? undefined : total}
        action={
          <Button asChild variant="action" size="sm">
            <Link href="/admin/teams/create">
              <Plus /> New team
            </Link>
          </Button>
        }
      />

      <RecordListToolbar
        list={list}
        columns={columns}
        filters={FILTER_DEFINITIONS}
        searchLabel="Search teams"
        isRefreshing={isValidating && !isLoading}
      />

      <RecordTable
        columns={columns}
        data={teams}
        getRowId={getTeamRowId}
        getRowHref={getTeamHref}
        isLoading={isLoading}
        emptyState={emptyState}
        noun={{ one: "team", other: "teams" }}
        sorts={list.sorts}
        onSortsChange={list.setSorts}
        columnVisibility={list.columnVisibility.visibility}
        columnLayout={list.columnVisibility}
        pagination={{ ...list.pagination, total }}
        selectable
        renderBulkActions={({ selectedRows, clearSelection }) => (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <BulkActionButton tone="destructive" disabled={isDeleting}>
                {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Delete
              </BulkActionButton>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete {selectedRows.length}{" "}
                  {selectedRows.length === 1 ? "team" : "teams"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {selectedRows.length === 1
                    ? `“${selectedRows[0].name}” and everything that belongs to it is deleted.`
                    : "These teams and everything that belongs to them are deleted."}{" "}
                  This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() =>
                    handleDeleteSelected(selectedRows, clearSelection)
                  }
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      />
    </RecordsPage>
  );
}
