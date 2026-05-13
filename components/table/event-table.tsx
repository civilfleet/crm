"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import ButtonControl from "@/components/helper/button-control";
import FormInputControl from "@/components/helper/form-input-control";
import TableLoadingState from "@/components/loading/table-loading-state";
import {
  type EventRow,
  eventColumns,
  renderEventCard,
} from "@/components/table/event-columns";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface EventTableProps {
  teamId: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const querySchema = z.object({
  query: z.string(),
  eventTypeId: z.string().optional(),
  state: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export default function EventTable({ teamId }: EventTableProps) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<z.infer<typeof querySchema>>({
    resolver: zodResolver(querySchema),
    defaultValues: {
      query: "",
      eventTypeId: "all",
      state: "",
      from: "",
      to: "",
    },
  });

  const query = form.watch("query");
  const eventTypeId = form.watch("eventTypeId");
  const stateFilter = form.watch("state");
  const fromDate = form.watch("from");
  const toDate = form.watch("to");

  useEffect(() => {
    form.register("eventTypeId");
  }, [form]);

  const { data: eventTypesData } = useSWR(
    `/api/event-types?teamId=${teamId}`,
    fetcher,
  );
  const eventTypes = eventTypesData?.data || [];

  const filtersQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (eventTypeId && eventTypeId !== "all") {
      params.set("eventTypeId", eventTypeId);
    }
    if (stateFilter?.trim()) {
      params.set("state", stateFilter.trim());
    }
    if (fromDate) {
      params.set("from", fromDate);
    }
    if (toDate) {
      params.set("to", toDate);
    }
    const stringified = params.toString();
    return stringified ? `&${stringified}` : "";
  }, [eventTypeId, stateFilter, fromDate, toDate]);

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/events?teamId=${teamId}&query=${encodeURIComponent(query)}${filtersQuery}`,
    fetcher,
  );

  const events = useMemo<EventRow[]>(() => {
    if (!data?.data) {
      return [];
    }

    return data.data as EventRow[];
  }, [data]);

  if (error) {
    toast({
      title: "Unable to load events",
      description: "An unexpected error occurred while fetching events.",
      variant: "destructive",
    });
  }

  const handleSubmit = (values: z.infer<typeof querySchema>) => {
    form.setValue("query", values.query);
  };

  const handleResetFilters = () => {
    form.reset({
      query: "",
      eventTypeId: "all",
      state: "",
      from: "",
      to: "",
    });
  };

  const handleDeleteSelected = async (
    selectedRows: EventRow[],
    clearSelection: () => void,
  ) => {
    if (selectedRows.length === 0) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch("/api/events", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          ids: selectedRows.map((event) => event.id),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to delete events");
      }

      toast({
        title: "Events deleted",
        description: `${selectedRows.length} event${
          selectedRows.length > 1 ? "s" : ""
        } removed successfully.`,
      });

      clearSelection();
      await mutate();
    } catch (deleteError) {
      toast({
        title: "Unable to delete events",
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

  return (
    <div className="flex flex-col gap-4 my-4">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex flex-wrap items-end gap-3"
        >
          <FormInputControl
            form={form}
            name="query"
            placeholder="Search events"
          />
          <FormInputControl form={form} name="state" placeholder="State" />
          <FormInputControl
            form={form}
            name="from"
            placeholder="From"
            type="date"
          />
          <FormInputControl
            form={form}
            name="to"
            placeholder="To"
            type="date"
          />
          <div className="min-w-[200px]">
            <Select
              onValueChange={(value) => form.setValue("eventTypeId", value)}
              value={form.getValues("eventTypeId") || "all"}
            >
              <SelectTrigger>
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {eventTypes.map((type: { id: string; name: string }) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ButtonControl type="submit" label="Search" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
          >
            Reset
          </Button>
        </form>
      </Form>

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
            columns={eventColumns}
            data={events}
            renderCard={renderEventCard}
            initialView="table"
            toolbar={
              <Link
                href={`/teams/${teamId}/crm/events/create`}
                aria-label="Add event"
              >
                <Button
                  type="button"
                  size="sm"
                  className="hidden gap-2 px-3 sm:inline-flex"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add event</span>
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
              </div>
            )}
          />
        )}
      </div>

      <Link
        href={`/teams/${teamId}/crm/events/create`}
        aria-label="Add event"
        className="fixed bottom-5 right-5 z-40 sm:hidden"
      >
        <Button
          type="button"
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg"
        >
          <Plus className="h-5 w-5" />
          <span className="sr-only">Add event</span>
        </Button>
      </Link>
    </div>
  );
}