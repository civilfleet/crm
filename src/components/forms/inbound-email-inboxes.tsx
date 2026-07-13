"use client";

import {
  AlertCircle,
  CheckCircle2,
  Inbox,
  Loader2,
  MailCheck,
  MailPlus,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type EmailInboxConfig = {
  id: string;
  teamId: string;
  groupId: string;
  groupName: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  mailbox: string;
  outboundMode: "DISABLED" | "SMTP" | "SCALEWAY";
  replyFromEmail?: string;
  replyFromName?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure: boolean;
  smtpUsername?: string;
  hasSmtpPassword: boolean;
  autoApproveExistingVisible: boolean;
  requireReviewForHiddenMatches: boolean;
  allowCreateContacts: boolean;
  allowedDomains: string[];
  isEnabled: boolean;
  lastSyncedAt?: string;
  uidValidity?: string;
  lastUid?: string;
  syncLockedAt?: string;
  syncLockedBy?: string;
  lastSyncError?: string;
  createdAt: string;
  updatedAt: string;
};

type GroupOption = {
  id: string;
  name: string;
  canAccessAllContacts: boolean;
};

type InboxFormState = {
  id?: string;
  groupId: string;
  name: string;
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string;
  mailbox: string;
  outboundMode: "DISABLED" | "SMTP" | "SCALEWAY";
  replyFromEmail: string;
  replyFromName: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  autoApproveExistingVisible: boolean;
  requireReviewForHiddenMatches: boolean;
  allowCreateContacts: boolean;
  allowedDomains: string;
  isEnabled: boolean;
};

type InboundEmailInboxesProps = {
  teamId: string;
};

const emptyForm = (): InboxFormState => ({
  groupId: "",
  name: "",
  host: "",
  port: "993",
  secure: true,
  username: "",
  password: "",
  mailbox: "INBOX",
  outboundMode: "DISABLED",
  replyFromEmail: "",
  replyFromName: "",
  smtpHost: "",
  smtpPort: "587",
  smtpSecure: false,
  smtpUsername: "",
  smtpPassword: "",
  autoApproveExistingVisible: true,
  requireReviewForHiddenMatches: true,
  allowCreateContacts: false,
  allowedDomains: "",
  isEnabled: true,
});

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error || response.statusText);
  }
  return json.data as T;
};

const fetchApiResponse = async <T,>(url: string): Promise<{ data: T }> => {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error || response.statusText);
  }
  return json as { data: T };
};

const formatDate = (value?: string) => {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const splitDomains = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean),
    ),
  );

const getInboxStatus = (inbox: EmailInboxConfig) => {
  if (!inbox.isEnabled) {
    return {
      label: "Disabled",
      className: "bg-muted text-foreground border-border",
      icon: Settings2,
    };
  }

  if (inbox.lastSyncError) {
    return {
      label: "Sync error",
      className: "bg-red-100 text-red-900 border-red-200",
      icon: AlertCircle,
    };
  }

  if (inbox.lastSyncedAt) {
    return {
      label: "Syncing",
      className: "bg-emerald-100 text-emerald-900 border-emerald-200",
      icon: CheckCircle2,
    };
  }

  return {
    label: "Ready",
    className: "bg-blue-100 text-blue-900 border-blue-200",
    icon: Inbox,
  };
};

export default function InboundEmailInboxes({
  teamId,
}: InboundEmailInboxesProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<InboxFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [busyInboxId, setBusyInboxId] = useState<string | null>(null);

  const {
    data: inboxes = [],
    error: inboxError,
    isLoading: inboxesLoading,
    mutate: mutateInboxes,
  } = useSWR(`/api/teams/${teamId}/email-inboxes`, (url: string) =>
    fetchJson<EmailInboxConfig[]>(url),
  );

  const { data: groupsResponse, error: groupsError } = useSWR(
    `/api/groups?teamId=${teamId}`,
    (url: string) => fetchApiResponse<GroupOption[]>(url),
  );

  const enabledCount = useMemo(
    () => inboxes.filter((inbox) => inbox.isEnabled).length,
    [inboxes],
  );
  const groups = useMemo(
    () => (Array.isArray(groupsResponse?.data) ? groupsResponse.data : []),
    [groupsResponse],
  );

  const isEditing = Boolean(form.id);
  const selectedGroup = groups.find((group) => group.id === form.groupId);

  const openCreateDialog = () => {
    setForm({
      ...emptyForm(),
      groupId: groups[0]?.id ?? "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (inbox: EmailInboxConfig) => {
    setForm({
      id: inbox.id,
      groupId: inbox.groupId,
      name: inbox.name,
      host: inbox.host,
      port: String(inbox.port),
      secure: inbox.secure,
      username: inbox.username,
      password: "",
      mailbox: inbox.mailbox,
      outboundMode: inbox.outboundMode,
      replyFromEmail: inbox.replyFromEmail ?? inbox.username,
      replyFromName: inbox.replyFromName ?? inbox.name,
      smtpHost: inbox.smtpHost ?? "",
      smtpPort: String(inbox.smtpPort ?? 587),
      smtpSecure: inbox.smtpSecure,
      smtpUsername: inbox.smtpUsername ?? "",
      smtpPassword: "",
      autoApproveExistingVisible: inbox.autoApproveExistingVisible,
      requireReviewForHiddenMatches: inbox.requireReviewForHiddenMatches,
      allowCreateContacts: inbox.allowCreateContacts,
      allowedDomains: inbox.allowedDomains.join(", "),
      isEnabled: inbox.isEnabled,
    });
    setIsDialogOpen(true);
  };

  const updateForm = <K extends keyof InboxFormState>(
    key: K,
    value: InboxFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateUsername = (username: string) => {
    setForm((current) => ({
      ...current,
      username,
      replyFromEmail:
        !current.replyFromEmail || current.replyFromEmail === current.username
          ? username
          : current.replyFromEmail,
    }));
  };

  const updateName = (name: string) => {
    setForm((current) => ({
      ...current,
      name,
      replyFromName:
        !current.replyFromName || current.replyFromName === current.name
          ? name
          : current.replyFromName,
    }));
  };

  const updateOutboundMode = (
    outboundMode: "DISABLED" | "SMTP" | "SCALEWAY",
  ) => {
    setForm((current) => ({
      ...current,
      outboundMode,
      replyFromEmail:
        outboundMode !== "DISABLED" && !current.replyFromEmail
          ? current.username
          : current.replyFromEmail,
      replyFromName:
        outboundMode !== "DISABLED" && !current.replyFromName
          ? current.name
          : current.replyFromName,
    }));
  };

  const saveInbox = async () => {
    const port = Number(form.port);
    const smtpPort = Number(form.smtpPort);
    const replyFromEmail = form.replyFromEmail.trim() || form.username.trim();
    const replyFromName = form.replyFromName.trim() || form.name.trim();
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      toast({
        title: "Invalid port",
        description: "Use a valid IMAP port between 1 and 65535.",
        variant: "destructive",
      });
      return;
    }

    if (!form.password && !isEditing) {
      toast({
        title: "Password required",
        description: "Add the IMAP password or app password for this inbox.",
        variant: "destructive",
      });
      return;
    }

    if (form.outboundMode !== "DISABLED" && !replyFromEmail) {
      toast({
        title: "Reply address required",
        description:
          "Add the address recipients should see when this inbox replies.",
        variant: "destructive",
      });
      return;
    }
    if (
      form.outboundMode === "SMTP" &&
      (!form.smtpHost.trim() ||
        !form.smtpUsername.trim() ||
        !Number.isFinite(smtpPort) ||
        smtpPort <= 0 ||
        smtpPort > 65535 ||
        (!form.smtpPassword && !isEditing))
    ) {
      toast({
        title: "SMTP settings incomplete",
        description: "Add a valid host, port, username, and password.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(
        form.id
          ? `/api/teams/${teamId}/email-inboxes/${form.id}`
          : `/api/teams/${teamId}/email-inboxes`,
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId: form.groupId,
            name: form.name,
            host: form.host,
            port,
            secure: form.secure,
            username: form.username,
            password: form.password || undefined,
            mailbox: form.mailbox || "INBOX",
            outboundMode: form.outboundMode,
            replyFromEmail:
              form.outboundMode === "DISABLED"
                ? form.replyFromEmail || undefined
                : replyFromEmail,
            replyFromName:
              form.outboundMode === "DISABLED"
                ? form.replyFromName || undefined
                : replyFromName,
            smtpHost: form.smtpHost || undefined,
            smtpPort: form.outboundMode === "SMTP" ? smtpPort : undefined,
            smtpSecure: form.smtpSecure,
            smtpUsername: form.smtpUsername || undefined,
            smtpPassword: form.smtpPassword || undefined,
            autoApproveExistingVisible: form.autoApproveExistingVisible,
            requireReviewForHiddenMatches: form.requireReviewForHiddenMatches,
            allowCreateContacts: form.allowCreateContacts,
            allowedDomains: splitDomains(form.allowedDomains),
            isEnabled: form.isEnabled,
          }),
        },
      );

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || response.statusText);
      }

      await mutateInboxes();
      setIsDialogOpen(false);
      toast({
        title: form.id ? "Inbox updated" : "Inbox added",
        description: "Incoming email sync settings were saved.",
      });
    } catch (error) {
      toast({
        title: "Failed to save inbox",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const runInboxAction = async (
    inbox: EmailInboxConfig,
    action: "test" | "test-outbound" | "sync" | "resync" | "delete",
  ) => {
    setBusyInboxId(`${action}:${inbox.id}`);
    try {
      const response = await fetch(
        action === "delete"
          ? `/api/teams/${teamId}/email-inboxes/${inbox.id}`
          : `/api/teams/${teamId}/email-inboxes/${inbox.id}/${
              action === "resync" ? "sync" : action
            }`,
        {
          method: action === "delete" ? "DELETE" : "POST",
          headers:
            action === "resync"
              ? { "Content-Type": "application/json" }
              : undefined,
          body:
            action === "resync"
              ? JSON.stringify({ resetCheckpoint: true })
              : undefined,
        },
      );

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || response.statusText);
      }

      await mutateInboxes();
      toast({
        title:
          action === "test"
            ? "Connection works"
            : action === "test-outbound"
              ? "Sending configuration works"
              : action === "sync" || action === "resync"
                ? "Sync finished"
                : "Inbox deleted",
        description:
          (action === "sync" || action === "resync") && json?.data
            ? `Imported ${json.data.imported ?? 0} messages.`
            : undefined,
      });
    } catch (error) {
      toast({
        title:
          action === "test"
            ? "Connection failed"
            : action === "test-outbound"
              ? "Sending configuration failed"
              : action === "sync" || action === "resync"
                ? "Sync failed"
                : "Delete failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusyInboxId(null);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Inbound Email Inboxes</CardTitle>
            <CardDescription>
              Sync IMAP inboxes into contact conversation history.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="border-border">
              {enabledCount} enabled
            </Badge>
            <Button onClick={openCreateDialog} disabled={!groups.length}>
              <Plus className="h-4 w-4" />
              Add inbox
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <MailCheck className="h-4 w-4" />
          <AlertTitle>Group-owned visibility</AlertTitle>
          <AlertDescription>
            Each inbox belongs to one group. If incoming mail matches a contact
            hidden from that group, admins review the match from Admin, Contact
            Access Reviews.
          </AlertDescription>
        </Alert>

        {inboxError || groupsError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Unable to load inbox settings</AlertTitle>
            <AlertDescription>
              {(inboxError || groupsError)?.message}
            </AlertDescription>
          </Alert>
        ) : null}

        {inboxesLoading ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading inboxes
          </div>
        ) : inboxes.length === 0 ? (
          <div className="rounded-md border border-dashed p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-muted p-2">
                <MailPlus className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">No inbound inboxes configured</p>
                <p className="text-sm text-muted-foreground">
                  Add an IMAP inbox and assign it to a group to start importing
                  received email into contact history.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {inboxes.map((inbox) => {
              const status = getInboxStatus(inbox);
              const StatusIcon = status.icon;
              return (
                <div
                  key={inbox.id}
                  className="rounded-md border bg-background p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{inbox.name}</p>
                        <Badge variant="secondary" className={status.className}>
                          <StatusIcon className="mr-1 h-3.5 w-3.5" />
                          {status.label}
                        </Badge>
                        <Badge variant="outline">{inbox.groupName}</Badge>
                        <Badge variant="outline">
                          {inbox.outboundMode === "DISABLED"
                            ? "Replies disabled"
                            : `Replies via ${inbox.outboundMode === "SMTP" ? "SMTP" : "Scaleway"}`}
                        </Badge>
                      </div>
                      <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                        <span className="truncate">
                          {inbox.username}@{inbox.host}:{inbox.port}
                        </span>
                        <span>Mailbox: {inbox.mailbox}</span>
                        <span>{inbox.secure ? "TLS enabled" : "TLS off"}</span>
                        <span>
                          {inbox.allowCreateContacts
                            ? "Creates contacts"
                            : "Stores unknown senders"}
                        </span>
                      </div>
                      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                        <span>Last sync: {formatDate(inbox.lastSyncedAt)}</span>
                        <span>Last UID: {inbox.lastUid ?? "-"}</span>
                        <span>
                          Hidden matches:{" "}
                          {inbox.requireReviewForHiddenMatches
                            ? "review required"
                            : "auto-granted"}
                        </span>
                        <span>
                          Domains:{" "}
                          {inbox.allowedDomains.length > 0
                            ? inbox.allowedDomains.join(", ")
                            : "any"}
                        </span>
                        <span>
                          Reply from: {inbox.replyFromEmail ?? "not configured"}
                        </span>
                      </div>
                      {inbox.lastSyncError ? (
                        <p className="break-words text-sm text-destructive">
                          {inbox.lastSyncError}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runInboxAction(inbox, "test")}
                        disabled={busyInboxId !== null}
                      >
                        {busyInboxId === `test:${inbox.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        Test
                      </Button>
                      {inbox.outboundMode !== "DISABLED" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => runInboxAction(inbox, "test-outbound")}
                          disabled={busyInboxId !== null}
                        >
                          {busyInboxId === `test-outbound:${inbox.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MailCheck className="h-4 w-4" />
                          )}
                          Test sending
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runInboxAction(inbox, "sync")}
                        disabled={busyInboxId !== null || !inbox.isEnabled}
                      >
                        {busyInboxId === `sync:${inbox.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Sync now
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runInboxAction(inbox, "resync")}
                        disabled={busyInboxId !== null || !inbox.isEnabled}
                      >
                        {busyInboxId === `resync:${inbox.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Resync
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(inbox)}
                        disabled={busyInboxId !== null}
                      >
                        <Settings2 className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runInboxAction(inbox, "delete")}
                        disabled={busyInboxId !== null}
                      >
                        {busyInboxId === `delete:${inbox.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit inbox" : "Add inbox"}</DialogTitle>
            <DialogDescription>
              Configure IMAP access and choose the CRM group that owns imported
              conversations.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inbound-inbox-name">Inbox name</Label>
              <Input
                id="inbound-inbox-name"
                value={form.name}
                onChange={(event) => updateName(event.target.value)}
                placeholder="Support inbox"
              />
            </div>

            <div className="space-y-2">
              <Label>Group</Label>
              <Select
                value={form.groupId}
                onValueChange={(value) => updateForm("groupId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inbound-host">IMAP host</Label>
              <Input
                id="inbound-host"
                value={form.host}
                onChange={(event) => updateForm("host", event.target.value)}
                placeholder="imap.example.org"
              />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-2">
                <Label htmlFor="inbound-port">Port</Label>
                <Input
                  id="inbound-port"
                  inputMode="numeric"
                  value={form.port}
                  onChange={(event) => updateForm("port", event.target.value)}
                  placeholder="993"
                />
              </div>
              <div className="flex items-end pb-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.secure}
                    onCheckedChange={(checked) => updateForm("secure", checked)}
                  />
                  <Label>TLS</Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inbound-username">Username</Label>
              <Input
                id="inbound-username"
                value={form.username}
                onChange={(event) => updateUsername(event.target.value)}
                placeholder="support@example.org"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inbound-password">
                {isEditing ? "New password" : "Password"}
              </Label>
              <Input
                id="inbound-password"
                type="password"
                value={form.password}
                onChange={(event) => updateForm("password", event.target.value)}
                placeholder={isEditing ? "Leave empty to keep current" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inbound-mailbox">Mailbox folder</Label>
              <Input
                id="inbound-mailbox"
                value={form.mailbox}
                onChange={(event) => updateForm("mailbox", event.target.value)}
                placeholder="INBOX"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inbound-allowed-domains">Allowed domains</Label>
              <Input
                id="inbound-allowed-domains"
                value={form.allowedDomains}
                onChange={(event) =>
                  updateForm("allowedDomains", event.target.value)
                }
                placeholder="example.org, partner.org"
              />
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Outbound replies</p>
              <p className="text-sm text-muted-foreground">
                Choose how replies from this inbox are delivered.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Delivery method</Label>
                <Select
                  value={form.outboundMode}
                  onValueChange={updateOutboundMode}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DISABLED">Disabled</SelectItem>
                    <SelectItem value="SMTP">Dedicated SMTP</SelectItem>
                    <SelectItem value="SCALEWAY">Team Scaleway</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reply-from-email">Reply-from address</Label>
                <Input
                  id="reply-from-email"
                  type="email"
                  value={form.replyFromEmail}
                  onChange={(event) =>
                    updateForm("replyFromEmail", event.target.value)
                  }
                  placeholder="support@example.org"
                  disabled={form.outboundMode === "DISABLED"}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="reply-from-name">Sender name</Label>
                <Input
                  id="reply-from-name"
                  value={form.replyFromName}
                  onChange={(event) =>
                    updateForm("replyFromName", event.target.value)
                  }
                  placeholder="Support team"
                  disabled={form.outboundMode === "DISABLED"}
                />
              </div>
            </div>

            {form.outboundMode === "SMTP" ? (
              <div className="grid gap-4 rounded-md border bg-muted/20 p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">SMTP host</Label>
                  <Input
                    id="smtp-host"
                    value={form.smtpHost}
                    onChange={(event) =>
                      updateForm("smtpHost", event.target.value)
                    }
                    placeholder="smtp.example.org"
                  />
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="smtp-port">Port</Label>
                    <Input
                      id="smtp-port"
                      inputMode="numeric"
                      value={form.smtpPort}
                      onChange={(event) =>
                        updateForm("smtpPort", event.target.value)
                      }
                    />
                  </div>
                  <div className="flex items-end pb-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={form.smtpSecure}
                        onCheckedChange={(checked) =>
                          updateForm("smtpSecure", checked)
                        }
                      />
                      <Label>TLS</Label>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-username">SMTP username</Label>
                  <Input
                    id="smtp-username"
                    value={form.smtpUsername}
                    onChange={(event) =>
                      updateForm("smtpUsername", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-password">
                    {isEditing ? "New SMTP password" : "SMTP password"}
                  </Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    value={form.smtpPassword}
                    onChange={(event) =>
                      updateForm("smtpPassword", event.target.value)
                    }
                    placeholder={isEditing ? "Leave empty to keep current" : ""}
                  />
                </div>
              </div>
            ) : null}

            {form.outboundMode === "SCALEWAY" ? (
              <Alert>
                <MailCheck className="h-4 w-4" />
                <AlertTitle>Team Scaleway integration</AlertTitle>
                <AlertDescription>
                  The reply address domain must be authorized in the team&apos;s
                  Scaleway Transactional Email project.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border p-4">
              <div className="space-y-1 pr-4">
                <p className="font-medium">Auto-import visible matches</p>
                <p className="text-sm text-muted-foreground">
                  Add messages to contacts already visible to this group.
                </p>
              </div>
              <Switch
                checked={form.autoApproveExistingVisible}
                onCheckedChange={(checked) =>
                  updateForm("autoApproveExistingVisible", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-4">
              <div className="space-y-1 pr-4">
                <p className="font-medium">Review hidden matches</p>
                <p className="text-sm text-muted-foreground">
                  Queue admin review before adding this group to hidden
                  contacts.
                </p>
              </div>
              <Switch
                checked={form.requireReviewForHiddenMatches}
                onCheckedChange={(checked) =>
                  updateForm("requireReviewForHiddenMatches", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-4 sm:col-span-2">
              <div className="space-y-1 pr-4">
                <p className="font-medium">Create unknown contacts</p>
                <p className="text-sm text-muted-foreground">
                  Create a contact in this group when no existing sender match
                  is found.
                </p>
              </div>
              <Switch
                checked={form.allowCreateContacts}
                onCheckedChange={(checked) =>
                  updateForm("allowCreateContacts", checked)
                }
              />
            </div>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Permission effect</AlertTitle>
            <AlertDescription>
              Imported messages are owned by{" "}
              {selectedGroup?.name || "the selected group"}. Allowed domains
              restrict which senders can create contact history; leave the field
              empty to accept any sender domain. Hidden matches are either
              reviewed or auto-granted according to the policy above.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between rounded-md border p-4">
            <div>
              <p className="font-medium">Enable sync</p>
              <p className="text-sm text-muted-foreground">
                The background worker polls enabled inboxes automatically.
              </p>
            </div>
            <Switch
              checked={form.isEnabled}
              onCheckedChange={(checked) => updateForm("isEnabled", checked)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={saveInbox} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MailCheck className="h-4 w-4" />
              )}
              Save inbox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
