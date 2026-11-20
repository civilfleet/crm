"use client";

import {
  Download,
  GitMerge,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Upload,
  Users as UsersIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { EmptyState } from "@/components/design/empty-state";
import { Switcher } from "@/components/design/switcher";
import { InternalCopyFields } from "@/components/emails/internal-copy-fields";
import { ContactExportDialog } from "@/components/forms/contact-export-dialog";
import { SaveSmartListButton } from "@/components/forms/save-smart-list-dialog";
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
import { RichEmailEditor } from "@/components/rich-email-editor";
import {
  type ContactRow,
  contactColumns,
  renderContactCard,
} from "@/components/table/contact-columns";
import {
  type ContactListFilter,
  contactFilterModel,
  toContactApiFilters,
  useContactFilterDefinitions,
} from "@/components/table/contact-filters";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import {
  buildDefaultContactImportSourceMapping,
  CONTACT_IMPORT_FIELDS,
  type ContactImportField,
  type ContactImportSourceMapping,
  hasContactNameMapping,
  toContactImportColumnMapping,
} from "@/lib/contact-csv-import";
import { parseCsv } from "@/lib/csv";
import type { VCardContact } from "@/lib/vcard";
import { ContactEmailKind } from "@/types";

const ContactMap = dynamic(() => import("@/components/contacts/contact-map"), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

interface ContactTableProps {
  teamId: string;
  initialPageSize: number;
}

type SenderLabelMode = "default" | "user";

type MergeEmail = {
  email: string;
  kind: ContactEmailKind.ALIAS | ContactEmailKind.SHARED;
  label?: string;
};

type MergeConflict = {
  field: string;
  values: Array<{
    contactId: string;
    value: unknown;
  }>;
};

type MergePreview = {
  contacts: ContactRow[];
  conflicts: MergeConflict[];
};

const encodeMergeValue = (value: unknown) => JSON.stringify(value ?? null);

const decodeMergeValue = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const formatMergeValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return "Empty";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
};

const parseEmailList = (value: string) =>
  value
    .split(/[\s,;]+/)
    .map((email) => email.trim())
    .filter(Boolean);

const getContactRowId = (contact: ContactRow) => contact.id;

export default function ContactTable({
  teamId,
  initialPageSize,
}: ContactTableProps) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importPreviewRows, setImportPreviewRows] = useState<string[][]>([]);
  const [importFormat, setImportFormat] = useState<"csv" | "vcf">("csv");
  const [importVCardContacts, setImportVCardContacts] = useState<
    VCardContact[]
  >([]);
  const [importSourceMapping, setImportSourceMapping] =
    useState<ContactImportSourceMapping>({});
  const [importResult, setImportResult] = useState<ContactImportResult | null>(
    null,
  );
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [isMergePreviewLoading, setIsMergePreviewLoading] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
  const [mergeRows, setMergeRows] = useState<ContactRow[]>([]);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergePrimaryEmail, setMergePrimaryEmail] = useState("");
  const [mergeEmails, setMergeEmails] = useState<MergeEmail[]>([]);
  const [mergeFieldSelections, setMergeFieldSelections] = useState<
    Record<string, string>
  >({});
  const [emailRecipients, setEmailRecipients] = useState<ContactRow[]>([]);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [emailInternalCopyMode, setEmailInternalCopyMode] =
    useState<InternalCopyMode>(DEFAULT_INTERNAL_COPY_MODE);
  const [emailSenderLabelMode, setEmailSenderLabelMode] =
    useState<SenderLabelMode>("default");
  const [showTrash, setShowTrash] = useState(false);

  const list = useRecordList<ContactListFilter, "table" | "cards" | "map">({
    viewKey: `contacts:team:${teamId}`,
    columnDefaults: {},
    initialPageSize,
    sortFields: getSortFields(contactColumns),
    views: ["table", "cards", "map"],
    filters: contactFilterModel,
  });
  const params = list.getSearchParams({ teamId });
  if (list.activeFilters.length) {
    params.set(
      "filters",
      JSON.stringify(toContactApiFilters(list.activeFilters)),
    );
  }
  if (showTrash) params.set("deleted", "true");

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/contacts?${params.toString()}`,
    recordListFetcher,
    { keepPreviousData: true },
  );
  const contacts = useMemo<ContactRow[]>(
    () => (Array.isArray(data?.data) ? (data.data as ContactRow[]) : []),
    [data],
  );
  const totalContacts = Number(data?.total ?? 0);

  const filterDefinitions = useContactFilterDefinitions(teamId);

  useEffect(() => {
    if (!error) return;
    toast({
      title: "Unable to load contacts",
      description: "An unexpected error occurred while fetching contacts.",
      variant: "destructive",
    });
  }, [error, toast]);

  const renderCard = (contact: ContactRow) =>
    renderContactCard(contact, teamId);

  const handleContactAction = async (
    action: "trash" | "restore" | "delete",
    selectedRows: ContactRow[],
    clearSelection: () => void,
  ) => {
    if (selectedRows.length === 0) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(
        action === "trash" ? "/api/contacts" : "/api/contacts/trash",
        {
          method: action === "restore" ? "PATCH" : "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            teamId,
            ids: selectedRows.map((contact) => contact.id),
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to update contacts");
      }

      const result = await response.json();
      const count = Number(result?.data?.count ?? 0);
      if (count === 0) {
        throw new Error("No matching contacts were updated.");
      }
      const plural = count === 1 ? "contact" : "contacts";
      toast({
        title:
          action === "trash"
            ? `${count} ${plural} moved to trash`
            : action === "restore"
              ? `${count} ${plural} restored`
              : `${count} ${plural} permanently deleted`,
        description:
          action === "trash"
            ? "You can restore them from the trash."
            : action === "restore"
              ? "They are available in active contacts again."
              : "This action cannot be undone.",
      });

      clearSelection();
      await mutate();
    } catch (actionError) {
      toast({
        title: "Unable to update contacts",
        description:
          actionError instanceof Error
            ? actionError.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSelected = async (
    selectedRows: ContactRow[],
    clearSelection: () => void,
  ) => {
    await handleContactAction("trash", selectedRows, clearSelection);
  };

  const handleRestoreSelected = async (
    selectedRows: ContactRow[],
    clearSelection: () => void,
  ) => {
    await handleContactAction("restore", selectedRows, clearSelection);
  };

  const handlePermanentlyDeleteSelected = async (
    selectedRows: ContactRow[],
    clearSelection: () => void,
  ) => {
    await handleContactAction("delete", selectedRows, clearSelection);
  };

  const openEmailDialog = (selectedRows: ContactRow[]) => {
    setEmailRecipients(selectedRows);
    setIsEmailDialogOpen(true);
  };

  const openMergeDialog = async (selectedRows: ContactRow[]) => {
    if (selectedRows.length < 2) {
      return;
    }

    setMergeRows(selectedRows);
    setMergePreview(null);
    setMergeTargetId(selectedRows[0].id);
    setMergePrimaryEmail(selectedRows[0].email ?? "");
    setMergeEmails([]);
    setMergeFieldSelections({});
    setIsMergeDialogOpen(true);
    setIsMergePreviewLoading(true);

    try {
      const response = await fetch("/api/contacts/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          contactIds: selectedRows.map((row) => row.id),
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json.error || "Failed to load merge preview");
      }

      const preview = json.data as MergePreview;
      const target = preview.contacts.find(
        (contact) => contact.id === selectedRows[0].id,
      );
      const allEmails = preview.contacts.flatMap((contact) => [
        ...(contact.email
          ? [
              {
                email: contact.email,
                kind: ContactEmailKind.ALIAS,
                label: undefined,
              } satisfies MergeEmail,
            ]
          : []),
        ...(contact.additionalEmails ?? []).map((entry) => ({
          email: entry.email,
          kind:
            entry.kind === ContactEmailKind.SHARED
              ? ContactEmailKind.SHARED
              : ContactEmailKind.ALIAS,
          label: entry.label,
        })),
      ]);
      const primaryEmail = target?.email ?? allEmails[0]?.email ?? "";
      const uniqueEmails = new Map<string, MergeEmail>();

      allEmails.forEach((entry) => {
        const key = entry.email.trim().toLowerCase();
        if (!key || key === primaryEmail.trim().toLowerCase()) {
          return;
        }
        if (!uniqueEmails.has(key)) {
          uniqueEmails.set(key, {
            ...entry,
            email: key,
            kind:
              entry.kind === ContactEmailKind.SHARED
                ? ContactEmailKind.SHARED
                : ContactEmailKind.ALIAS,
          });
        }
      });

      setMergePreview(preview);
      setMergePrimaryEmail(primaryEmail);
      setMergeEmails(Array.from(uniqueEmails.values()));
      setMergeFieldSelections(
        Object.fromEntries(
          preview.conflicts.map((conflict) => [
            conflict.field,
            encodeMergeValue(
              conflict.values.find(
                (entry) => entry.contactId === selectedRows[0].id,
              )?.value ??
                conflict.values.find((entry) => entry.value !== null)?.value ??
                null,
            ),
          ]),
        ),
      );
    } catch (error) {
      toast({
        title: "Unable to prepare merge",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
      setIsMergeDialogOpen(false);
    } finally {
      setIsMergePreviewLoading(false);
    }
  };

  const handleMergeContacts = async (clearSelection: () => void) => {
    if (!mergeTargetId || !mergePrimaryEmail) {
      return;
    }

    setIsMerging(true);
    try {
      const response = await fetch("/api/contacts/merge", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          targetContactId: mergeTargetId,
          sourceContactIds: mergeRows
            .map((row) => row.id)
            .filter((id) => id !== mergeTargetId),
          primaryEmail: mergePrimaryEmail,
          preservedEmails: mergeEmails.filter(
            (entry) =>
              entry.email.trim().toLowerCase() !==
              mergePrimaryEmail.trim().toLowerCase(),
          ),
          fieldSelections: Object.fromEntries(
            Object.entries(mergeFieldSelections).map(([field, value]) => [
              field,
              decodeMergeValue(value),
            ]),
          ),
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json.error || "Failed to merge contacts");
      }

      toast({
        title: "Contacts merged",
        description: "The selected contacts were merged into the survivor.",
      });
      setIsMergeDialogOpen(false);
      setMergePreview(null);
      setMergeRows([]);
      clearSelection();
      await mutate();
    } catch (error) {
      toast({
        title: "Unable to merge contacts",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsMerging(false);
    }
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
        batchId: string;
        requested: number;
        sent: number;
        skipped: number;
        failed: number;
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

  const handleImportContacts = async () => {
    if (!importFile) {
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("teamId", teamId);
      formData.append("file", importFile);
      if (importFormat === "csv") {
        formData.append(
          "columnMapping",
          JSON.stringify(toContactImportColumnMapping(importSourceMapping)),
        );
      }

      const response = await fetch("/api/contacts/import", {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json?.error || "Failed to import contacts");
      }

      const result = json.data as ContactImportResult;
      setImportResult(result);

      toast({
        title: "Contact import complete",
        description: `${result.created} created, ${result.skipped} skipped.`,
      });

      if (result.created > 0) {
        await mutate();
      }
    } catch (importError) {
      toast({
        title: "Unable to import contacts",
        description:
          importError instanceof Error
            ? importError.message
            : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportFileChange = async (file: File | null) => {
    setImportFile(file);
    setImportResult(null);
    setImportHeaders([]);
    setImportPreviewRows([]);
    setImportSourceMapping({});
    setImportVCardContacts([]);

    if (!file) {
      return;
    }

    try {
      const contents = await file.text();
      if (file.name.toLowerCase().endsWith(".vcf")) {
        setImportFormat("vcf");
        const { parseVCardContacts } = await import("@/lib/vcard");
        const contacts = await parseVCardContacts(contents);
        if (contacts.length === 0) {
          throw new Error("The VCF file does not contain any contacts.");
        }
        setImportVCardContacts(contacts);
        return;
      }

      setImportFormat("csv");
      const parsed = parseCsv(contents);
      setImportHeaders(parsed.headers);
      setImportPreviewRows(parsed.rows.slice(0, 3));
      setImportSourceMapping(
        buildDefaultContactImportSourceMapping(parsed.headers),
      );
    } catch (error) {
      toast({
        title: "Unable to read import file",
        description:
          error instanceof Error
            ? error.message
            : "Check that the selected file is a valid CSV or VCF file.",
        variant: "destructive",
      });
    }
  };

  const createHref = `/teams/${teamId}/crm/contacts/create`;

  // Switching between the contacts and the trash starts on the first page.
  const handleShowTrash = (nextShowTrash: boolean) => {
    setShowTrash(nextShowTrash);
    list.pagination.onPageChange(1);
  };

  return (
    <RecordsPage>
      <RecordsHeader
        icon={UsersIcon}
        title="Contacts"
        count={isLoading ? undefined : totalContacts}
        action={
          showTrash ? undefined : (
            <Button asChild variant="action" size="sm">
              <Link href={createHref}>
                <Plus /> Add contact
              </Link>
            </Button>
          )
        }
        menu={
          <>
            <DropdownMenuItem onSelect={() => setIsImportDialogOpen(true)}>
              <Upload /> Import contacts
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => handleShowTrash(!showTrash)}>
              <Trash2 /> {showTrash ? "Back to all contacts" : "Open trash"}
            </DropdownMenuItem>
          </>
        }
      />

      <RecordListToolbar
        list={list}
        columns={contactColumns}
        filters={filterDefinitions}
        searchLabel="Search contacts"
        isRefreshing={isValidating && !isLoading}
        filterActions={
          showTrash ? null : (
            <SaveSmartListButton
              teamId={teamId}
              filters={toContactApiFilters(list.activeFilters)}
            />
          )
        }
        start={
          <Switcher
            label="Which contacts"
            size="sm"
            value={showTrash ? "trash" : "all"}
            onValueChange={(value) => handleShowTrash(value === "trash")}
            options={[
              { value: "all", label: "All contacts" },
              { value: "trash", label: "Trash", icon: Trash2 },
            ]}
          />
        }
      />

      <RecordTable
        columns={contactColumns}
        data={contacts}
        getRowId={getContactRowId}
        getRowHref={
          showTrash
            ? undefined
            : (contact) => `/teams/${teamId}/crm/contacts/${contact.id}`
        }
        isLoading={isLoading}
        emptyState={
          list.isSearching ? (
            <NoMatchState noun="contacts" onClear={list.handleClearAll} />
          ) : showTrash ? (
            <EmptyState
              size="page"
              icon={Trash2}
              title="Trash is empty"
              description="Contacts you move to the trash stay here until you restore them or delete them for good."
            />
          ) : (
            <EmptyState
              size="page"
              icon={UsersIcon}
              title="No contacts yet"
              description="Add the people you work with, or import them from a file."
              action={
                <Button asChild variant="action">
                  <Link href={createHref}>
                    <Plus /> Add contact
                  </Link>
                </Button>
              }
            />
          )
        }
        noun={{ one: "contact", other: "contacts" }}
        sorts={list.sorts}
        onSortsChange={list.setSorts}
        columnVisibility={list.columnVisibility.visibility}
        view={list.view}
        renderCards={(rows) => rows.map((contact) => renderCard(contact))}
        renderMap={(rows) => <ContactMap contacts={rows} />}
        pagination={{ ...list.pagination, total: totalContacts }}
        selectable
        renderBulkActions={({ selectedRows, clearSelection }) => (
          <>
            {showTrash ? (
              <>
                <BulkActionButton
                  disabled={isDeleting}
                  onClick={() =>
                    handleRestoreSelected(selectedRows, clearSelection)
                  }
                >
                  <RotateCcw />
                  Restore selected
                </BulkActionButton>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <BulkActionButton tone="destructive" disabled={isDeleting}>
                      <Trash2 />
                      Delete permanently
                    </BulkActionButton>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Permanently delete {selectedRows.length}{" "}
                        {selectedRows.length === 1 ? "contact" : "contacts"}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        All related data will be deleted. This action cannot be
                        undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() =>
                          handlePermanentlyDeleteSelected(
                            selectedRows,
                            clearSelection,
                          )
                        }
                      >
                        Delete permanently
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <>
                <BulkActionButton
                  disabled={
                    isDeleting ||
                    isSendingEmail ||
                    selectedRows.filter((contact) => contact.email).length === 0
                  }
                  onClick={() => openEmailDialog(selectedRows)}
                >
                  <Mail />
                  Email selected
                </BulkActionButton>
                <BulkActionButton
                  disabled={
                    isDeleting ||
                    isMerging ||
                    isMergePreviewLoading ||
                    selectedRows.length < 2
                  }
                  onClick={() => openMergeDialog(selectedRows)}
                >
                  <GitMerge />
                  Merge selected
                </BulkActionButton>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <BulkActionButton tone="destructive" disabled={isDeleting}>
                      <Trash2 />
                      Move to trash
                    </BulkActionButton>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Move {selectedRows.length}{" "}
                        {selectedRows.length === 1 ? "contact" : "contacts"} to
                        trash?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        They will disappear from active contacts and can be
                        restored from the trash later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() =>
                          handleDeleteSelected(selectedRows, clearSelection)
                        }
                      >
                        Move to trash
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {!showTrash ? (
              <BulkActionButton
                disabled={isDeleting || selectedRows.length === 0}
                onClick={() => setIsExportDialogOpen(true)}
              >
                <Download /> Export
              </BulkActionButton>
            ) : null}
            <ContactExportDialog
              teamId={teamId}
              contactIds={selectedRows.map((row) => row.id)}
              open={isExportDialogOpen}
              onOpenChange={setIsExportDialogOpen}
            />
            <MassEmailDialog
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
            <ContactMergeDialog
              open={isMergeDialogOpen}
              contacts={mergePreview?.contacts ?? mergeRows}
              conflicts={mergePreview?.conflicts ?? []}
              targetId={mergeTargetId}
              primaryEmail={mergePrimaryEmail}
              preservedEmails={mergeEmails}
              fieldSelections={mergeFieldSelections}
              isLoading={isMergePreviewLoading}
              isMerging={isMerging}
              onOpenChange={setIsMergeDialogOpen}
              onTargetChange={(contactId) => {
                const target = mergePreview?.contacts.find(
                  (contact) => contact.id === contactId,
                );
                setMergeTargetId(contactId);
                if (target?.email) {
                  setMergePrimaryEmail(target.email);
                }
              }}
              onPrimaryEmailChange={setMergePrimaryEmail}
              onPreservedEmailsChange={setMergeEmails}
              onFieldSelectionChange={(field, value) =>
                setMergeFieldSelections((current) => ({
                  ...current,
                  [field]: value,
                }))
              }
              onMerge={() => handleMergeContacts(clearSelection)}
            />
          </>
        )}
      />

      <ContactImportDialog
        open={isImportDialogOpen}
        file={importFile}
        headers={importHeaders}
        previewRows={importPreviewRows}
        format={importFormat}
        vcardContacts={importVCardContacts}
        sourceMapping={importSourceMapping}
        result={importResult}
        isImporting={isImporting}
        onOpenChange={(open) => {
          setIsImportDialogOpen(open);
          if (!open) {
            setImportFile(null);
            setImportHeaders([]);
            setImportPreviewRows([]);
            setImportSourceMapping({});
            setImportFormat("csv");
            setImportVCardContacts([]);
            setImportResult(null);
          }
        }}
        onFileChange={handleImportFileChange}
        onSourceMappingChange={setImportSourceMapping}
        onImport={handleImportContacts}
      />
    </RecordsPage>
  );
}

type ContactImportResult = {
  created: number;
  skipped: number;
  totalRows: number;
  skippedRows: Array<{
    rowNumber: number;
    reason: string;
  }>;
};

type ContactMergeDialogProps = {
  open: boolean;
  contacts: ContactRow[];
  conflicts: MergeConflict[];
  targetId: string;
  primaryEmail: string;
  preservedEmails: MergeEmail[];
  fieldSelections: Record<string, string>;
  isLoading: boolean;
  isMerging: boolean;
  onOpenChange: (open: boolean) => void;
  onTargetChange: (contactId: string) => void;
  onPrimaryEmailChange: (email: string) => void;
  onPreservedEmailsChange: (emails: MergeEmail[]) => void;
  onFieldSelectionChange: (field: string, value: string) => void;
  onMerge: () => void;
};

const ContactMergeDialog = ({
  open,
  contacts,
  conflicts,
  targetId,
  primaryEmail,
  preservedEmails,
  fieldSelections,
  isLoading,
  isMerging,
  onOpenChange,
  onTargetChange,
  onPrimaryEmailChange,
  onPreservedEmailsChange,
  onFieldSelectionChange,
  onMerge,
}: ContactMergeDialogProps) => {
  const allEmails = useMemo(() => {
    const map = new Map<string, MergeEmail>();

    contacts.forEach((contact) => {
      if (contact.email) {
        map.set(contact.email.toLowerCase(), {
          email: contact.email.toLowerCase(),
          kind: ContactEmailKind.ALIAS,
        });
      }
      contact.additionalEmails?.forEach((entry) => {
        const email = entry.email.toLowerCase();
        if (!map.has(email)) {
          map.set(email, {
            email,
            kind:
              entry.kind === ContactEmailKind.SHARED
                ? ContactEmailKind.SHARED
                : ContactEmailKind.ALIAS,
            label: entry.label,
          });
        }
      });
    });

    return Array.from(map.values());
  }, [contacts]);

  const preservedEmailSet = useMemo(
    () => new Set(preservedEmails.map((entry) => entry.email)),
    [preservedEmails],
  );

  const setPreservedEmailEnabled = (email: MergeEmail, enabled: boolean) => {
    if (enabled) {
      onPreservedEmailsChange(
        preservedEmailSet.has(email.email)
          ? preservedEmails
          : [...preservedEmails, email],
      );
      return;
    }

    onPreservedEmailsChange(
      preservedEmails.filter((entry) => entry.email !== email.email),
    );
  };

  const setPreservedEmailKind = (
    email: string,
    kind: ContactEmailKind.ALIAS | ContactEmailKind.SHARED,
  ) => {
    onPreservedEmailsChange(
      preservedEmails.map((entry) =>
        entry.email === email ? { ...entry, kind } : entry,
      ),
    );
  };

  const canMerge =
    contacts.length >= 2 && Boolean(targetId) && Boolean(primaryEmail);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Merge contacts</DialogTitle>
          <DialogDescription>
            Choose the survivor, preserve identity aliases, and resolve field
            conflicts before deleting duplicate contacts.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading merge preview...
          </div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-3">
              <Label>Surviving contact</Label>
              <Select value={targetId} onValueChange={onTargetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose survivor" />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.name} {contact.email ? `<${contact.email}>` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <section className="space-y-3">
              <Label>Primary email</Label>
              <Select value={primaryEmail} onValueChange={onPrimaryEmailChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose primary email" />
                </SelectTrigger>
                <SelectContent>
                  {allEmails.map((entry) => (
                    <SelectItem key={entry.email} value={entry.email}>
                      {entry.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <section className="space-y-3">
              <div>
                <Label>Preserved additional emails</Label>
                <p className="text-sm text-muted-foreground">
                  Alias emails are unique identity matches. Shared emails are
                  display-only and can belong to multiple contacts.
                </p>
              </div>
              <div className="space-y-2">
                {allEmails
                  .filter((entry) => entry.email !== primaryEmail)
                  .map((entry) => {
                    const preserved = preservedEmailSet.has(entry.email);
                    const selected =
                      preservedEmails.find(
                        (candidate) => candidate.email === entry.email,
                      ) ?? entry;

                    return (
                      <div
                        key={entry.email}
                        className="grid gap-3 rounded-md border p-3 sm:grid-cols-[auto_minmax(0,1fr)_150px]"
                      >
                        <Checkbox
                          checked={preserved}
                          onCheckedChange={(checked) =>
                            setPreservedEmailEnabled(entry, checked === true)
                          }
                          aria-label={`Preserve ${entry.email}`}
                        />
                        <span className="break-all text-sm">{entry.email}</span>
                        <Select
                          value={selected.kind}
                          onValueChange={(value) =>
                            setPreservedEmailKind(
                              entry.email,
                              value as
                                | ContactEmailKind.ALIAS
                                | ContactEmailKind.SHARED,
                            )
                          }
                          disabled={!preserved}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ContactEmailKind.ALIAS}>
                              Alias
                            </SelectItem>
                            <SelectItem value={ContactEmailKind.SHARED}>
                              Shared
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
              </div>
            </section>

            {conflicts.length > 0 && (
              <section className="space-y-3">
                <div>
                  <Label>Field conflicts</Label>
                  <p className="text-sm text-muted-foreground">
                    Pick the value that should remain on the survivor.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {conflicts.map((conflict) => (
                    <div key={conflict.field} className="space-y-2">
                      <Label className="capitalize">
                        {conflict.field.replace(/([A-Z])/g, " $1")}
                      </Label>
                      <Select
                        value={fieldSelections[conflict.field] ?? ""}
                        onValueChange={(value) =>
                          onFieldSelectionChange(conflict.field, value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose value" />
                        </SelectTrigger>
                        <SelectContent>
                          {conflict.values.map((entry) => {
                            const contact = contacts.find(
                              (candidate) => candidate.id === entry.contactId,
                            );
                            const encoded = encodeMergeValue(entry.value);
                            return (
                              <SelectItem
                                key={`${conflict.field}-${entry.contactId}-${encoded}`}
                                value={encoded}
                              >
                                {contact?.name ?? "Contact"}:{" "}
                                {formatMergeValue(entry.value)}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isMerging}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onMerge}
            disabled={!canMerge || isLoading || isMerging}
          >
            {isMerging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Merging...
              </>
            ) : (
              "Merge contacts"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type ContactImportDialogProps = {
  open: boolean;
  file: File | null;
  headers: string[];
  previewRows: string[][];
  format: "csv" | "vcf";
  vcardContacts: VCardContact[];
  sourceMapping: ContactImportSourceMapping;
  result: ContactImportResult | null;
  isImporting: boolean;
  onOpenChange: (open: boolean) => void;
  onFileChange: (file: File | null) => void | Promise<void>;
  onSourceMappingChange: (mapping: ContactImportSourceMapping) => void;
  onImport: () => void;
};

const ContactImportDialog = ({
  open,
  file,
  headers,
  previewRows,
  format,
  vcardContacts,
  sourceMapping,
  result,
  isImporting,
  onOpenChange,
  onFileChange,
  onSourceMappingChange,
  onImport,
}: ContactImportDialogProps) => {
  const selectedFields = Object.values(sourceMapping);
  const canImport =
    Boolean(file) &&
    (format === "vcf"
      ? vcardContacts.length > 0
      : hasContactNameMapping(selectedFields) &&
        selectedFields.includes("email")) &&
    !isImporting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import contacts</DialogTitle>
          <DialogDescription>
            Upload a CSV file and map its columns, or import standard fields
            automatically from a VCF file. Duplicate emails are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="contact-import-file">CSV or VCF file</Label>
            <Input
              id="contact-import-file"
              type="file"
              accept=".csv,.vcf,text/csv,text/vcard,text/x-vcard"
              disabled={isImporting}
              onChange={(event) => {
                onFileChange(event.currentTarget.files?.[0] ?? null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              CSV rows require an email and either a full name or a first/last
              name. VCards require a name and at least one email or phone
              number.
            </p>
          </div>

          {format === "csv" && headers.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Separate first and last names are combined into the contact
                name. Street name and house number are combined into the
                address.
              </p>
              <div className="rounded-md border">
                <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(12rem,0.8fr)] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>CSV column</span>
                  <span>Sample values</span>
                  <span>Import as</span>
                </div>
                <div className="divide-y">
                  {headers.map((header, columnIndex) => (
                    <div
                      key={header}
                      className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(12rem,0.8fr)] items-center gap-3 px-3 py-2"
                    >
                      <div className="truncate text-sm font-medium">
                        {header}
                      </div>
                      <div className="min-w-0 text-xs text-muted-foreground">
                        {previewRows.length > 0
                          ? previewRows
                              .map((row) => row[columnIndex])
                              .filter(Boolean)
                              .slice(0, 3)
                              .join(" / ") || "-"
                          : "-"}
                      </div>
                      <Select
                        value={sourceMapping[header] ?? "__none__"}
                        disabled={isImporting}
                        onValueChange={(value) => {
                          const nextValue = value as
                            | ContactImportField
                            | "__none__";
                          const nextMapping = { ...sourceMapping };

                          if (nextValue !== "__none__") {
                            Object.entries(nextMapping).forEach(
                              ([mappedHeader, mappedField]) => {
                                if (
                                  mappedHeader !== header &&
                                  mappedField === nextValue
                                ) {
                                  nextMapping[mappedHeader] = "__none__";
                                }
                              },
                            );
                          }

                          nextMapping[header] = nextValue;
                          onSourceMappingChange(nextMapping);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Do not import" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            Do not import
                          </SelectItem>
                          {CONTACT_IMPORT_FIELDS.map((entry) => (
                            <SelectItem key={entry.field} value={entry.field}>
                              {entry.label}
                              {"required" in entry && entry.required
                                ? " *"
                                : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {format === "vcf" && vcardContacts.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">
                {vcardContacts.length} contact
                {vcardContacts.length === 1 ? "" : "s"} found
              </div>
              <div className="rounded-md border">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Name</span>
                  <span>Email or phone</span>
                </div>
                <div className="divide-y">
                  {vcardContacts.slice(0, 5).map((contact) => (
                    <div
                      key={`${contact.name}-${contact.email ?? ""}-${contact.phone ?? ""}`}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 px-3 py-2 text-sm"
                    >
                      <span className="truncate">{contact.name || "-"}</span>
                      <span className="truncate text-muted-foreground">
                        {contact.email ?? contact.phone ?? "-"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Names, emails, phone numbers, preferred addresses, websites, and
                notes are imported. Photos and custom fields are ignored.
              </p>
            </div>
          )}

          {result && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-medium">
                {result.created} created, {result.skipped} skipped from{" "}
                {result.totalRows} {format === "vcf" ? "contacts" : "rows"}.
              </div>
              {result.skippedRows.length > 0 && (
                <div className="mt-3 max-h-44 overflow-auto text-muted-foreground">
                  {result.skippedRows.map((row) => (
                    <div key={`${row.rowNumber}-${row.reason}`}>
                      {format === "vcf" ? "Contact" : "Row"} {row.rowNumber}:{" "}
                      {row.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isImporting}
          >
            Close
          </Button>
          <Button type="button" onClick={onImport} disabled={!canImport}>
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import contacts
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type MassEmailDialogProps = {
  open: boolean;
  recipients: ContactRow[];
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

const MassEmailDialog = ({
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
}: MassEmailDialogProps) => {
  const recipientsWithEmail = recipients.filter((contact) => contact.email);
  const missingEmailCount = recipients.length - recipientsWithEmail.length;
  const canSend =
    recipientsWithEmail.length > 0 &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !isSending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send email to selected contacts</DialogTitle>
          <DialogDescription>
            Sends one email per contact through the Scaleway Transactional Email
            integration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            {recipientsWithEmail.length} recipient
            {recipientsWithEmail.length === 1 ? "" : "s"} with email selected
            {missingEmailCount > 0
              ? `, ${missingEmailCount} without email will be skipped`
              : ""}
            .
          </div>

          <div className="space-y-2">
            <Label htmlFor="mass-email-sender">Sender</Label>
            <Select
              value={senderLabelMode}
              onValueChange={(value) =>
                onSenderLabelModeChange(value as SenderLabelMode)
              }
              disabled={isSending}
            >
              <SelectTrigger id="mass-email-sender">
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
            <Label htmlFor="mass-message-subject">Subject</Label>
            <Input
              id="mass-message-subject"
              name="subject"
              autoComplete="off"
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              disabled={isSending}
              placeholder="Email subject"
            />
          </div>

          <InternalCopyFields
            idPrefix="mass-email"
            emails={bcc}
            mode={internalCopyMode}
            disabled={isSending}
            onEmailsChange={onBccChange}
            onModeChange={onInternalCopyModeChange}
          />

          <div className="space-y-2">
            <Label htmlFor="mass-email-body">Email body</Label>
            <RichEmailEditor
              id="mass-email-body"
              value={body}
              onChange={onBodyChange}
              disabled={isSending}
              previewDescription="Use the toolbar to format the message. Successful sends are logged in each contact's engagement history."
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
