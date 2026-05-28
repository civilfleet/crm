"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { columns } from "./teams-columns";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function TeamsTable() {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const { data, error, mutate } = useSWR("/api/teams", fetcher);

  if (error) {
    toast({
      title: "Error",
      description: "Error fetching teams",
      variant: "destructive",
    });
  }

  const handleDeleteSelected = async (
    selectedRows: Array<{ id: string }>,
    clearSelection: () => void,
  ) => {
    if (!selectedRows.length) {
      return;
    }

    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedRows.map((team) =>
          fetch(`/api/teams/${team.id}`, {
            method: "DELETE",
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

  return (
    <div className="rounded-md border p-2">
      <DataTable
        columns={columns(mutate)}
        data={data?.data || []}
        initialView="table"
        selectable
        renderBatchActions={({ selectedRows, clearSelection }) => (
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
                    selectedRows as Array<{ id: string }>,
                    clearSelection,
                  )
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
          </div>
        )}
      />
    </div>
  );
}