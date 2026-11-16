"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  Check,
  Copy,
  Download,
  List,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { EmptyState } from "@/components/design/empty-state";
import { InternalCopyFields } from "@/components/emails/internal-copy-fields";
import { ContactListExportDialog } from "@/components/forms/contact-list-export-dialog";
import { DateCell } from "@/components/records/record-cells";
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
  type OptionFilterDefinition,
  optionFilters,
  recordListFetcher,
  useRecordList,
} from "@/components/records/use-record-list";
import { RichEmailEditor } from "@/components/rich-email-editor";
import { Badge } from "@/components/ui/badge";
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
import {
  DEFAULT_INTERNAL_COPY_MODE,
  type InternalCopyMode,
} from "@/constants/email";
import { useToast } from "@/hooks/use-toast";
import { ContactListType } from "@/types";

type ContactList = {
  id: string;
  name: string;
  description?: string;
  type: ContactListType;
  contactCount: number;
  createdAt?: string | Date;
  updatedAt: string | Date;
  contacts: {
    id: string;
    name: string | null;
    email: string | null;
  }[];
};

type ListEmailRecipient = {
  id: string;
  name: string | null;
  email: string;
};

interface ContactListsManagerProps {
  teamId: string;
  initialPageSize: number;
}

const TYPE_FILTER: OptionFilterDefinition = {
  key: "type",
  label: "Type",
  options: [
    { value: ContactListType.MANUAL, label: "Manual" },
    { value: ContactListType.SMART, label: "Smart" },
  ],
};
const FILTER_MODEL = optionFilters([TYPE_FILTER]);
const FILTER_DEFINITIONS = [optionFilter(TYPE_FILTER)];
const getListRowId = (list: ContactList) => list.id;

type SenderLabelMode = "default" | "user";

const parseEmailList = (value: string) =>
  value
    .split(/[\s,;]+/)
    .map((email) => email.trim())
    .filter(Boolean);

export default function ContactListsManager({
  teamId,
  initialPageSize,
}: ContactListsManagerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState<ListEmailRecipient[]>(
    [],
  );
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [emailInternalCopyMode, setEmailInternalCopyMode] =
    useState<InternalCopyMode>(DEFAULT_INTERNAL_COPY_MODE);
  const [emailSenderLabelMode, setEmailSenderLabelMode] =
    useState<SenderLabelMode>("default");
  const [copiedListId, setCopiedListId] = useState<string | null>(null);
  const [exportingList, setExportingList] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const list = useRecordList({
    viewKey: `lists:team:${teamId}`,
    columnDefaults: {},
    initialPageSize,
    sortFields: [
      "name",
      "description",
      "contactCount",
      "updatedAt",
      "createdAt",
    ],
    views: ["table", "cards"],
    filters: FILTER_MODEL,
  });
  const params = list.getSearchParams({ teamId });
  const typeFilter = list.getFilterValues("type");
  if (typeFilter.length) params.set("types", typeFilter.join(","));
  const {
    data: listsData,
    mutate,
    isLoading,
    isValidating,
  } = useSWR(`/api/contact-lists?${params.toString()}`, recordListFetcher, {
    keepPreviousData: true,
  });

  const lists: ContactList[] = useMemo(
    () => (listsData?.data as ContactList[]) || [],
    [listsData],
  );
  const total = Number(listsData?.total ?? 0);

  const handleDelete = useCallback(
    async (listId: string, listName: string) => {
      if (!confirm(`Are you sure you want to delete "${listName}"?`)) {
        return;
      }

      try {
        setDeletingId(listId);
        const response = await fetch("/api/contact-lists", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            teamId,
            ids: [listId],
          }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody.error || "Failed to delete list");
        }

        toast({
          title: "List deleted",
          description: `${listName} has been removed.`,
        });

        mutate();
        router.refresh();
      } catch (error) {
        toast({
          title: "Unable to delete list",
          description:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred.",
          variant: "destructive",
        });
      } finally {
        setDeletingId(null);
      }
    },
    [mutate, router, teamId, toast],
  );

  const handleCopyContacts = useCallback(
    async (list: ContactList) => {
      if (!list.contacts?.length) {
        toast({
          title: "No contacts to copy",
          description: "Add contacts to this list to copy them.",
        });
        return;
      }

      if (typeof navigator === "undefined" || !navigator.clipboard) {
        toast({
          title: "Clipboard unavailable",
          description: "Copying contacts is not supported in this environment.",
          variant: "destructive",
        });
        return;
      }

      const contactsText = list.contacts
        .map((contact) => {
          const name = contact.name?.trim();
          const email = contact.email?.trim();

          if (name && email) {
            return `${name} <${email}>`;
          }

          if (email) {
            return email;
          }

          return name ?? "";
        })
        .filter((entry) => entry.length > 0)
        .join("\n");

      if (!contactsText) {
        toast({
          title: "Nothing to copy",
          description:
            "Contacts in this list are missing names or emails to copy.",
        });
        return;
      }

      try {
        await navigator.clipboard.writeText(contactsText);
        setCopiedListId(list.id);
        toast({
          title: "Contacts copied",
          description: `Copied ${list.contacts.length} contact${
            list.contacts.length === 1 ? "" : "s"
          } to your clipboard.`,
        });
        setTimeout(
          () =>
            setCopiedListId((current) =>
              current === list.id ? null : current,
            ),
          2000,
        );
      } catch (error) {
        toast({
          title: "Unable to copy contacts",
          description:
            error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const handleDeleteSelected = async (
    selectedRows: ContactList[],
    clearSelection: () => void,
  ) => {
    if (selectedRows.length === 0) {
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to delete ${selectedRows.length} selected list${selectedRows.length === 1 ? "" : "s"}?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsBulkDeleting(true);
      const response = await fetch("/api/contact-lists", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          ids: selectedRows.map((list) => list.id),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to delete lists");
      }

      toast({
        title: "Lists deleted",
        description: `${selectedRows.length} list${selectedRows.length === 1 ? "" : "s"} removed successfully.`,
      });

      clearSelection();
      mutate();
      router.refresh();
    } catch (error) {
      toast({
        title: "Unable to delete lists",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const getEmailRecipientsFromLists = useCallback(
    (selectedRows: ContactList[]) => {
      const recipientsById = new Map<string, ListEmailRecipient>();

      selectedRows.forEach((list) => {
        list.contacts.forEach((contact) => {
          const email = contact.email?.trim();
          if (!email || recipientsById.has(contact.id)) {
            return;
          }

          recipientsById.set(contact.id, {
            id: contact.id,
            name: contact.name,
            email,
          });
        });
      });

      return Array.from(recipientsById.values());
    },
    [],
  );

  const openEmailDialog = (selectedRows: ContactList[]) => {
    const recipients = getEmailRecipientsFromLists(selectedRows);

    if (recipients.length === 0) {
      toast({
        title: "No email recipients",
        description:
          "The selected lists do not contain contacts with email addresses.",
      });
      return;
    }

    setEmailRecipients(recipients);
    setIsEmailDialogOpen(true);
  };

  const handleSendEmail = async (clearSelection: () => void) => {
    const contactIds = emailRecipients.map((contact) => contact.id);
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
      setEmailRecipients([]);
      setEmailSubject("");
      setEmailBody("");
      setEmailBcc("");
      setEmailInternalCopyMode(DEFAULT_INTERNAL_COPY_MODE);
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

  const columns = useMemo<ColumnDef<ContactList, unknown>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        meta: {
          label: "Name",
          sortField: "name",
          width: 280,
          pinned: true,
          alwaysVisible: true,
        },
        cell: ({ row }) => {
          const list = row.original;
          return (
            <div className="flex items-center gap-2">
              <Link
                href={`/teams/${teamId}/crm/lists/${list.id}`}
                className="font-medium hover:underline"
              >
                {list.name}
              </Link>
              <Badge variant="outline" className="text-xs uppercase">
                {list.type === ContactListType.SMART ? "Smart" : "Manual"}
              </Badge>
            </div>
          );
        },
      },
      {
        id: "contactCount",
        accessorKey: "contactCount",
        meta: { label: "Contacts", sortField: "contactCount", width: 120 },
        cell: ({ row }) => (
          <Badge className="flex w-fit items-center gap-1" variant="secondary">
            <Users className="h-3 w-3" />
            {row.original.contactCount}
          </Badge>
        ),
      },
      {
        id: "updatedAt",
        meta: { label: "Updated", sortField: "updatedAt", width: 140 },
        cell: ({ row }) => <DateCell value={row.original.updatedAt} />,
      },
      {
        id: "description",
        accessorKey: "description",
        meta: { label: "Description", sortField: "description", width: 360 },
        cell: ({ row }) =>
          row.original.description ? (
            <p className="max-w-[360px] truncate text-sm text-muted-foreground">
              {row.original.description}
            </p>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        meta: { label: "Actions", width: 180, align: "right" },
        cell: ({ row }) => {
          const list = row.original;
          return (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleCopyContacts(list)}
                aria-label="Copy contacts"
                title="Copy contacts"
              >
                {copiedListId === list.id ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  setExportingList({ id: list.id, name: list.name })
                }
                aria-label="Export list"
                title="Export list"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                asChild
                variant="ghost"
                size="icon"
                aria-label="Edit list"
              >
                <Link href={`/teams/${teamId}/crm/lists/${list.id}`}>
                  <Pencil className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(list.id, list.name)}
                aria-label="Delete list"
                disabled={deletingId === list.id || isBulkDeleting}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    [
      teamId,
      copiedListId,
      deletingId,
      handleCopyContacts,
      handleDelete,
      isBulkDeleting,
    ],
  );

  const renderListCard = (list: ContactList) => (
    <div className="rounded-lg border bg-card p-4">
      <div className="space-y-2">
        <div className="min-w-0">
          <Link
            href={`/teams/${teamId}/crm/lists/${list.id}`}
            className="block break-words text-base font-semibold leading-tight hover:underline"
          >
            {list.name}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs uppercase">
            {list.type === ContactListType.SMART ? "Smart" : "Manual"}
          </Badge>
          <Badge className="flex w-fit items-center gap-1" variant="secondary">
            <Users className="h-3 w-3" />
            {list.contactCount}
          </Badge>
        </div>
      </div>
      <div className="mt-3 break-words text-sm text-muted-foreground">
        {list.description || "No description"}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="justify-start gap-1"
          onClick={() => handleCopyContacts(list)}
          aria-label="Copy contacts"
        >
          {copiedListId === list.id ? (
            <Check className="h-4 w-4 text-success" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="justify-start gap-1"
          onClick={() => setExportingList({ id: list.id, name: list.name })}
          aria-label="Export list"
        >
          <Download className="h-4 w-4" />
          Export
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="justify-start gap-1"
        >
          <Link href={`/teams/${teamId}/crm/lists/${list.id}`}>
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="justify-start gap-1 border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
          onClick={() => handleDelete(list.id, list.name)}
          aria-label="Delete list"
          disabled={deletingId === list.id || isBulkDeleting}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  );

  const newListHref = `/teams/${teamId}/crm/lists/new`;

  return (
    <RecordsPage>
      <RecordsHeader
        icon={List}
        title="Lists"
        count={isLoading ? undefined : total}
        action={
          <Button asChild variant="action" size="sm">
            <Link href={newListHref}>
              <Plus /> Add list
            </Link>
          </Button>
        }
      />

      <RecordListToolbar
        list={list}
        columns={columns}
        filters={FILTER_DEFINITIONS}
        searchLabel="Search lists"
        isRefreshing={isValidating && !isLoading}
      />

      <RecordTable
        columns={columns}
        data={lists}
        getRowId={getListRowId}
        getRowHref={(item) => `/teams/${teamId}/crm/lists/${item.id}`}
        isLoading={isLoading}
        emptyState={
          list.isSearching ? (
            <NoMatchState noun="lists" onClear={list.handleClearAll} />
          ) : (
            <EmptyState
              size="page"
              icon={List}
              title="No lists yet"
              description="Organize your contacts for targeted communication and outreach."
              action={
                <Button asChild variant="action">
                  <Link href={newListHref}>
                    <Plus /> Add list
                  </Link>
                </Button>
              }
            />
          )
        }
        noun={{ one: "list", other: "lists" }}
        sorts={list.sorts}
        onSortsChange={list.setSorts}
        columnVisibility={list.columnVisibility.visibility}
        view={list.view === "cards" ? "cards" : "table"}
        renderCards={(rows) => rows.map((row) => renderListCard(row))}
        pagination={{ ...list.pagination, total }}
        selectable
        renderBulkActions={({ selectedRows, clearSelection }) => (
          <>
            <BulkActionButton
              disabled={
                isBulkDeleting ||
                isSendingEmail ||
                getEmailRecipientsFromLists(selectedRows).length === 0
              }
              onClick={() => openEmailDialog(selectedRows)}
            >
              <Mail /> Email
            </BulkActionButton>
            <BulkActionButton
              tone="destructive"
              disabled={isBulkDeleting}
              onClick={() => handleDeleteSelected(selectedRows, clearSelection)}
            >
              {isBulkDeleting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Trash2 />
              )}
              Delete
            </BulkActionButton>
            <ListEmailDialog
              open={isEmailDialogOpen}
              recipients={emailRecipients}
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

      <ContactListExportDialog
        open={!!exportingList}
        onOpenChange={(open) => !open && setExportingList(null)}
        list={exportingList}
        teamId={teamId}
      />
    </RecordsPage>
  );
}

type ListEmailDialogProps = {
  open: boolean;
  recipients: ListEmailRecipient[];
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

const ListEmailDialog = ({
  open,
  recipients,
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
}: ListEmailDialogProps) => {
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
          <DialogTitle>Send email to selected lists</DialogTitle>
          <DialogDescription>
            Sends one email per unique contact through the Scaleway
            Transactional Email integration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            {recipients.length} unique recipient
            {recipients.length === 1 ? "" : "s"} with email selected
            {recipients.length > 100
              ? ". Reduce the selection to 100 recipients or fewer."
              : "."}
          </div>

          <div className="space-y-2">
            <Label htmlFor="list-email-sender">Sender</Label>
            <Select
              value={senderLabelMode}
              onValueChange={(value) =>
                onSenderLabelModeChange(value as SenderLabelMode)
              }
              disabled={isSending}
            >
              <SelectTrigger id="list-email-sender">
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
            <Label htmlFor="list-message-subject">Subject</Label>
            <Input
              id="list-message-subject"
              name="subject"
              autoComplete="off"
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              disabled={isSending}
              placeholder="Email subject"
            />
          </div>

          <InternalCopyFields
            idPrefix="list-email"
            emails={bcc}
            mode={internalCopyMode}
            disabled={isSending}
            onEmailsChange={onBccChange}
            onModeChange={onInternalCopyModeChange}
          />

          <div className="space-y-2">
            <Label htmlFor="list-email-body">Email body</Label>
            <RichEmailEditor
              id="list-email-body"
              value={body}
              onChange={onBodyChange}
              disabled={isSending}
              previewDescription="Use the toolbar to format the message. Duplicate contacts across lists are only included once."
            />
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
                Sending…
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
