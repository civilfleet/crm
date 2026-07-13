"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Circle,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Search,
  Send,
  StickyNote,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  EngagementDirection,
  EngagementSource,
  type TodoStatus,
} from "@/types";

type InboxItem = {
  id: string;
  contactId: string;
  direction: EngagementDirection;
  source: EngagementSource;
  subject?: string;
  message: string;
  userName?: string;
  externalSource?: string;
  engagedAt: string;
  createdAt: string;
  todoStatus?: TodoStatus;
  isRead: boolean;
  contact: { id: string; name: string; email?: string };
  inboundEmail?: {
    id: string;
    emailInboxId: string;
    emailInboxName: string;
    replyFromEmail?: string;
    canReply: boolean;
    fromEmail: string;
    fromName?: string;
    mailbox: string;
  };
  emailInbox?: { name: string; replyFromEmail?: string };
};

type InboxResponse = {
  data: {
    items: InboxItem[];
    total: number;
    unreadCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok)
    throw new Error(payload.error ?? "Unable to load activity.");
  return payload;
};

const sourceLabels: Record<EngagementSource, string> = {
  EMAIL: "Email",
  PHONE: "Phone",
  SMS: "SMS",
  MEETING: "Meeting",
  EVENT: "Event",
  TODO: "Todo",
  NOTE: "Note",
  OTHER: "Other",
};

const sourceIcons: Record<EngagementSource, typeof Mail> = {
  EMAIL: Mail,
  PHONE: Phone,
  SMS: MessageSquare,
  MEETING: UserRound,
  EVENT: CalendarDays,
  TODO: CheckCheck,
  NOTE: StickyNote,
  OTHER: MoreHorizontal,
};

const containsHtml = (value: string) => /<\/?[a-z][\s\S]*>/i.test(value);
const previewText = (value: string, length = 180) => {
  const text = value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > length ? `${text.slice(0, length).trim()}...` : text;
};
const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

function SafeHtml({ html }: { html: string }) {
  return (
    <iframe
      title="Inbound email HTML body"
      sandbox=""
      referrerPolicy="no-referrer"
      className="h-[55vh] w-full rounded-md border bg-white"
      srcDoc={html}
    />
  );
}

export default function ActivityInbox({ teamId }: { teamId: string }) {
  const { toast } = useToast();
  const { mutate: mutateGlobal } = useSWRConfig();
  const [status, setStatus] = useState<"unread" | "all">("unread");
  const [page, setPage] = useState(1);
  const [source, setSource] = useState("all");
  const [direction, setDirection] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replySubject, setReplySubject] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const key = useMemo(() => {
    const params = new URLSearchParams({
      status,
      page: String(page),
      pageSize: "25",
    });
    if (source !== "all") params.set("source", source);
    if (direction !== "all") params.set("direction", direction);
    if (query) params.set("query", query);
    return `/api/teams/${teamId}/activity-inbox?${params}`;
  }, [direction, page, query, source, status, teamId]);
  const { data, error, isLoading, mutate } = useSWR<InboxResponse>(
    key,
    fetcher,
  );
  const result = data?.data;

  const refreshCount = () =>
    mutateGlobal(`/api/teams/${teamId}/activity-inbox/count`);

  const setReadState = async (item: InboxItem, isRead: boolean) => {
    const response = await fetch(
      `/api/teams/${teamId}/activity-inbox/${item.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead }),
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error ?? "Unable to update read state.");
    }
    setSelected((current) =>
      current?.id === item.id ? { ...current, isRead } : current,
    );
    await Promise.all([mutate(), refreshCount()]);
  };

  const openItem = async (item: InboxItem) => {
    setSelected(item);
    if (!item.isRead) {
      try {
        await setReadState(item, true);
      } catch (readError) {
        toast({
          title: "Unable to mark activity read",
          description:
            readError instanceof Error ? readError.message : undefined,
          variant: "destructive",
        });
      }
    }
  };

  const markAllRead = async () => {
    setIsMarkingAll(true);
    try {
      const response = await fetch(
        `/api/teams/${teamId}/activity-inbox/mark-all-read`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("Unable to mark all activity read.");
      await Promise.all([mutate(), refreshCount()]);
    } catch (markError) {
      toast({
        title: "Unable to mark all read",
        description: markError instanceof Error ? markError.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsMarkingAll(false);
    }
  };

  const openReply = () => {
    if (!selected?.inboundEmail?.canReply) return;
    setReplySubject(
      selected.subject?.toLowerCase().startsWith("re:")
        ? selected.subject
        : `Re: ${selected.subject ?? ""}`.trim(),
    );
    setReplyMessage("");
    setReplyOpen(true);
  };

  const sendReply = async () => {
    if (!selected?.inboundEmail || !replyMessage.trim()) return;
    setIsReplying(true);
    try {
      const response = await fetch(
        `/api/teams/${teamId}/email-inboxes/${selected.inboundEmail.emailInboxId}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inboundEmailMessageId: selected.inboundEmail.id,
            contactId: selected.contactId,
            subject: replySubject || undefined,
            message: replyMessage,
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(payload?.error ?? "Unable to send reply.");
      toast({
        title: "Reply sent",
        description: "The reply was added to the contact history.",
      });
      setReplyOpen(false);
      await mutate();
    } catch (replyError) {
      toast({
        title: "Reply failed",
        description:
          replyError instanceof Error ? replyError.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsReplying(false);
    }
  };

  return (
    <div className="min-w-0 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Activity Inbox</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              New engagement activity across the contacts you can access.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={markAllRead}
            disabled={isMarkingAll || !result?.unreadCount}
          >
            {isMarkingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            Mark all read
          </Button>
        </div>

        <div className="flex flex-col gap-3 border-y py-3 lg:flex-row lg:items-center">
          <div className="inline-flex h-9 w-fit items-center rounded-md border p-1">
            {(["unread", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`h-7 rounded px-3 text-sm font-medium ${status === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                {value === "unread"
                  ? `Unread${result ? ` (${result.unreadCount})` : ""}`
                  : "All"}
              </button>
            ))}
          </div>
          <form
            className="relative min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(searchInput.trim());
              setPage(1);
            }}
          >
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search contacts, subjects, or messages"
              className="pl-9"
            />
          </form>
          <Select
            value={source}
            onValueChange={(value) => {
              setSource(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full lg:w-40">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {Object.values(EngagementSource).map((value) => (
                <SelectItem key={value} value={value}>
                  {sourceLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={direction}
            onValueChange={(value) => {
              setDirection(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full lg:w-40">
              <SelectValue placeholder="Direction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All directions</SelectItem>
              <SelectItem value={EngagementDirection.INBOUND}>
                Inbound
              </SelectItem>
              <SelectItem value={EngagementDirection.OUTBOUND}>
                Outbound
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-h-80 overflow-hidden rounded-md border bg-card">
          {isLoading ? (
            <div className="flex h-80 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex h-80 items-center justify-center p-6 text-sm text-destructive">
              {error.message}
            </div>
          ) : result?.items.length ? (
            <div className="divide-y">
              {result.items.map((item) => {
                const Icon = sourceIcons[item.source];
                const DirectionIcon =
                  item.direction === EngagementDirection.INBOUND
                    ? ArrowDownLeft
                    : ArrowUpRight;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`grid w-full grid-cols-[auto_minmax(0,1fr)] gap-3 px-4 py-4 text-left hover:bg-muted/40 sm:grid-cols-[auto_minmax(10rem,0.7fr)_minmax(0,1.6fr)_auto] ${item.isRead ? "bg-background" : "bg-primary/[0.045]"}`}
                    onClick={() => openItem(item)}
                  >
                    <div className="relative mt-0.5 flex h-9 w-9 items-center justify-center rounded-md border bg-background">
                      <Icon className="h-4 w-4" />
                      {!item.isRead ? (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`truncate text-sm ${item.isRead ? "font-medium" : "font-semibold"}`}
                      >
                        {item.contact.name}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <DirectionIcon className="h-3.5 w-3.5" />
                        {sourceLabels[item.source]}
                      </div>
                    </div>
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <p
                        className={`truncate text-sm ${item.isRead ? "font-medium" : "font-semibold"}`}
                      >
                        {item.subject || sourceLabels[item.source]}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {previewText(item.message) || "No message content"}
                      </p>
                    </div>
                    <time className="col-span-2 whitespace-nowrap text-xs text-muted-foreground sm:col-span-1">
                      {formatDate(item.engagedAt)}
                    </time>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-80 flex-col items-center justify-center gap-2 px-6 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">
                {status === "unread" ? "You're caught up" : "No activity found"}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {status === "unread"
                  ? "New engagement activity will appear here."
                  : "Try changing the search or filters."}
              </p>
            </div>
          )}
        </div>

        {result && result.totalPages > 1 ? (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{result.total} activities</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>
                Page {page} of {result.totalPages}
              </span>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() =>
                  setPage((value) => Math.min(result.totalPages, value + 1))
                }
                disabled={page >= result.totalPages}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          {selected ? (
            <div className="space-y-6">
              <SheetHeader className="pr-8">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {sourceLabels[selected.source]}
                  </Badge>
                  <Badge variant="secondary">
                    {selected.direction === EngagementDirection.INBOUND
                      ? "Inbound"
                      : "Outbound"}
                  </Badge>
                </div>
                <SheetTitle className="text-xl">
                  {selected.subject || sourceLabels[selected.source]}
                </SheetTitle>
                <SheetDescription>
                  {selected.contact.name} - {formatDate(selected.engagedAt)}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-wrap gap-2 border-y py-3">
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/teams/${teamId}/crm/contacts/${selected.contact.id}`}
                  >
                    <UserRound className="h-4 w-4" />
                    Open contact
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReadState(selected, !selected.isRead)}
                >
                  <Circle className="h-4 w-4" />
                  Mark {selected.isRead ? "unread" : "read"}
                </Button>
                {selected.inboundEmail?.canReply ? (
                  <Button size="sm" onClick={openReply}>
                    <Send className="h-4 w-4" />
                    Reply
                  </Button>
                ) : null}
              </div>
              <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Contact</dt>
                <dd>{selected.contact.name}</dd>
                {selected.contact.email ? (
                  <>
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="break-all">{selected.contact.email}</dd>
                  </>
                ) : null}
                {selected.inboundEmail ? (
                  <>
                    <dt className="text-muted-foreground">Mailbox</dt>
                    <dd>{selected.inboundEmail.emailInboxName}</dd>
                    <dt className="text-muted-foreground">From</dt>
                    <dd className="break-all">
                      {selected.inboundEmail.fromName
                        ? `${selected.inboundEmail.fromName} <${selected.inboundEmail.fromEmail}>`
                        : selected.inboundEmail.fromEmail}
                    </dd>
                  </>
                ) : null}
                {selected.userName ? (
                  <>
                    <dt className="text-muted-foreground">Recorded by</dt>
                    <dd>{selected.userName}</dd>
                  </>
                ) : null}
              </dl>
              <div>
                {selected.inboundEmail && containsHtml(selected.message) ? (
                  <SafeHtml html={selected.message} />
                ) : (
                  <div className="whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-4 text-sm leading-6">
                    {selected.message}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Reply to email</DialogTitle>
            <DialogDescription>
              {selected?.inboundEmail
                ? `From ${selected.inboundEmail.replyFromEmail ?? selected.inboundEmail.emailInboxName} to ${selected.inboundEmail.fromEmail}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="activity-reply-subject">Subject</Label>
              <Input
                id="activity-reply-subject"
                value={replySubject}
                onChange={(event) => setReplySubject(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-reply-message">Message</Label>
              <Textarea
                id="activity-reply-message"
                rows={9}
                value={replyMessage}
                onChange={(event) => setReplyMessage(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReplyOpen(false)}
              disabled={isReplying}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={sendReply}
              disabled={isReplying || !replyMessage.trim()}
            >
              {isReplying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
