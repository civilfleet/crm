"use client";

import { format } from "date-fns";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Loader2,
  MessageSquare,
  Plus,
  StickyNote,
} from "lucide-react";
import React, { useState } from "react";
import useSWR from "swr";
import ContactEngagementForm from "@/components/forms/contact-engagement";
import { Loader } from "@/components/helper/loader";
import MentionText from "@/components/mention-text";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator, Separator as UiSeparator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_SUBMODULE_LABELS } from "@/constants/contact-submodules";
import { useToast } from "@/hooks/use-toast";
import {
  type ContactEngagement,
  EngagementDirection,
  EngagementSource,
  TodoStatus,
} from "@/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ContactEngagementHistoryProps {
  contactId: string;
  teamId: string;
  currentUser?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  };
}

type TeamUser = {
  id: string;
  name?: string | null;
  email: string;
};

type ZammadIntegrationResponse = {
  data?: {
    isEnabled?: boolean;
    hasApiKey?: boolean;
    baseUrl?: string;
  } | null;
};

type ZammadGroupsResponse = {
  data?: Array<{
    groupId: number;
    groupName: string;
    importEnabled: boolean;
  }>;
  error?: string;
};

const getSourceLabel = (source: EngagementSource, externalSource?: string) => {
  const normalizedExternal = externalSource?.toUpperCase() ?? "";
  switch (source) {
    case EngagementSource.EMAIL:
      if (normalizedExternal.startsWith("ZAMMAD:")) {
        return "Email - Zammad";
      }
      return externalSource ? `Email - ${externalSource}` : "Email";
    case EngagementSource.PHONE:
      return "Phone";
    case EngagementSource.SMS:
      return "SMS";
    case EngagementSource.MEETING:
      return "Meeting";
    case EngagementSource.EVENT:
      return "Event";
    case EngagementSource.TODO:
      return "Todo";
    case EngagementSource.NOTE:
      return "Note";
    case EngagementSource.OTHER:
      return "Other";
    default:
      return source;
  }
};

const getTodoStatusColor = (status?: TodoStatus) => {
  switch (status) {
    case TodoStatus.PENDING:
      return "bg-gray-100 text-gray-800 border-gray-200";
    case TodoStatus.IN_PROGRESS:
      return "bg-blue-100 text-blue-800 border-blue-200";
    case TodoStatus.COMPLETED:
      return "bg-green-100 text-green-800 border-green-200";
    case TodoStatus.CANCELLED:
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

const getTodoStatusLabel = (status?: TodoStatus) => {
  switch (status) {
    case TodoStatus.PENDING:
      return "Pending";
    case TodoStatus.IN_PROGRESS:
      return "In Progress";
    case TodoStatus.COMPLETED:
      return "Completed";
    case TodoStatus.CANCELLED:
      return "Cancelled";
    default:
      return status;
  }
};

const getTodoStatusIcon = (status?: TodoStatus) => {
  switch (status) {
    case TodoStatus.COMPLETED:
      return CheckCircle2;
    case TodoStatus.IN_PROGRESS:
      return Clock;
    default:
      return Circle;
  }
};

const getZammadTicketId = (externalSource?: string) => {
  if (!externalSource) return null;
  if (!externalSource.toUpperCase().startsWith("ZAMMAD:")) {
    return null;
  }
  const ticketId = externalSource.split(":")[1];
  return ticketId || null;
};

const isInboundImapEmail = (engagement: ContactEngagement) =>
  engagement.source === EngagementSource.EMAIL &&
  engagement.direction === EngagementDirection.INBOUND &&
  engagement.externalSource?.toUpperCase() === "IMAP";

const containsHtmlTag = (value?: string) =>
  Boolean(value && /<\/?[a-z][\s\S]*>/i.test(value));

type ParsedEngagementContent = {
  body: string;
  details: Array<{ label: string; value: string }>;
  additional: Array<{ label: string; value: string }>;
};

const parseEngagementContent = (message?: string): ParsedEngagementContent => {
  if (!message) {
    return { body: "", details: [], additional: [] };
  }

  const [firstBlock, ...rest] = message.split(/\n\s*\n/);
  const body = (firstBlock ?? "").trim();
  const detailsBlock = rest.join("\n\n").trim();

  const details: Array<{ label: string; value: string }> = [];
  const additional: Array<{ label: string; value: string }> = [];

  if (detailsBlock) {
    detailsBlock.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const [rawLabel, ...rawValue] = trimmed.split(":");
      const label = rawLabel.trim();
      const value = rawValue.join(":").trim();
      if (!label) return;
      if (label.startsWith("Additional - ")) {
        additional.push({
          label: label.replace("Additional - ", ""),
          value: value || "-",
        });
        return;
      }
      details.push({ label, value: value || "-" });
    });
  }

  return { body, details, additional };
};

const getPreviewText = (message?: string, maxLength = 140) => {
  if (!message) return "";
  const { body } = parseEngagementContent(message);
  const cleaned = body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trim()}…`;
};

function SafeEmailHtmlFrame({ html }: { html: string }) {
  return (
    <div className="rounded-lg border shadow-sm bg-white">
      <iframe
        title="Inbound email HTML body"
        sandbox=""
        referrerPolicy="no-referrer"
        className="h-96 w-full rounded-lg bg-white"
        srcDoc={html}
      />
    </div>
  );
}

type EngagementListItem =
  | { type: "single"; engagement: ContactEngagement }
  | { type: "thread"; ticketId: string; engagements: ContactEngagement[] };

const buildEngagementList = (
  engagements: ContactEngagement[],
): EngagementListItem[] => {
  const items: EngagementListItem[] = [];
  const threads = new Map<string, ContactEngagement[]>();

  for (const engagement of engagements) {
    const ticketId = getZammadTicketId(engagement.externalSource);
    if (!ticketId) {
      items.push({ type: "single", engagement });
      continue;
    }

    const existing = threads.get(ticketId);
    if (existing) {
      existing.push(engagement);
      continue;
    }

    const threadEngagements: ContactEngagement[] = [engagement];
    threads.set(ticketId, threadEngagements);
    items.push({
      type: "thread",
      ticketId,
      engagements: threadEngagements,
    });
  }

  return items;
};

const ZammadTicketDialog = React.memo(function ZammadTicketDialog({
  teamId,
  contactId,
  onCreated,
}: {
  teamId: string;
  contactId: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [isCreateTicketOpen, setIsCreateTicketOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [ticketGroupId, setTicketGroupId] = useState<number | null>(null);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);

  const { data: zammadIntegrationData } = useSWR<ZammadIntegrationResponse>(
    `/api/teams/${teamId}/integrations/zammad`,
    fetcher,
  );
  const zammadIntegration = zammadIntegrationData?.data;
  const isZammadConfigured = Boolean(
    zammadIntegration?.isEnabled &&
      zammadIntegration.hasApiKey &&
      zammadIntegration.baseUrl,
  );

  const { data: zammadGroupsData } = useSWR<ZammadGroupsResponse>(
    isZammadConfigured
      ? `/api/teams/${teamId}/integrations/zammad/groups`
      : null,
    fetcher,
  );
  const zammadGroups = Array.isArray(zammadGroupsData?.data)
    ? zammadGroupsData.data
    : [];
  const zammadGroupOptions = zammadGroups.filter(
    (group) => group.importEnabled,
  );

  if (!isZammadConfigured) {
    return null;
  }

  const handleCreateTicket = async () => {
    if (!ticketGroupId) {
      toast({
        title: "Select a Zammad group",
        description: "Choose the Zammad group for this ticket.",
        variant: "destructive",
      });
      return;
    }
    if (!ticketSubject.trim() || !ticketMessage.trim()) {
      toast({
        title: "Subject and message required",
        description: "Add both a subject and message to create the ticket.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingTicket(true);
    try {
      const response = await fetch(
        `/api/teams/${teamId}/integrations/zammad/tickets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId,
            groupId: ticketGroupId,
            subject: ticketSubject,
            message: ticketMessage,
          }),
        },
      );
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || response.statusText);
      }

      toast({
        title: "Zammad ticket created",
        description: "The ticket has been created and logged here.",
      });
      setIsCreateTicketOpen(false);
      setTicketSubject("");
      setTicketMessage("");
      setTicketGroupId(null);
      onCreated();
    } catch (error) {
      toast({
        title: "Failed to create ticket",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsCreatingTicket(false);
    }
  };

  return (
    <Dialog open={isCreateTicketOpen} onOpenChange={setIsCreateTicketOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full sm:w-auto">
          New Zammad Ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Zammad Ticket</DialogTitle>
          <DialogDescription>
            Start a new conversation in Zammad for this contact.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="zammad-ticket-group">Zammad group</Label>
            <select
              id="zammad-ticket-group"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={ticketGroupId ?? ""}
              onChange={(event) => setTicketGroupId(Number(event.target.value))}
            >
              <option value="" disabled>
                Select a group
              </option>
              {zammadGroupOptions.length === 0 && (
                <option value="" disabled>
                  No import-enabled groups configured
                </option>
              )}
              {zammadGroupOptions.map((group) => (
                <option key={group.groupId} value={group.groupId}>
                  {group.groupName}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Choose a group with import enabled.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="zammad-ticket-subject">Subject</Label>
            <Input
              id="zammad-ticket-subject"
              value={ticketSubject}
              onChange={(event) => setTicketSubject(event.target.value)}
              placeholder="Subject"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zammad-ticket-message">Message</Label>
            <Textarea
              id="zammad-ticket-message"
              value={ticketMessage}
              onChange={(event) => setTicketMessage(event.target.value)}
              placeholder="Write the opening message..."
              rows={6}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsCreateTicketOpen(false)}
              disabled={isCreatingTicket}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateTicket}
              disabled={isCreatingTicket}
            >
              {isCreatingTicket && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create ticket
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

function EngagementRow({
  engagement,
  showConnector,
  onReply,
  teamId,
  teamUsersByEmail,
  useHeader = false,
}: {
  engagement: ContactEngagement;
  showConnector: boolean;
  onReply: (engagement: ContactEngagement) => void;
  teamId: string;
  teamUsersByEmail: Map<string, TeamUser>;
  useHeader?: boolean;
}) {
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const renderAsInboundHtml = isInboundImapEmail(engagement);
  const parsed =
    engagement.source === EngagementSource.NOTE || renderAsInboundHtml
      ? null
      : parseEngagementContent(engagement.message);
  const previewText =
    engagement.source === EngagementSource.NOTE
      ? engagement.message
      : getPreviewText(engagement.message, 180);
  const fullText =
    engagement.source === EngagementSource.NOTE
      ? engagement.message
      : getPreviewText(engagement.message, Number.MAX_SAFE_INTEGER);
  const hasMoreContent = fullText !== previewText;

  const showIconColumn = !useHeader;

  return (
    <div className={showIconColumn ? "flex gap-4" : ""}>
      {showIconColumn && (
        <div className="flex flex-col items-center">
          {engagement.source === EngagementSource.TODO ? (
            <div
              className={`rounded-full p-2 ${
                engagement.todoStatus === TodoStatus.COMPLETED
                  ? "bg-green-100"
                  : engagement.todoStatus === TodoStatus.IN_PROGRESS
                    ? "bg-blue-100"
                    : "bg-amber-100"
              }`}
            >
              {(() => {
                const Icon = getTodoStatusIcon(engagement.todoStatus);
                return (
                  <Icon
                    className={`h-4 w-4 ${
                      engagement.todoStatus === TodoStatus.COMPLETED
                        ? "text-green-600"
                        : engagement.todoStatus === TodoStatus.IN_PROGRESS
                          ? "text-blue-600"
                          : "text-amber-600"
                    }`}
                  />
                );
              })()}
            </div>
          ) : engagement.source === EngagementSource.NOTE ? (
            <div className="rounded-full p-2 bg-emerald-100">
              <StickyNote className="h-4 w-4 text-emerald-600" />
            </div>
          ) : (
            <div
              className={`rounded-full p-2 ${
                engagement.direction === EngagementDirection.OUTBOUND
                  ? "bg-blue-100"
                  : "bg-green-100"
              }`}
            >
              {engagement.direction === EngagementDirection.OUTBOUND ? (
                <ArrowUpRight className="h-4 w-4 text-blue-600" />
              ) : (
                <ArrowDownLeft className="h-4 w-4 text-green-600" />
              )}
            </div>
          )}
          {showConnector && <div className="w-px h-full bg-border mt-2" />}
        </div>
      )}

      <div className={showIconColumn ? "flex-1 pb-4" : "pb-4"}>
        {useHeader && (
          <div className="mb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 uppercase tracking-wide">
                    {getSourceLabel(
                      engagement.source,
                      engagement.externalSource,
                    )}
                  </span>
                  {engagement.source === EngagementSource.TODO &&
                    engagement.todoStatus && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${getTodoStatusColor(engagement.todoStatus)}`}
                      >
                        {getTodoStatusLabel(engagement.todoStatus)}
                      </Badge>
                    )}
                  {engagement.source === EngagementSource.NOTE &&
                    engagement.restrictedToSubmodule && (
                      <Badge variant="outline" className="text-xs">
                        Restricted:{" "}
                        {
                          CONTACT_SUBMODULE_LABELS[
                            engagement.restrictedToSubmodule
                          ]
                        }
                      </Badge>
                    )}
                  {engagement.source !== EngagementSource.TODO &&
                    engagement.source !== EngagementSource.NOTE && (
                      <Badge
                        variant={
                          engagement.direction === EngagementDirection.OUTBOUND
                            ? "default"
                            : "secondary"
                        }
                        className="text-xs inline-flex items-center gap-1"
                      >
                        {engagement.direction ===
                        EngagementDirection.OUTBOUND ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownLeft className="h-3 w-3" />
                        )}
                        {engagement.direction === EngagementDirection.OUTBOUND
                          ? "Outbound"
                          : "Inbound"}
                      </Badge>
                    )}
                  {isInboundImapEmail(engagement) &&
                    engagement.inboundEmail && (
                      <Badge variant="outline" className="text-xs">
                        {engagement.inboundEmail.emailInboxName} /{" "}
                        {engagement.inboundEmail.mailbox}
                      </Badge>
                    )}
                  {engagement.direction === EngagementDirection.OUTBOUND &&
                    engagement.emailInbox && (
                      <Badge variant="outline" className="text-xs">
                        Sent via {engagement.emailInbox.name} /{" "}
                        {engagement.emailInbox.outboundMode === "SMTP"
                          ? "SMTP"
                          : "Scaleway"}
                      </Badge>
                    )}
                </div>
                <p className="text-base font-semibold">
                  {engagement.subject || "Engagement"}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {format(
                      new Date(
                        engagement.source === EngagementSource.NOTE
                          ? engagement.createdAt
                          : engagement.engagedAt,
                      ),
                      "PPp",
                    )}
                  </span>
                  {engagement.userName && <span>• {engagement.userName}</span>}
                  {isInboundImapEmail(engagement) &&
                    engagement.inboundEmail && (
                      <span>
                        • From{" "}
                        {engagement.inboundEmail.fromName
                          ? `${engagement.inboundEmail.fromName} `
                          : ""}
                        &lt;{engagement.inboundEmail.fromEmail}&gt;
                      </span>
                    )}
                  {engagement.direction === EngagementDirection.OUTBOUND &&
                    engagement.emailInbox?.replyFromEmail && (
                      <span>
                        • From &lt;{engagement.emailInbox.replyFromEmail}&gt;
                      </span>
                    )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {engagement.source === EngagementSource.EMAIL &&
                  (getZammadTicketId(engagement.externalSource) ||
                    (isInboundImapEmail(engagement) &&
                      engagement.inboundEmail?.canReply)) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => onReply(engagement)}
                    >
                      Reply
                    </Button>
                  )}
              </div>
            </div>
          </div>
        )}

        {useHeader ? (
          <div className="space-y-3">
            {isContentExpanded && renderAsInboundHtml ? (
              containsHtmlTag(engagement.message) ? (
                <SafeEmailHtmlFrame html={engagement.message} />
              ) : (
                <div className="rounded-md border bg-muted/20 px-3 py-3">
                  <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                    {engagement.message}
                  </p>
                </div>
              )
            ) : fullText ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                {engagement.source === EngagementSource.NOTE ? (
                  <MentionText
                    text={isContentExpanded ? fullText : previewText}
                    teamId={teamId}
                    usersByEmail={teamUsersByEmail}
                  />
                ) : isContentExpanded ? (
                  fullText
                ) : (
                  previewText
                )}
              </p>
            ) : null}
            {hasMoreContent ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setIsContentExpanded((expanded) => !expanded)}
                aria-expanded={isContentExpanded}
              >
                {isContentExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                {isContentExpanded ? "Collapse message" : "Show full message"}
              </Button>
            ) : null}
          </div>
        ) : engagement.source === EngagementSource.NOTE ? (
          <div className="rounded-lg border bg-emerald-50/40 px-4 py-4 space-y-2">
            <h4 className="text-sm font-semibold">
              {engagement.subject || "Internal note"}
            </h4>
            <div className="rounded-md border bg-background px-3 py-3">
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                <MentionText
                  text={engagement.message}
                  teamId={teamId}
                  usersByEmail={teamUsersByEmail}
                />
              </p>
            </div>
          </div>
        ) : renderAsInboundHtml ? (
          <div className="space-y-3">
            <div className="rounded-lg border shadow-sm bg-white">
              <div className="px-4 py-3 space-y-1">
                <h4 className="text-sm font-semibold">
                  Subject: {engagement.subject || "Email"}
                </h4>
                <p className="text-xs text-muted-foreground">
                  Imported via{" "}
                  {engagement.inboundEmail
                    ? `${engagement.inboundEmail.emailInboxName} / ${engagement.inboundEmail.mailbox}`
                    : "IMAP"}
                </p>
              </div>
              <UiSeparator />
              <div className="bg-muted/40 px-4 py-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  Message
                </p>
                {containsHtmlTag(engagement.message) ? (
                  <SafeEmailHtmlFrame html={engagement.message} />
                ) : (
                  <div className="rounded-md border bg-background px-3 py-3">
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                      {engagement.message}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          (() => {
            if (!parsed) {
              return null;
            }
            const metric =
              parsed.details.find((d) => d.label.toLowerCase() === "metric")
                ?.value ?? undefined;
            return (
              <div className="space-y-3">
                <div className="rounded-lg border shadow-sm bg-white">
                  <div className="px-4 py-3 space-y-1">
                    <h4 className="text-sm font-semibold">
                      Subject: {engagement.subject || "Email"}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      To:{" "}
                      {parsed.details.find((d) =>
                        d.label.toLowerCase().includes("recipient"),
                      )?.value || "Unknown"}
                    </p>
                    {metric && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Event
                        </span>
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 border border-blue-100">
                          {metric}
                        </span>
                      </div>
                    )}
                  </div>

                  <UiSeparator />

                  {parsed.body && (
                    <div className="bg-muted/40 px-4 py-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                        Message
                      </p>
                      <div className="rounded-md border bg-background px-3 py-3">
                        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                          {parsed.body}
                        </p>
                      </div>
                    </div>
                  )}

                  {(() => {
                    const combinedAdditional = [
                      ...parsed.details.filter(
                        (d) =>
                          !d.label.toLowerCase().includes("recipient") &&
                          d.label.toLowerCase() !== "subject",
                      ),
                      ...parsed.additional,
                    ];
                    if (combinedAdditional.length === 0) return null;
                    return (
                      <>
                        <UiSeparator />
                        <div className="px-4 py-3 space-y-3">
                          <Collapsible>
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-3"
                              >
                                Show details
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2 rounded-md border bg-muted/20 px-3 py-2 space-y-2">
                              {combinedAdditional.map((item) => (
                                <div key={`${engagement.id}-add-${item.label}`}>
                                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                    {item.label}
                                  </p>
                                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                                    {item.value}
                                  </p>
                                </div>
                              ))}
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })()
        )}

        {engagement.source === EngagementSource.TODO && (
          <div className="mt-2 flex flex-col gap-1">
            {engagement.assignedToUserName && (
              <p className="text-xs text-muted-foreground">
                Assigned to: {engagement.assignedToUserName}
              </p>
            )}
            {engagement.dueDate && (
              <p className="text-xs text-muted-foreground">
                Due: {format(new Date(engagement.dueDate), "PPp")}
              </p>
            )}
          </div>
        )}

        {!useHeader && engagement.userName && (
          <p className="text-xs text-muted-foreground mt-2">
            {engagement.source === EngagementSource.TODO ||
            engagement.source === EngagementSource.NOTE
              ? "Created by"
              : "By"}
            : {engagement.userName}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ContactEngagementHistory({
  contactId,
  teamId,
  currentUser,
}: ContactEngagementHistoryProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{
    kind: "zammad" | "inbox";
    ticketId?: string;
    inboxId?: string;
    inboundEmailMessageId?: string;
    from?: string;
    to?: string;
    subject: string;
  } | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(
    () => new Set(),
  );

  const { data, error, isLoading, mutate } = useSWR(
    `/api/contact-engagements?contactId=${contactId}&teamId=${teamId}`,
    fetcher,
  );
  const { data: teamUsersData } = useSWR(`/api/teams/${teamId}/users`, fetcher);

  const engagements = (data?.data || []) as ContactEngagement[];
  const teamUsers = ((teamUsersData?.data || []) as TeamUser[]).filter((user) =>
    Boolean(user.email),
  );
  const teamUsersByEmail = React.useMemo(
    () => new Map(teamUsers.map((user) => [user.email.toLowerCase(), user])),
    [teamUsers],
  );
  const engagementItems = React.useMemo(
    () => buildEngagementList(engagements),
    [engagements],
  );

  const handleSuccess = () => {
    mutate();
    setIsDialogOpen(false);
  };

  const handleReplyOpen = (engagement: ContactEngagement) => {
    const ticketId = getZammadTicketId(engagement.externalSource);
    if (ticketId) {
      setReplyTarget({
        kind: "zammad",
        ticketId,
        subject: engagement.subject || "Zammad ticket update",
      });
      setReplySubject(engagement.subject || "Zammad ticket update");
      setReplyMessage("");
      return;
    }

    if (isInboundImapEmail(engagement) && engagement.inboundEmail?.canReply) {
      const baseSubject = engagement.subject || "Email reply";
      const replySubject = /^re:/i.test(baseSubject)
        ? baseSubject
        : `Re: ${baseSubject}`;
      setReplyTarget({
        kind: "inbox",
        inboxId: engagement.inboundEmail.emailInboxId,
        inboundEmailMessageId: engagement.inboundEmail.id,
        from: engagement.inboundEmail.replyFromEmail,
        to: engagement.inboundEmail.fromEmail,
        subject: replySubject,
      });
      setReplySubject(replySubject);
      setReplyMessage("");
      return;
    }

    toast({
      title: "Unable to reply",
      description: "This email does not have an available reply identity.",
      variant: "destructive",
    });
  };

  const handleReplyClose = () => {
    setReplyTarget(null);
    setReplyMessage("");
    setReplySubject("");
  };

  const handleReplySubmit = async () => {
    if (!replyTarget) return;
    if (!replyMessage.trim()) {
      toast({
        title: "Message required",
        description: "Add a reply before sending.",
        variant: "destructive",
      });
      return;
    }

    setIsReplying(true);
    try {
      const isInboxReply = replyTarget.kind === "inbox";
      const response = await fetch(
        isInboxReply
          ? `/api/teams/${teamId}/email-inboxes/${replyTarget.inboxId}/reply`
          : `/api/teams/${teamId}/integrations/zammad/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isInboxReply
              ? { inboundEmailMessageId: replyTarget.inboundEmailMessageId }
              : { ticketId: replyTarget.ticketId }),
            message: replyMessage,
            subject: replySubject || undefined,
            contactId,
          }),
        },
      );

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || response.statusText);
      }

      toast({
        title: "Reply sent",
        description: isInboxReply
          ? "Your email was sent and logged here."
          : "Your response was sent to Zammad and logged here.",
      });
      handleReplyClose();
      mutate();
    } catch (error) {
      toast({
        title: "Failed to send reply",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsReplying(false);
    }
  };

  const handleTicketCreated = () => {
    mutate();
  };

  const toggleThread = (ticketId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) {
        next.delete(ticketId);
      } else {
        next.add(ticketId);
      }
      return next;
    });
  };

  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="border-b pb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-xl font-semibold">
              Engagement History
            </CardTitle>
            <CardDescription>
              Track all interactions with this contact
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <ZammadTicketDialog
              teamId={teamId}
              contactId={contactId}
              onCreated={handleTicketCreated}
            />
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  Record Engagement
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Record New Engagement</DialogTitle>
                  <DialogDescription>
                    Log a new interaction or communication with this contact
                  </DialogDescription>
                </DialogHeader>
                <ContactEngagementForm
                  contactId={contactId}
                  teamId={teamId}
                  onSuccess={handleSuccess}
                  currentUser={currentUser}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <Loader className="h-6 w-6 text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Failed to load engagement history
          </div>
        ) : engagements.length === 0 ? (
          <div className="text-center py-8 rounded-md border border-dashed">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No engagements recorded yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Click &quot;Record Engagement&quot; to add your first interaction
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {engagementItems.map((item, index) => {
              if (item.type === "single") {
                return (
                  <div key={item.engagement.id}>
                    <div className="rounded-xl border bg-white shadow-sm p-4">
                      <EngagementRow
                        engagement={item.engagement}
                        showConnector={false}
                        onReply={handleReplyOpen}
                        teamId={teamId}
                        teamUsersByEmail={teamUsersByEmail}
                        useHeader
                      />
                    </div>
                    {index < engagementItems.length - 1 && <Separator />}
                  </div>
                );
              }

              const latest = item.engagements[0];
              const isExpanded = expandedThreads.has(item.ticketId);
              const latestTimestamp = latest
                ? format(
                    new Date(
                      latest.source === EngagementSource.NOTE
                        ? latest.createdAt
                        : latest.engagedAt,
                    ),
                    "PPp",
                  )
                : null;
              const latestPreview = latest
                ? getPreviewText(latest.message)
                : "";
              const latestBy = latest?.userName || "Unknown sender";
              return (
                <div
                  key={`thread-${item.ticketId}`}
                  className="rounded-xl border bg-white shadow-sm"
                >
                  <div className="flex flex-col gap-3 border-b bg-muted/10 px-4 py-3 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => toggleThread(item.ticketId)}
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 uppercase tracking-wide">
                            Thread ({item.engagements.length} messages)
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Ticket #{item.ticketId}
                          </span>
                        </div>
                        <p className="text-base font-semibold">
                          {latest?.subject || "Zammad ticket update"}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {latestTimestamp && <span>{latestTimestamp}</span>}
                          <span>• Last by {latestBy}</span>
                        </div>
                        {latestPreview && (
                          <p className="text-sm text-muted-foreground">
                            {latestPreview}
                          </p>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => toggleThread(item.ticketId)}
                      >
                        {isExpanded ? "Collapse" : "Open thread"}
                      </Button>
                      {latest ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleReplyOpen(latest)}
                        >
                          Reply
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="space-y-4 p-4">
                      {item.engagements.map((engagement, idx) => (
                        <div
                          key={engagement.id}
                          className="rounded-lg border bg-white shadow-sm px-4 py-3"
                        >
                          <EngagementRow
                            engagement={engagement}
                            showConnector={idx < item.engagements.length - 1}
                            onReply={handleReplyOpen}
                            teamId={teamId}
                            teamUsersByEmail={teamUsersByEmail}
                            useHeader
                          />
                          {idx < item.engagements.length - 1 && (
                            <Separator className="mt-4" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {index < engagementItems.length - 1 && <Separator />}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog
        open={Boolean(replyTarget)}
        onOpenChange={(open) => {
          if (!open) {
            handleReplyClose();
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {replyTarget?.kind === "inbox"
                ? "Reply by email"
                : "Reply to Zammad ticket"}
            </DialogTitle>
            <DialogDescription>
              Send a response that will also be logged in engagement history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {replyTarget?.kind === "inbox" ? (
              <div className="grid gap-3 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">From</p>
                  <p className="truncate font-medium">{replyTarget.from}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">To</p>
                  <p className="truncate font-medium">{replyTarget.to}</p>
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email-reply-subject">Subject</Label>
              <Input
                id="email-reply-subject"
                value={replySubject}
                onChange={(event) => setReplySubject(event.target.value)}
                placeholder="Subject"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-reply-message">Message</Label>
              <Textarea
                id="email-reply-message"
                value={replyMessage}
                onChange={(event) => setReplyMessage(event.target.value)}
                placeholder="Write your reply..."
                rows={6}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                type="button"
                onClick={handleReplyClose}
                disabled={isReplying}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleReplySubmit}
                disabled={isReplying}
              >
                {isReplying && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Send reply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
