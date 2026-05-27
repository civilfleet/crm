"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail, Plus, Send } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface EventTableProps {
  teamId: string;
}

type SenderLabelMode = "default" | "user";

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
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailEvents, setEmailEvents] = useState<EventRow[]>([]);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSenderLabelMode, setEmailSenderLabelMode] =
    useState<SenderLabelMode>("default");

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

  const openEmailDialog = (selectedRows: EventRow[]) => {
    const eventsWithRegistrants = selectedRows.filter(
      (event) => event.registrationCount > 0,
    );

    if (eventsWithRegistrants.length === 0) {
      toast({
        title: "No registrants",
        description:
          "The selected events do not have registrants to email yet.",
      });
      return;
    }

    setEmailEvents(eventsWithRegistrants);
    setIsEmailDialogOpen(true);
  };

  const handleSendEmail = async (clearSelection: () => void) => {
    const eventIds = emailEvents.map((event) => event.id);
    if (eventIds.length === 0) {
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
            eventIds,
            subject: emailSubject,
            html: emailBody,
            senderLabelMode: emailSenderLabelMode,
          }),
        },
      );

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || "Failed to send email");
      }

      const result = json.data as {
        requested: number;
        skipped: number;
      };

      toast({
        title: "Email batch queued",
        description: `${result.requested - result.skipped} email${
          result.requested - result.skipped === 1 ? "" : "s"
        } queued for worker delivery. ${result.skipped} skipped.`,
      });

      setIsEmailDialogOpen(false);
      setEmailEvents([]);
      setEmailSubject("");
      setEmailBody("");
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
                    size="sm"
                    disabled={
                      isDeleting || isSendingEmail || selectedRows.length === 0
                    }
                    onClick={() => openEmailDialog(selectedRows)}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Send email
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
                </div>
                <EventEmailDialog
                  open={isEmailDialogOpen}
                  events={emailEvents}
                  subject={emailSubject}
                  body={emailBody}
                  senderLabelMode={emailSenderLabelMode}
                  isSending={isSendingEmail}
                  onOpenChange={setIsEmailDialogOpen}
                  onSubjectChange={setEmailSubject}
                  onBodyChange={setEmailBody}
                  onSenderLabelModeChange={setEmailSenderLabelMode}
                  onSend={() => handleSendEmail(clearSelection)}
                />
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

type EventEmailDialogProps = {
  open: boolean;
  events: EventRow[];
  subject: string;
  body: string;
  senderLabelMode: SenderLabelMode;
  isSending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSenderLabelModeChange: (value: SenderLabelMode) => void;
  onSend: () => void;
};

const EventEmailDialog = ({
  open,
  events,
  subject,
  body,
  senderLabelMode,
  isSending,
  onOpenChange,
  onSubjectChange,
  onBodyChange,
  onSenderLabelModeChange,
  onSend,
}: EventEmailDialogProps) => {
  const registrantCount = events.reduce(
    (total, event) => total + event.registrationCount,
    0,
  );
  const canSend =
    events.length > 0 &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !isSending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send email to event registrants</DialogTitle>
          <DialogDescription>
            Sends one email per unique registrant contact through the Scaleway
            Transactional Email integration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            {events.length} event{events.length === 1 ? "" : "s"} selected with{" "}
            {registrantCount} current registrant
            {registrantCount === 1 ? "" : "s"}. Duplicate contacts across events
            are only included once.
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-email-sender">Sender</Label>
            <Select
              value={senderLabelMode}
              onValueChange={(value) =>
                onSenderLabelModeChange(value as SenderLabelMode)
              }
              disabled={isSending}
            >
              <SelectTrigger id="event-email-sender">
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
            <Label htmlFor="event-email-subject">Subject</Label>
            <Input
              id="event-email-subject"
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              disabled={isSending}
              placeholder="Email subject"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-email-body">Email body</Label>
            <Textarea
              id="event-email-body"
              value={body}
              onChange={(event) => onBodyChange(event.target.value)}
              disabled={isSending}
              placeholder="<p>Hello,</p><p>Write your email here.</p>"
              className="min-h-56 font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              HTML is supported. Successful sends are logged in each contact's
              engagement history.
            </p>
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
