"use client";

import { Calendar, Loader2, Mail, Plus, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { EmptyState } from "@/components/design/empty-state";
import { InternalCopyFields } from "@/components/emails/internal-copy-fields";
import EventCalendar from "@/components/events/event-calendar";
import {
  type ListFilter,
  type ListFilterKind,
  listFilterDefinitions,
  listFilterModel,
} from "@/components/records/list-filters";
import {
  NoMatchState,
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
  recordListFetcher,
  useRecordList,
} from "@/components/records/use-record-list";
import {
  EVENT_COLUMN_DEFAULTS,
  type EventRow,
  eventColumns,
  eventHref,
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
import {
  DEFAULT_INTERNAL_COPY_MODE,
  type InternalCopyMode,
} from "@/constants/email";
import { useToast } from "@/hooks/use-toast";

interface EventTableProps {
  teamId: string;
  initialPageSize: number;
  /** More actions in the header, e.g. the link to the public events page. */
  headerActions?: React.ReactNode;
}

type SenderLabelMode = "default" | "user";

const parseEmailList = (value: string) =>
  value
    .split(/[\s,;]+/)
    .map((email) => email.trim())
    .filter(Boolean);

const getEventRowId = (event: EventRow) => event.id;

// The types load from the server; the state and dates are free.
const STATIC_FILTERS: ListFilterKind[] = [
  { key: "state", label: "State", type: "text", placeholder: "e.g. Bayern" },
  { key: "startDate", label: "Start date", type: "dateRange" },
];
const FILTER_MODEL = listFilterModel([
  {
    key: "type",
    label: "Type",
    type: "options",
    options: [],
    dynamicOptions: true,
  },
  ...STATIC_FILTERS,
]);

export default function EventTable({
  teamId,
  initialPageSize,
  headerActions,
}: EventTableProps) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailEvents, setEmailEvents] = useState<EventRow[]>([]);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [emailInternalCopyMode, setEmailInternalCopyMode] =
    useState<InternalCopyMode>(DEFAULT_INTERNAL_COPY_MODE);
  const [emailSenderLabelMode, setEmailSenderLabelMode] =
    useState<SenderLabelMode>("default");

  const list = useRecordList<ListFilter, "table" | "cards" | "calendar">({
    viewKey: `events:team:${teamId}`,
    columnDefaults: EVENT_COLUMN_DEFAULTS,
    initialPageSize,
    sortFields: getSortFields(eventColumns),
    views: ["table", "cards", "calendar"],
    filters: FILTER_MODEL,
  });

  const { data: eventTypesData } = useSWR<{
    data?: Array<{ id: string; name: string }>;
  }>(`/api/event-types?teamId=${teamId}`, recordListFetcher);
  const filterDefinitions = useMemo(
    () =>
      listFilterDefinitions([
        {
          key: "type",
          label: "Type",
          type: "options",
          options: (eventTypesData?.data ?? []).map((type) => ({
            value: type.id,
            label: type.name,
          })),
        },
        ...STATIC_FILTERS,
      ]),
    [eventTypesData?.data],
  );

  const params = list.getSearchParams({ teamId });
  const typeFilter = list.getFilterValues("type");
  if (typeFilter.length) params.set("eventTypeIds", typeFilter.join(","));
  const stateFilter = list.getFilter("state") as ListFilter | undefined;
  if (stateFilter?.text?.trim()) params.set("state", stateFilter.text.trim());
  const dateFilter = list.getFilter("startDate") as ListFilter | undefined;
  if (dateFilter?.from) params.set("from", dateFilter.from);
  if (dateFilter?.to) params.set("to", dateFilter.to);

  const isCalendar = list.view === "calendar";
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    isCalendar ? null : `/api/events?${params.toString()}`,
    recordListFetcher,
    { keepPreviousData: true },
  );
  const events: EventRow[] = Array.isArray(data?.data) ? data.data : [];
  const total = Number(data?.total ?? 0);

  useEffect(() => {
    if (!error) return;
    toast({
      title: "Unable to load events",
      description: "An unexpected error occurred while fetching events.",
      variant: "destructive",
    });
  }, [error, toast]);

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
            bccEmails: parseEmailList(emailBcc),
            internalCopyMode: emailInternalCopyMode,
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
      setEmailBcc("");
      setEmailInternalCopyMode(DEFAULT_INTERNAL_COPY_MODE);
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

  const newEventHref = `/teams/${teamId}/crm/events/create`;

  return (
    <RecordsPage>
      <RecordsHeader
        icon={Calendar}
        title="Events"
        count={isLoading || isCalendar ? undefined : total}
        action={
          <>
            {headerActions}
            <Button asChild variant="action" size="sm">
              <Link href={newEventHref}>
                <Plus /> Add event
              </Link>
            </Button>
          </>
        }
      />

      <RecordListToolbar
        list={list}
        columns={eventColumns}
        filters={isCalendar ? [] : filterDefinitions}
        searchLabel="Search events"
        isRefreshing={isValidating && !isLoading}
      />

      {isCalendar ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <EventCalendar teamId={teamId} />
        </div>
      ) : (
        <RecordTable
          columns={eventColumns}
          data={events}
          getRowId={getEventRowId}
          getRowHref={eventHref}
          isLoading={isLoading}
          emptyState={
            list.isSearching ? (
              <NoMatchState noun="events" onClear={list.handleClearAll} />
            ) : (
              <EmptyState
                size="page"
                icon={Calendar}
                title="No events yet"
                description="Plan an event and track who takes part."
                action={
                  <Button asChild variant="action">
                    <Link href={newEventHref}>
                      <Plus /> Add event
                    </Link>
                  </Button>
                }
              />
            )
          }
          noun={{ one: "event", other: "events" }}
          sorts={list.sorts}
          onSortsChange={list.setSorts}
          columnVisibility={list.columnVisibility.visibility}
          view={list.view === "cards" ? "cards" : "table"}
          renderCards={(rows) => rows.map(renderEventCard)}
          pagination={{ ...list.pagination, total }}
          selectable
          renderBulkActions={({ selectedRows, clearSelection }) => (
            <>
              <BulkActionButton
                disabled={isDeleting || isSendingEmail}
                onClick={() => openEmailDialog(selectedRows)}
              >
                <Mail /> Send email
              </BulkActionButton>
              <BulkActionButton
                tone="destructive"
                disabled={isDeleting}
                onClick={() =>
                  handleDeleteSelected(selectedRows, clearSelection)
                }
              >
                {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Delete
              </BulkActionButton>
              <EventEmailDialog
                open={isEmailDialogOpen}
                events={emailEvents}
                subject={emailSubject}
                body={emailBody}
                bcc={emailBcc}
                internalCopyMode={emailInternalCopyMode}
                senderLabelMode={emailSenderLabelMode}
                isSending={isSendingEmail}
                onOpenChange={setIsEmailDialogOpen}
                onSubjectChange={setEmailSubject}
                onBodyChange={setEmailBody}
                onBccChange={setEmailBcc}
                onInternalCopyModeChange={setEmailInternalCopyMode}
                onSenderLabelModeChange={setEmailSenderLabelMode}
                onSend={() => handleSendEmail(clearSelection)}
              />
            </>
          )}
        />
      )}
    </RecordsPage>
  );
}

type EventEmailDialogProps = {
  open: boolean;
  events: EventRow[];
  subject: string;
  body: string;
  bcc: string;
  internalCopyMode: InternalCopyMode;
  senderLabelMode: SenderLabelMode;
  isSending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onBccChange: (value: string) => void;
  onInternalCopyModeChange: (value: InternalCopyMode) => void;
  onSenderLabelModeChange: (value: SenderLabelMode) => void;
  onSend: () => void;
};

const EventEmailDialog = ({
  open,
  events,
  subject,
  body,
  bcc,
  internalCopyMode,
  senderLabelMode,
  isSending,
  onOpenChange,
  onSubjectChange,
  onBodyChange,
  onBccChange,
  onInternalCopyModeChange,
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
            <Label htmlFor="event-message-subject">Subject</Label>
            <Input
              id="event-message-subject"
              name="subject"
              autoComplete="off"
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              disabled={isSending}
              placeholder="Email subject"
            />
          </div>

          <InternalCopyFields
            idPrefix="event-email"
            emails={bcc}
            mode={internalCopyMode}
            disabled={isSending}
            onEmailsChange={onBccChange}
            onModeChange={onInternalCopyModeChange}
          />

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
