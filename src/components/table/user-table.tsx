"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import TableLoadingState from "@/components/loading/table-loading-state";
import { columns } from "@/components/table/user-columns";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@/types";
import ButtonControl from "../helper/button-control";
import FormInputControl from "../helper/form-input-control";
import { Form } from "../ui/form";

interface UserTableProps {
  teamId: string;
  organizationId: string;
}

const querySchema = z.object({
  query: z.string(),
});
const fetcher = (url: string) => fetch(url).then((res) => res.json());
export default function UserTable({ teamId, organizationId }: UserTableProps) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const form = useForm<z.infer<typeof querySchema>>({
    resolver: zodResolver(querySchema),
    defaultValues: { query: "" },
  });

  const query = form.watch("query");

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/users?teamId=${teamId}&query=${query}&organizationId=${organizationId}&page=${page}&pageSize=${pageSize}`,
    fetcher,
  );
  const loading = isLoading || !data;
  const ownerId = data?.ownerId as string | undefined;
  const totalUsers = Number(data?.total ?? data?.data?.length ?? 0);
  const previousQueryRef = useRef(query);

  useEffect(() => {
    if (previousQueryRef.current === query) {
      return;
    }
    previousQueryRef.current = query;
    setPage(1);
  });

  const onSubmit = (values: z.infer<typeof querySchema>) => {
    form.setValue("query", values.query);
  };

  if (error) {
    toast({
      title: "Error",
      description: "Error fetching funding requests",
      variant: "destructive",
    });
  }

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
    <div className="flex flex-col my-2">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex w-full items-start gap-2 sm:w-1/2 sm:gap-0"
        >
          <div className="min-w-0 flex-1">
            <FormInputControl
              form={form}
              name="query"
              placeholder="Search..."
            />
          </div>

          <ButtonControl
            type="submit"
            label="Submit"
            className="shrink-0 sm:mx-2"
          />
        </form>
      </Form>
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
            }))}
            initialView="table"
            serverPagination={{
              page,
              pageSize,
              total: totalUsers,
              onPageChange: setPage,
              onPageSizeChange: (nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              },
            }}
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
                        selectedRows as Array<User & { isOwner?: boolean }>,
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
            )}
          />
        )}
      </div>
    </div>
  );
}
