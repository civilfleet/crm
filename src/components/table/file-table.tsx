"use client";

import { format } from "date-fns";
import {
  Download,
  Files,
  FolderOpen,
  History,
  Loader2,
  Trash2,
} from "lucide-react";
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
  type FileListScope,
  type FileRow,
  getFileColumnDefaults,
  getFileColumns,
  getFileDownloadHref,
  getFileHref,
  getFileTypeLabel,
  renderFileCard,
} from "@/components/table/file-columns";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import type { FileDownloadAudit } from "@/types";

// File types load with the list, so a saved type is kept as it is.
const FILTER_MODEL = optionFilters(["type"]);

// The same icons as the sidebar, so the page says which list it is.
const SCOPE_ICONS = { crm: Files, funding: FolderOpen, org: FolderOpen };

type FileTableProps = {
  scope: FileListScope;
  teamId?: string;
  organizationId?: string;
  initialPageSize: number;
};

const getFileRowId = (file: FileRow) => file.id;

export default function FileTable({
  scope,
  teamId = "",
  organizationId = "",
  initialPageSize,
}: FileTableProps) {
  const { toast } = useToast();
  const icon = SCOPE_ICONS[scope];
  const includeContactFiles = scope === "crm";
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [isDownloadingSelected, setIsDownloadingSelected] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const columns = useMemo(
    () => getFileColumns({ scope, teamId, organizationId }),
    [scope, teamId, organizationId],
  );
  const list = useRecordList({
    viewKey:
      scope === "org"
        ? `files:org:${organizationId}`
        : `files:${scope}:team:${teamId}`,
    columnDefaults: getFileColumnDefaults(scope),
    initialPageSize,
    sortFields: getSortFields(columns),
    views: ["table", "cards"],
    filters: FILTER_MODEL,
  });
  const typeFilter = list.getFilterValues("type");

  const scopeParams = useMemo(() => {
    const params = new URLSearchParams({ teamId, organizationId });
    if (includeContactFiles) params.set("includeContactFiles", "true");
    return params;
  }, [teamId, organizationId, includeContactFiles]);

  const listParams = list.getSearchParams(Object.fromEntries(scopeParams));
  if (typeFilter.length) listParams.set("types", typeFilter.join(","));

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/files?${listParams.toString()}`,
    recordListFetcher,
    { keepPreviousData: true },
  );
  const { data: auditData, isLoading: isAuditLoading } = useSWR(
    isHistoryOpen ? `/api/files/audit?${scopeParams.toString()}` : null,
    recordListFetcher,
  );
  const files: FileRow[] = Array.isArray(data?.data) ? data.data : [];
  const total = Number(data?.total ?? 0);
  const audits: FileDownloadAudit[] = auditData?.data ?? [];

  // Every type in this list, plus any a saved filter still asks for.
  const filterDefinitions = useMemo<OptionFilterDefinition[]>(() => {
    const types: Array<{ type: string }> = data?.types ?? [];
    const values = Array.from(
      new Set([...types.map((item) => item.type), ...typeFilter]),
    );
    return [
      {
        key: "type",
        label: "Type",
        options: values
          .map((value) => ({ value, label: getFileTypeLabel(value) }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
    ];
  }, [data?.types, typeFilter]);

  useEffect(() => {
    if (!error) return;
    toast({
      title: "Unable to load files",
      description: "The file list could not be fetched. Please try again.",
      variant: "destructive",
    });
  }, [error, toast]);

  const handleDownload = async (selectedFiles?: FileRow[]) => {
    const isSelection = Boolean(selectedFiles?.length);
    if (isSelection) {
      setIsDownloadingSelected(true);
    } else {
      setIsDownloadingAll(true);
    }

    try {
      const params = new URLSearchParams(scopeParams);
      params.set("query", list.query);
      if (typeFilter.length) params.set("types", typeFilter.join(","));
      if (selectedFiles?.length) {
        params.set("ids", selectedFiles.map((file) => file.id).join(","));
      }
      const response = await fetch(`/api/files/bulk?${params.toString()}`);
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Failed to prepare download");
      }
      const contentDisposition =
        response.headers.get("content-disposition") || "";
      const match = contentDisposition.match(/filename=([^;]+)/i);
      const filename =
        match?.[1] ||
        `${includeContactFiles ? "crm" : "funding"}-files-${new Date().toISOString().slice(0, 10)}.zip`;

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      toast({
        title: "Unable to download files",
        description:
          downloadError instanceof Error
            ? downloadError.message
            : "Failed to download files",
        variant: "destructive",
      });
    } finally {
      setIsDownloadingAll(false);
      setIsDownloadingSelected(false);
    }
  };

  const handleDelete = async (
    selectedFiles: FileRow[],
    clearSelection: () => void,
  ) => {
    if (selectedFiles.length === 0) return;

    setIsDeleting(true);
    try {
      const response = await fetch("/api/files/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          organizationId,
          includeContactFiles,
          ids: selectedFiles.map((file) => file.id),
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Failed to delete files");
      }

      toast({
        title: selectedFiles.length === 1 ? "File deleted" : "Files deleted",
        description: `${selectedFiles.length} file${
          selectedFiles.length === 1 ? "" : "s"
        } removed.`,
      });

      clearSelection();
      await mutate();
    } catch (deleteError) {
      toast({
        title: "Unable to delete files",
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

  const emptyState = list.isSearching ? (
    <NoMatchState noun="files" onClear={list.handleClearAll} />
  ) : (
    <EmptyState
      size="page"
      icon={icon}
      title="No files yet"
      description={
        scope === "crm"
          ? "Files added to people, organizations and funding requests show up here."
          : "Files added to organizations, funding requests and agreements show up here."
      }
    />
  );

  return (
    <RecordsPage>
      <RecordsHeader
        icon={icon}
        title="Files"
        count={isLoading ? undefined : total}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading || isDownloadingAll || total === 0}
            onClick={() => handleDownload()}
          >
            {isDownloadingAll ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Download />
            )}
            {isDownloadingAll
              ? "Preparing…"
              : list.isSearching
                ? "Download these"
                : "Download all"}
          </Button>
        }
        menu={
          <DropdownMenuItem onSelect={() => setIsHistoryOpen(true)}>
            <History /> Download history
          </DropdownMenuItem>
        }
      />

      <RecordListToolbar
        list={list}
        columns={columns}
        filters={filterDefinitions.map(optionFilter)}
        searchLabel="Search files"
        isRefreshing={isValidating && !isLoading}
      />

      <RecordTable
        columns={columns}
        data={files}
        getRowId={getFileRowId}
        getRowHref={(file) => getFileHref(file, scope, teamId)}
        isLoading={isLoading}
        emptyState={emptyState}
        noun={{ one: "file", other: "files" }}
        sorts={list.sorts}
        onSortsChange={list.setSorts}
        columnVisibility={list.columnVisibility.visibility}
        columnLayout={list.columnVisibility}
        view={list.view}
        renderCards={(rows) =>
          rows.map((file) =>
            renderFileCard(file, { scope, teamId, organizationId }),
          )
        }
        pagination={{ ...list.pagination, total }}
        selectable
        renderBulkActions={({ selectedRows, clearSelection }) => (
          <>
            {selectedRows.length === 1 ? (
              <BulkActionButton asChild>
                <a href={getFileDownloadHref(selectedRows[0])}>
                  <Download /> Download
                </a>
              </BulkActionButton>
            ) : (
              <BulkActionButton
                disabled={isDownloadingSelected || isDeleting}
                onClick={() => handleDownload(selectedRows)}
              >
                {isDownloadingSelected ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Download />
                )}
                Download ZIP
              </BulkActionButton>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <BulkActionButton tone="destructive" disabled={isDeleting}>
                  {isDeleting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Trash2 />
                  )}
                  Delete
                </BulkActionButton>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete {selectedRows.length}{" "}
                    {selectedRows.length === 1 ? "file" : "files"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    They are removed from the records they belong to. This
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => handleDelete(selectedRows, clearSelection)}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      />

      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Download history</DialogTitle>
            <DialogDescription>
              The last 20 downloads from this list.
            </DialogDescription>
          </DialogHeader>
          {isAuditLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : audits.length === 0 ? (
            <EmptyState icon={History} title="No downloads yet" />
          ) : (
            <ul className="max-h-[60vh] divide-y overflow-y-auto rounded-lg border">
              {audits.map((audit) => (
                <li
                  key={audit.id}
                  className="flex items-start justify-between gap-4 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {audit.type === "BULK"
                        ? `${audit.fileCount} files as ZIP`
                        : audit.file?.name || audit.file?.url || "A file"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {audit.user.email}
                      {audit.query ? ` · search “${audit.query}”` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {format(new Date(audit.createdAt), "d MMM yyyy, HH:mm")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </RecordsPage>
  );
}
