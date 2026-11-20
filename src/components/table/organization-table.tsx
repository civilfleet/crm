"use client";

import {
  Building2,
  HandHeart,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { EmptyState } from "@/components/design/empty-state";
import { Switcher } from "@/components/design/switcher";
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
  ConfirmOrganizationAction,
  columns,
  ORGANIZATION_ACTIONS,
  type OrganizationAction,
  type OrganizationColumns,
  requestOrganizationAction,
} from "@/components/table/organization-columns";
import {
  type OrganizationFieldOption,
  type OrganizationListFilter,
  organizationFilterDefinitions,
  organizationFilterModel,
  toOrganizationApiFilters,
} from "@/components/table/organization-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";

/** Which list: every organization (admin), or a team's CRM or funding ones. */
type OrganizationListScope = "admin" | "crm" | "funding";

interface IOrganizationProps {
  scope: OrganizationListScope;
  teamId?: string;
  basePath?: string;
  initialPageSize: number;
  /** Where "New organization" goes; none hides it. */
  createHref?: string;
  /** More actions in the header, e.g. copying the registration link. */
  headerActions?: React.ReactNode;
}

// The same icons as the sidebar, so the page says which list it is.
const SCOPE_ICONS = { admin: Building2, crm: Building2, funding: HandHeart };

const getOrganizationRowId = (organization: OrganizationColumns) =>
  organization.id;

type SenderLabelMode = "default" | "user";

type LinkedContactRecipient = {
  id: string;
  name: string;
  email?: string | null;
};

const getLinkedContactRecipients = (organizations: OrganizationColumns[]) => {
  const recipientMap = new Map<string, LinkedContactRecipient>();

  organizations.forEach((organization) => {
    organization.contacts?.forEach((contact) => {
      if (!recipientMap.has(contact.id)) {
        recipientMap.set(contact.id, contact);
      }
    });
  });

  return Array.from(recipientMap.values());
};

const getSelectedOrganizationTeamIds = (organizations: OrganizationColumns[]) =>
  Array.from(
    new Set(
      organizations
        .map((organization) => organization.team?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

export default function OrganizationTable({
  scope,
  teamId,
  basePath: basePathProp,
  initialPageSize,
  createHref,
  headerActions,
}: IOrganizationProps) {
  const { toast } = useToast();
  const pathname = usePathname();
  const basePath = (basePathProp ?? pathname).replace(/\/$/, "");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailOrganizations, setEmailOrganizations] = useState<
    OrganizationColumns[]
  >([]);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSenderLabelMode, setEmailSenderLabelMode] =
    useState<SenderLabelMode>("default");

  const { data: orgTypesData } = useSWR(
    teamId ? `/api/organization-types?teamId=${teamId}` : null,
    recordListFetcher,
  );
  // The custom fields of the team's organization types, each once.
  const fieldOptions = useMemo<OrganizationFieldOption[]>(() => {
    const map = new Map<string, OrganizationFieldOption>();
    for (const type of (orgTypesData?.data ?? []) as Array<{
      schema?: OrganizationFieldOption[];
    }>) {
      for (const field of type.schema ?? []) {
        if (!map.has(field.key)) map.set(field.key, field);
      }
    }
    return Array.from(map.values());
  }, [orgTypesData]);
  const filterDefinitions = useMemo(
    () => organizationFilterDefinitions(fieldOptions),
    [fieldOptions],
  );

  // Column actions (delete one) refresh the list once it has loaded.
  const mutateRef = useRef<() => unknown>(() => undefined);
  const tableColumns = useMemo(
    () => columns(() => void mutateRef.current(), basePath, showTrash),
    [basePath, showTrash],
  );
  const list = useRecordList<OrganizationListFilter, "table" | "cards">({
    viewKey:
      scope === "admin"
        ? "organizations:admin"
        : `organizations:${scope}:team:${teamId}`,
    columnDefaults: {},
    initialPageSize,
    sortFields: getSortFields(tableColumns),
    views: ["table", "cards"],
    filters: organizationFilterModel,
  });
  const params = list.getSearchParams(
    scope === "admin" || !teamId ? {} : { teamId },
  );
  if (showTrash) params.set("deleted", "true");
  if (list.activeFilters.length) {
    params.set(
      "filters",
      JSON.stringify(toOrganizationApiFilters(list.activeFilters)),
    );
  }

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/organizations?${params.toString()}`,
    recordListFetcher,
    { keepPreviousData: true },
  );
  mutateRef.current = mutate;
  const total = Number(data?.total ?? 0);
  const organizations: OrganizationColumns[] = Array.isArray(data?.data)
    ? data.data
    : [];

  useEffect(() => {
    if (!error) return;
    toast({
      title: "Unable to load organizations",
      description: "The organizations could not be fetched. Please try again.",
      variant: "destructive",
    });
  }, [error, toast]);

  const handleOrganizationAction = async (
    action: OrganizationAction,
    selectedRows: OrganizationColumns[],
    clearSelection: () => void,
  ) => {
    if (!selectedRows.length) return;
    const { done } = ORGANIZATION_ACTIONS[action];
    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedRows.map((organization) =>
          requestOrganizationAction(organization.id, action),
        ),
      );
      const failed = results.filter(
        (result) => result.status !== "fulfilled" || !result.value.ok,
      ).length;
      await mutate();
      clearSelection();
      const plural = (count: number) =>
        `${count} organization${count === 1 ? "" : "s"}`;
      if (failed > 0) {
        toast({
          title: "Not all organizations changed",
          description: `${plural(selectedRows.length - failed)} ${done}, ${failed} failed.`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: `${plural(selectedRows.length)} ${done}`,
        description:
          action === "trash"
            ? "You can restore them from the trash."
            : undefined,
      });
    } catch {
      toast({
        title: "Unable to change the organizations",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Switching between the list and the trash starts on the first page.
  const handleShowTrash = (nextShowTrash: boolean) => {
    setShowTrash(nextShowTrash);
    list.pagination.onPageChange(1);
  };

  const openEmailDialog = (selectedRows: OrganizationColumns[]) => {
    setEmailOrganizations(selectedRows);
    setIsEmailDialogOpen(true);
  };

  const handleSendEmail = async (clearSelection: () => void) => {
    const recipients = getLinkedContactRecipients(emailOrganizations);
    const recipientsWithEmail = recipients.filter((contact) => contact.email);
    const contactIds = recipientsWithEmail.map((contact) => contact.id);
    const selectedTeamIds = getSelectedOrganizationTeamIds(emailOrganizations);
    const selectedTeamId = selectedTeamIds[0];

    if (
      !selectedTeamId ||
      selectedTeamIds.length !== 1 ||
      contactIds.length === 0
    ) {
      return;
    }

    setIsSendingEmail(true);

    try {
      const response = await fetch(
        `/api/teams/${selectedTeamId}/integrations/scaleway-email/send`,
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

      const json = await response.json().catch(() => ({}));

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
      setEmailOrganizations([]);
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

  const icon = SCOPE_ICONS[scope];
  const renderCard = (org: OrganizationColumns) => (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-tight">
            {org.name || "Untitled Organization"}
          </CardTitle>
          <Badge variant={org.isFilledByOrg ? "default" : "secondary"}>
            {org.isFilledByOrg ? "Self-Registered" : "Admin-Registered"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Email</div>
          <div className="break-all font-medium">{org.email || "N/A"}</div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Team</div>
            <div className="font-medium">{org.team?.name || "N/A"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Country</div>
            <div className="font-medium">{org.country || "N/A"}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Phone</div>
            <div className="font-medium">{org.phone || "N/A"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Website</div>
            <div className="font-medium">
              {org.website ? (
                <Link
                  href={
                    org.website.startsWith("http")
                      ? org.website
                      : `https://${org.website}`
                  }
                  target="_blank"
                  className="text-info hover:underline"
                >
                  {org.website}
                </Link>
              ) : (
                "N/A"
              )}
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Link href={`${basePath}/${org.id}`}>
          <Button size="sm" variant="outline">
            View
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );

  return (
    <RecordsPage>
      <RecordsHeader
        icon={icon}
        title="Organizations"
        count={isLoading ? undefined : total}
        action={
          <>
            {headerActions}
            {createHref ? (
              <Button asChild variant="action" size="sm">
                <Link href={createHref}>
                  <Plus /> New organization
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <RecordListToolbar
        list={list}
        columns={tableColumns}
        filters={filterDefinitions}
        searchLabel="Search organizations"
        isRefreshing={isValidating && !isLoading}
        start={
          <Switcher
            label="Which organizations"
            size="sm"
            value={showTrash ? "trash" : "all"}
            onValueChange={(value) => handleShowTrash(value === "trash")}
            options={[
              { value: "all", label: "All organizations" },
              { value: "trash", label: "Trash", icon: Trash2 },
            ]}
          />
        }
      />

      <RecordTable
        columns={tableColumns}
        data={organizations}
        getRowId={getOrganizationRowId}
        getRowHref={
          showTrash
            ? undefined
            : (organization) => `${basePath}/${organization.id}`
        }
        isLoading={isLoading}
        emptyState={
          list.isSearching ? (
            <NoMatchState noun="organizations" onClear={list.handleClearAll} />
          ) : showTrash ? (
            <EmptyState
              size="page"
              icon={Trash2}
              title="Trash is empty"
              description="Organizations you delete stay here until you restore them or delete them for good."
            />
          ) : (
            <EmptyState
              size="page"
              icon={icon}
              title="No organizations yet"
              description="Add the organizations you work with."
              action={
                createHref ? (
                  <Button asChild variant="action">
                    <Link href={createHref}>
                      <Plus /> New organization
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          )
        }
        noun={{ one: "organization", other: "organizations" }}
        sorts={list.sorts}
        onSortsChange={list.setSorts}
        columnVisibility={list.columnVisibility.visibility}
        columnLayout={list.columnVisibility}
        view={list.view === "cards" ? "cards" : "table"}
        renderCards={(rows) =>
          rows.map((org) => <div key={org.id}>{renderCard(org)}</div>)
        }
        pagination={{ ...list.pagination, total }}
        selectable
        renderBulkActions={({ selectedRows, clearSelection }) => {
          const selectedTeamIds = getSelectedOrganizationTeamIds(selectedRows);
          const recipientsWithEmail = getLinkedContactRecipients(
            selectedRows,
          ).filter((contact) => contact.email);
          // Linked contacts of one team only: the e-mail goes out as that team.
          const emailDisabled =
            isDeleting ||
            isSendingEmail ||
            selectedTeamIds.length !== 1 ||
            recipientsWithEmail.length === 0;
          const selection = `${selectedRows.length} ${selectedRows.length === 1 ? "organization" : "organizations"}`;
          if (showTrash)
            return (
              <>
                <ConfirmOrganizationAction
                  action="restore"
                  title={`Restore ${selection}?`}
                  trigger={
                    <BulkActionButton disabled={isDeleting}>
                      <RotateCcw /> Restore
                    </BulkActionButton>
                  }
                  onConfirm={() =>
                    handleOrganizationAction(
                      "restore",
                      selectedRows,
                      clearSelection,
                    )
                  }
                />
                <ConfirmOrganizationAction
                  action="delete"
                  title={`Delete ${selection} permanently?`}
                  trigger={
                    <BulkActionButton tone="destructive" disabled={isDeleting}>
                      <Trash2 /> Delete permanently
                    </BulkActionButton>
                  }
                  onConfirm={() =>
                    handleOrganizationAction(
                      "delete",
                      selectedRows,
                      clearSelection,
                    )
                  }
                />
              </>
            );
          return (
            <>
              <BulkActionButton
                disabled={emailDisabled}
                onClick={() => openEmailDialog(selectedRows)}
              >
                <Mail /> Email linked contacts
              </BulkActionButton>
              <ConfirmOrganizationAction
                action="trash"
                title={`Move ${selection} to the trash?`}
                trigger={
                  <BulkActionButton tone="destructive" disabled={isDeleting}>
                    {isDeleting ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                    Delete
                  </BulkActionButton>
                }
                onConfirm={() =>
                  handleOrganizationAction(
                    "trash",
                    selectedRows,
                    clearSelection,
                  )
                }
              />
              <OrganizationContactsEmailDialog
                open={isEmailDialogOpen}
                organizations={emailOrganizations}
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
            </>
          );
        }}
      />
    </RecordsPage>
  );
}

type OrganizationContactsEmailDialogProps = {
  open: boolean;
  organizations: OrganizationColumns[];
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

const OrganizationContactsEmailDialog = ({
  open,
  organizations,
  subject,
  body,
  senderLabelMode,
  isSending,
  onOpenChange,
  onSubjectChange,
  onBodyChange,
  onSenderLabelModeChange,
  onSend,
}: OrganizationContactsEmailDialogProps) => {
  const recipients = getLinkedContactRecipients(organizations);
  const recipientsWithEmail = recipients.filter((contact) => contact.email);
  const missingEmailCount = recipients.length - recipientsWithEmail.length;
  const selectedTeamIds = getSelectedOrganizationTeamIds(organizations);
  const canSend =
    selectedTeamIds.length === 1 &&
    recipientsWithEmail.length > 0 &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !isSending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email linked contacts</DialogTitle>
          <DialogDescription>
            Sends one email per linked contact through the Scaleway
            Transactional Email integration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            {organizations.length} organization
            {organizations.length === 1 ? "" : "s"} selected.{" "}
            {recipientsWithEmail.length} linked contact
            {recipientsWithEmail.length === 1 ? "" : "s"} with email will
            receive this message
            {missingEmailCount > 0
              ? `, ${missingEmailCount} linked contact${
                  missingEmailCount === 1 ? "" : "s"
                } without email will be skipped`
              : ""}
            .
          </div>

          {selectedTeamIds.length > 1 ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Select organizations from one team at a time to send email.
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="organization-email-sender">Sender</Label>
            <Select
              value={senderLabelMode}
              onValueChange={(value) =>
                onSenderLabelModeChange(value as SenderLabelMode)
              }
              disabled={isSending}
            >
              <SelectTrigger id="organization-email-sender">
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
            <Label htmlFor="organization-email-subject">Subject</Label>
            <Input
              id="organization-email-subject"
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              disabled={isSending}
              placeholder="Email subject"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="organization-email-body">Email body</Label>
            <RichEmailEditor
              id="organization-email-body"
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
