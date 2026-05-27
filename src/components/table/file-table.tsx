"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import TableLoadingState from "@/components/loading/table-loading-state";
import { getFileColumns } from "@/components/table/file-columns";
import { useToast } from "@/hooks/use-toast";
import type { File, FileDownloadAudit } from "@/types";
import ButtonControl from "../helper/button-control";
import FormInputControl from "../helper/form-input-control";
import { Button } from "../ui/button";
import { Form } from "../ui/form";

const querySchema = z.object({
  query: z.string(),
});
const fetcher = (url: string) => fetch(url).then((res) => res.json());
interface IFileTableProps {
  teamId: string;
  organizationId: string;
  includeContactFiles?: boolean;
}

export default function FileTable({
  teamId,
  organizationId,
  includeContactFiles = false,
}: IFileTableProps) {
  const { toast } = useToast();
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [isDownloadingSelected, setIsDownloadingSelected] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<z.infer<typeof querySchema>>({
    resolver: zodResolver(querySchema),
    defaultValues: { query: "" },
  });

  const query = form.watch("query");
  const filesParams = new URLSearchParams({
    teamId,
    organizationId,
    query,
  });

  if (includeContactFiles) {
    filesParams.set("includeContactFiles", "true");
  }

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/files?${filesParams.toString()}`,
    fetcher,
  );
  const { data: auditData } = useSWR(
    `/api/files/audit?teamId=${teamId}&organizationId=${organizationId}`,
    fetcher,
  );
  const loading = isLoading || !data;

  if (error) {
    toast({
      title: "Error",
      description: "Error fetching funding requests",
      variant: "destructive",
    });
  }

  async function onSubmit(values: z.infer<typeof querySchema>) {
    form.setValue("query", values.query);
  }

  async function downloadFiles(selectedFiles?: File[]) {
    try {
      if (selectedFiles?.length) {
        setIsDownloadingSelected(true);
      } else {
        setIsDownloadingAll(true);
      }

      const params = new URLSearchParams({
        teamId,
        organizationId,
        query,
      });
      if (includeContactFiles) {
        params.set("includeContactFiles", "true");
      }
      if (selectedFiles?.length) {
        params.set("ids", selectedFiles.map((file) => file.id).join(","));
      }
      const response = await fetch(`/api/files/bulk?${params.toString()}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to prepare download");
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
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to download files",
        variant: "destructive",
      });
    } finally {
      setIsDownloadingAll(false);
      setIsDownloadingSelected(false);
    }
  }

  async function deleteFiles(
    selectedFiles: File[],
    clearSelection?: () => void,
  ) {
    if (selectedFiles.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedFiles.length} file${
        selectedFiles.length === 1 ? "" : "s"
      }? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

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

      clearSelection?.();
      await mutate();
    } catch (error) {
      toast({
        title: "Unable to delete files",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col my-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex w-1/2">
            <div className="flex-1">
              <FormInputControl
                form={form}
                name="query"
                placeholder="Search..."
              />
            </div>

            <ButtonControl type="submit" label="Submit" className="mx-2" />
          </form>
        </Form>
        <ButtonControl
          type="button"
          label={isDownloadingAll ? "Preparing..." : "Download All"}
          disabled={loading || isDownloadingAll || !data?.data?.length}
          onClick={() => downloadFiles()}
        />
      </div>
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
            columns={getFileColumns(
              teamId,
              organizationId,
              includeContactFiles,
              (file) => deleteFiles([file]),
            )}
            data={data?.data}
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
                      isDownloadingSelected ||
                      isDeleting ||
                      selectedRows.length === 0
                    }
                    onClick={() => downloadFiles(selectedRows)}
                  >
                    {isDownloadingSelected ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Preparing...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download ZIP
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isDeleting || selectedRows.length === 0}
                    onClick={() => deleteFiles(selectedRows, clearSelection)}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete selected
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={
                      isDeleting ||
                      isDownloadingSelected ||
                      selectedRows.length === 0
                    }
                    onClick={clearSelection}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}
          />
        )}
      </div>
      <div className="rounded-md border my-2 p-3">
        <h3 className="text-sm font-semibold mb-2">Recent Downloads</h3>
        <div className="space-y-2">
          {((auditData?.data as FileDownloadAudit[] | undefined) ?? [])
            .length === 0 ? (
            <p className="text-sm text-muted-foreground">No downloads yet.</p>
          ) : (
            ((auditData?.data as FileDownloadAudit[] | undefined) ?? []).map(
              (item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between text-sm border-b pb-1"
                >
                  <div>
                    <p className="font-medium">
                      {item.type === "BULK"
                        ? `Bulk download (${item.fileCount} files)`
                        : `File download: ${item.file?.name || item.file?.url || "Unknown file"}`}
                    </p>
                    <p className="text-muted-foreground">
                      by {item.user.email}
                      {item.query ? ` | query: "${item.query}"` : ""}
                    </p>
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                </div>
              ),
            )
          )}
        </div>
      </div>
    </div>
  );
}
