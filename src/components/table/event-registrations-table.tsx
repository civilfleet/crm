"use client";

import { Loader2, Mail, Send } from "lucide-react";
import { useState } from "react";
import { DataTable } from "@/components/data-table";
import {
  type EventRegistrationRow,
  eventRegistrationColumns,
  renderEventRegistrationCard,
} from "@/components/table/event-registration-columns";
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
import { useToast } from "@/hooks/use-toast";

interface EventRegistrationsTableProps {
  teamId: string;
  registrations: EventRegistrationRow[];
}

type SenderLabelMode = "default" | "user";

export default function EventRegistrationsTable({
  teamId,
  registrations,
}: EventRegistrationsTableProps) {
  const { toast } = useToast();
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState<
    EventRegistrationRow[]
  >([]);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSenderLabelMode, setEmailSenderLabelMode] =
    useState<SenderLabelMode>("default");

  const openEmailDialog = (selectedRows: EventRegistrationRow[]) => {
    const recipientsByContactId = new Map<string, EventRegistrationRow>();
    selectedRows.forEach((registration) => {
      if (
        !registration.contactId ||
        recipientsByContactId.has(registration.contactId)
      ) {
        return;
      }
      recipientsByContactId.set(registration.contactId, registration);
    });

    const recipients = Array.from(recipientsByContactId.values());
    if (recipients.length === 0) {
      toast({
        title: "No registrants selected",
        description: "Select at least one registrant before sending an email.",
      });
      return;
    }

    setEmailRecipients(recipients);
    setIsEmailDialogOpen(true);
  };

  const handleSendEmail = async (clearSelection: () => void) => {
    const contactIds = emailRecipients.map(
      (registration) => registration.contactId,
    );
    if (contactIds.length === 0) {
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
            contactIds,
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
      setEmailRecipients([]);
      setEmailSubject("");
      setEmailBody("");
      setEmailSenderLabelMode("default");
      clearSelection();
    } catch (error) {
      toast({
        title: "Unable to send email",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <DataTable
      columns={eventRegistrationColumns}
      data={registrations}
      renderCard={renderEventRegistrationCard}
      initialView="table"
      selectable
      renderBatchActions={({ selectedRows, clearSelection }) => (
        <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
          <div className="text-sm text-muted-foreground">
            {selectedRows.length} registrant
            {selectedRows.length === 1 ? "" : "s"} selected
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => openEmailDialog(selectedRows)}
              disabled={selectedRows.length === 0}
            >
              <Mail className="mr-2 h-4 w-4" />
              Send email
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSendingEmail}
              onClick={clearSelection}
            >
              Clear
            </Button>
          </div>
          <EventRegistrantsEmailDialog
            open={isEmailDialogOpen}
            recipients={emailRecipients}
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
  );
}

type EventRegistrantsEmailDialogProps = {
  open: boolean;
  recipients: EventRegistrationRow[];
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

const EventRegistrantsEmailDialog = ({
  open,
  recipients,
  subject,
  body,
  senderLabelMode,
  isSending,
  onOpenChange,
  onSubjectChange,
  onBodyChange,
  onSenderLabelModeChange,
  onSend,
}: EventRegistrantsEmailDialogProps) => {
  const canSend =
    recipients.length > 0 &&
    recipients.length <= 100 &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !isSending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send email to selected registrants</DialogTitle>
          <DialogDescription>
            Sends one email per unique linked contact through the Scaleway
            Transactional Email integration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            {recipients.length} unique recipient
            {recipients.length === 1 ? "" : "s"} selected
            {recipients.length > 100
              ? ". Reduce the selection to 100 recipients or fewer."
              : "."}
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-registrants-email-sender">Sender</Label>
            <Select
              value={senderLabelMode}
              onValueChange={(value) =>
                onSenderLabelModeChange(value as SenderLabelMode)
              }
              disabled={isSending}
            >
              <SelectTrigger id="event-registrants-email-sender">
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
            <Label htmlFor="event-registrants-email-subject">Subject</Label>
            <Input
              id="event-registrants-email-subject"
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              disabled={isSending}
              placeholder="Email subject"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-registrants-email-body">Email body</Label>
            <Textarea
              id="event-registrants-email-body"
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