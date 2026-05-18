"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  Check,
  Copy,
  Download,
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
import { DataTable } from "@/components/data-table";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ContactListType } from "@/types";

type ContactList = {
  id: string;
  name: string;
  description?: string;
  type: ContactListType;
  contactCount: number;
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
}

type SenderLabelMode = "default" | "user";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function ContactListsManager({
  teamId,
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
  const [emailSenderLabelMode, setEmailSenderLabelMode] =
    useState<SenderLabelMode>("default");
  const [copiedListId, setCopiedListId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>("updated-desc");

  const { data: listsData, mutate } = useSWR(
    `/api/contact-lists?teamId=${teamId}`,
    fetcher,
  );

  const lists: ContactList[] = useMemo(
    () => (listsData?.data as ContactList[]) || [],
    [listsData],
  );
  const sortedLists = useMemo(() => {
    const sortable = [...lists];
    switch (sortKey) {
      case "name-asc":
        return sortable.sort((a, b) => a.name.localeCompare(b.name));
      case "name-desc":
        return sortable.sort((a, b) => b.name.localeCompare(a.name));
      case "count-desc":
        return sortable.sort((a, b) => b.contactCount - a.contactCount);
      case "count-asc":
        return sortable.sort((a, b) => a.contactCount - b.contactCount);
      case "updated-asc":
        return sortable.sort(
          (a, b) =>
            new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
        );
      default:
        return sortable.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
    }
  }, [lists, sortKey]);
  const isLoading = !listsData;

  const handleDelete = useCallback(async (listId: string, listName: string) => {
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
  }, [mutate, router, teamId, toast]);

  const handleCopyContacts = useCallback(async (list: ContactList) => {
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
          setCopiedListId((current) => (current === list.id ? null : current)),
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
  }, [toast]);

  const buildEmailExport = useCallback((list: ContactList) => {
    const emails = Array.from(
      new Set(
        list.contacts
          .map((contact) => contact.email?.trim())
          .filter((email): email is string => Boolean(email)),
      ),
    );

    return emails.length > 0 ? ["email", ...emails].join("\n") : "";
  }, []);

  const handleExportEmails = useCallback((list: ContactList) => {
    const csvContent = buildEmailExport(list);
    if (!csvContent) {
      toast({
        title: "No emails to export",
        description: "Add contacts with email addresses to export.",
      });
      return;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${list.name.replace(/\s+/g, "-").toLowerCase()}-emails.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [buildEmailExport, toast]);

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

  const getEmailRecipientsFromLists = useCallback((selectedRows: ContactList[]) => {
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
  }, []);

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

  const columns = useMemo<ColumnDef<ContactList>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
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
        accessorKey: "contactCount",
        header: "Contacts",
        cell: ({ row }) => (
          <Badge className="flex w-fit items-center gap-1" variant="secondary">
            <Users className="h-3 w-3" />
            {row.original.contactCount}
          </Badge>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
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
        header: () => <div className="text-right">Actions</div>,
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
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleExportEmails(list)}
                aria-label="Export emails"
                title="Export emails"
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
      handleExportEmails,
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
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="justify-start gap-1"
          onClick={() => handleExportEmails(list)}
          aria-label="Export emails"
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

  return (
    <div className="space-y-6">
      <div>
        <div>
          <h1 className="text-2xl font-semibold">Contact Lists</h1>
          <p className="text-sm text-muted-foreground">
            Organize your contacts for targeted communication and outreach.
          </p>
        </div>
      </div>

      <div className="rounded-md border p-2">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading lists…
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={sortedLists}
            renderCard={renderListCard}
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
                    variant="secondary"
                    size="sm"
                    disabled={
                      isBulkDeleting ||
                      isSendingEmail ||
                      getEmailRecipientsFromLists(selectedRows).length === 0
                    }
                    onClick={() => openEmailDialog(selectedRows)}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Email selected
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isBulkDeleting}
                    onClick={() =>
                      handleDeleteSelected(selectedRows, clearSelection)
                    }
                  >
                    {isBulkDeleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting…
                      </>
                    ) : (
                      "Delete selected"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isBulkDeleting || selectedRows.length === 0}
                    onClick={clearSelection}
                  >
                    Clear
                  </Button>
                </div>
                <ListEmailDialog
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
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={sortKey} onValueChange={setSortKey}>
                  <SelectTrigger className="w-full sm:w-[190px]">
                    <SelectValue placeholder="Sort lists" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updated-desc">
                      Updated (newest)
                    </SelectItem>
                    <SelectItem value="updated-asc">
                      Updated (oldest)
                    </SelectItem>
                    <SelectItem value="name-asc">Name (A–Z)</SelectItem>
                    <SelectItem value="name-desc">Name (Z–A)</SelectItem>
                    <SelectItem value="count-desc">
                      Contacts (high → low)
                    </SelectItem>
                    <SelectItem value="count-asc">
                      Contacts (low → high)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button asChild className="hidden sm:inline-flex">
                  <Link href={`/teams/${teamId}/crm/lists/new`}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add list
                  </Link>
                </Button>
              </div>
            }
          />
        )}
      </div>

      <Link
        href={`/teams/${teamId}/crm/lists/new`}
        aria-label="Add list"
        className="fixed bottom-5 right-5 z-40 sm:hidden"
      >
        <Button
          type="button"
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg"
        >
          <Plus className="h-5 w-5" />
          <span className="sr-only">Add list</span>
        </Button>
      </Link>
    </div>
  );
}

type ListEmailDialogProps = {
  open: boolean;
  recipients: ListEmailRecipient[];
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

const ListEmailDialog = ({
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
                <SelectItem value="default">
                  Default sender label
                </SelectItem>
                <SelectItem value="user">My user name</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The sender address stays the default address configured for
              Transactional Email.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="list-email-subject">Subject</Label>
            <Input
              id="list-email-subject"
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              disabled={isSending}
              placeholder="Email subject"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="list-email-body">Email body</Label>
            <Textarea
              id="list-email-body"
              value={body}
              onChange={(event) => onBodyChange(event.target.value)}
              disabled={isSending}
              placeholder="<p>Hello,</p><p>Write your email here.</p>"
              className="min-h-56 font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              HTML is supported. Duplicate contacts across lists are only
              included once.
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
